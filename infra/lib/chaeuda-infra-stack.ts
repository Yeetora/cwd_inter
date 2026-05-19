import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as fs from 'fs';
import * as path from 'path';

export interface ChaeudaInfraStackProps extends cdk.StackProps {
  /** 운영 도메인 (Route 53 추가는 별도 PR) */
  readonly domainName?: string;
}

/**
 * 채우다 by design — 단일 EC2 운영 인프라 (비용 최소화)
 *
 * 구성:
 *  - VPC: 새로 생성, 1 AZ public-only subnet (NAT 게이트웨이 비용 절감)
 *  - S3: 업로드 이미지 버킷 (private, EC2 IAM Role에서만 접근)
 *  - EC2: t4g.small (ARM, ~$15/월), EBS gp3 30GB
 *  - IAM Role: SSM 관리 + S3 R/W 권한
 *  - SG: 80/443/22 인바운드
 *
 * 미포함 (별도 PR):
 *  - RDS (현재는 EC2 내부 MySQL — 추후 분리 시 RDS db.t4g.micro)
 *  - Route 53 + ACM HTTPS
 *  - CloudWatch 알람
 *  - 자동 백업 정책
 */
export class ChaeudaInfraStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly uploadsBucket: s3.IBucket;
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: ChaeudaInfraStackProps = {}) {
    super(scope, id, props);

    // ── VPC ────────────────────────────────────────────
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 1,            // 비용 최소화 — 단일 AZ
      natGateways: 0,        // NAT $$$, 안 씀 — public subnet에 직접 배치
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // ── S3 Bucket (uploads) ────────────────────────────
    this.uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,  // 스택 삭제 시에도 버킷·이미지 보존
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],            // 추후 도메인 화이트리스트로 좁힘
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
    });

    // ── IAM Role for EC2 ───────────────────────────────
    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: '채우다 EC2 인스턴스용 — S3 R/W + SSM Session Manager',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });
    // 업로드 버킷 R/W 권한
    this.uploadsBucket.grantReadWrite(instanceRole);
    // (선택) Parameter Store에서 시크릿 읽기
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/chaeuda/*`,
        ],
      }),
    );

    // ── Security Group ─────────────────────────────────
    const sg = new ec2.SecurityGroup(this, 'AppServerSG', {
      vpc: this.vpc,
      description: '채우다 app server — 80/443 공개, 22는 비상시',
      allowAllOutbound: true,
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH (비상용, 평상시 SSM 사용)');

    // ── User Data ──────────────────────────────────────
    const userDataScript = fs.readFileSync(
      path.join(__dirname, 'assets/user-data.sh'),
      'utf-8',
    );
    const userData = ec2.UserData.forLinux();
    userData.addCommands(userDataScript);

    // ── EC2 Instance ───────────────────────────────────
    this.instance = new ec2.Instance(this, 'AppServer', {
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(30, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: false,   // 종료 시에도 데이터 보존
            encrypted: true,
          }),
        },
      ],
      securityGroup: sg,
      role: instanceRole,
      userData,
      requireImdsv2: true,
    });

    // ── Elastic IP ─────────────────────────────────────
    const eip = new ec2.CfnEIP(this, 'AppServerEIP', {
      domain: 'vpc',
      instanceId: this.instance.instanceId,
    });

    // ── Outputs ────────────────────────────────────────
    new cdk.CfnOutput(this, 'InstanceId', {
      value: this.instance.instanceId,
      description: 'SSM 접속: aws ssm start-session --target {InstanceId}',
    });
    new cdk.CfnOutput(this, 'PublicIp', {
      value: eip.ref,
      description: 'Elastic IP — 도메인 A 레코드 대상',
    });
    new cdk.CfnOutput(this, 'UploadsBucketName', {
      value: this.uploadsBucket.bucketName,
      description: '백엔드 환경변수 S3_BUCKET에 설정',
    });
    new cdk.CfnOutput(this, 'UploadsBucketRegion', {
      value: this.region,
    });
  }
}
