#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { ChaeudaInfraStack } from '../lib/chaeuda-infra-stack';

const app = new cdk.App();

const region = process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const domainName = app.node.tryGetContext('domainName') ?? 'chaeuda.co.kr';

new ChaeudaInfraStack(app, 'ChaeudaInfraStack', {
  env: { account, region },
  description: 'Chaeuda by design - single EC2 + S3 + RDS-less infrastructure',
  domainName,
});
