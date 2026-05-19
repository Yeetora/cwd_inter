#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { ChaeudaInfraStack } from '../lib/chaeuda-infra-stack';

const app = new cdk.App();

const region = process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2';
const account = process.env.CDK_DEFAULT_ACCOUNT;

new ChaeudaInfraStack(app, 'ChaeudaInfraStack', {
  env: { account, region },
  description: '채우다 by design — 단일 EC2 + S3 + RDS-less 운영 인프라',
});
