#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { ChaeudaInfraStack } from '../lib/chaeuda-infra-stack';
import { ChaeudaCertStack } from '../lib/chaeuda-cert-stack';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const primaryRegion = process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2';
const domainName: string | undefined = app.node.tryGetContext('domainName') ?? 'chaeuda.co.kr';
const hostedZoneId: string | undefined = app.node.tryGetContext('hostedZoneId');

// 인증서 스택은 us-east-1 (CloudFront 요구사항).
// Phase 2에선 hostedZoneId를 context로 넘겨서 ACM이 DNS 검증을 자동 수행하도록 함.
let certStack: ChaeudaCertStack | undefined;
if (domainName && hostedZoneId) {
  certStack = new ChaeudaCertStack(app, 'ChaeudaCertStack', {
    env: { account, region: 'us-east-1' },
    description: 'Chaeuda by design - ACM certificate (us-east-1 for CloudFront)',
    crossRegionReferences: true,
    domainName,
    hostedZoneId,
  });
}

new ChaeudaInfraStack(app, 'ChaeudaInfraStack', {
  env: { account, region: primaryRegion },
  description: 'Chaeuda by design - single EC2 + S3 + Route 53 + CloudFront',
  crossRegionReferences: true,
  domainName,
  certificateArn: certStack?.certificate.certificateArn,
});
