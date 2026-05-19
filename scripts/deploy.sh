#!/usr/bin/env bash
# 채우다 수동 배포 스크립트 (로컬에서 실행)
#
# 흐름:
#   1) backend jar 빌드
#   2) frontend standalone 빌드
#   3) 아티팩트 tarball을 S3 deploy 버킷에 업로드
#      (uploads 버킷이 아닌 별도 prefix 사용: deploy/...)
#   4) SSM Send Command로 EC2에서 deploy-on-ec2.sh 실행
#
# 필요: aws CLI 설정 완료, INSTANCE_ID, BUCKET_NAME 환경변수
#
# 사용:
#   INSTANCE_ID=i-xxx UPLOADS_BUCKET=chaeuda-... ./scripts/deploy.sh
#
# 또는 CloudFormation에서 자동 조회:
#   ./scripts/deploy.sh

set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

# ── 환경변수 또는 CloudFormation에서 자동 조회 ──
STACK_NAME="${STACK_NAME:-ChaeudaInfraStack}"
REGION="${AWS_REGION:-ap-northeast-2}"

if [[ -z "${INSTANCE_ID:-}" ]]; then
  echo "▶ Looking up InstanceId from $STACK_NAME"
  INSTANCE_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" \
    --output text)
fi

if [[ -z "${UPLOADS_BUCKET:-}" ]]; then
  echo "▶ Looking up UploadsBucketName from $STACK_NAME"
  UPLOADS_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='UploadsBucketName'].OutputValue" \
    --output text)
fi

echo "InstanceId      = $INSTANCE_ID"
echo "UploadsBucket   = $UPLOADS_BUCKET"
echo

# ── 1) backend ───────────────────────────────────────
echo "▶ Building backend (Spring Boot bootJar)"
(cd backend && ./gradlew bootJar --no-daemon)
BACKEND_JAR=$(ls backend/build/libs/*.jar | head -1)
echo "  jar: $BACKEND_JAR"

# ── 2) frontend ──────────────────────────────────────
echo "▶ Building frontend (Next.js standalone)"
(cd frontend && npm ci --no-audit --no-fund && NEXT_PUBLIC_API_BASE="" npm run build)

# Next.js standalone 생성물 패키징 (server.js + minimal node_modules + public + .next/static)
echo "▶ Packaging frontend standalone bundle"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
STAGE_DIR="$(mktemp -d)"
mkdir -p "$STAGE_DIR/frontend"
cp -R "$FRONTEND_DIR/.next/standalone/." "$STAGE_DIR/frontend/"
mkdir -p "$STAGE_DIR/frontend/.next"
cp -R "$FRONTEND_DIR/.next/static" "$STAGE_DIR/frontend/.next/static"
if [[ -d "$FRONTEND_DIR/public" ]]; then
  cp -R "$FRONTEND_DIR/public" "$STAGE_DIR/frontend/public"
fi

# tarball
ARTIFACT_DIR="$(mktemp -d)"
BACKEND_TAR="$ARTIFACT_DIR/backend.tar.gz"
FRONTEND_TAR="$ARTIFACT_DIR/frontend.tar.gz"
tar -czf "$BACKEND_TAR" -C "$(dirname "$BACKEND_JAR")" "$(basename "$BACKEND_JAR")"
tar -czf "$FRONTEND_TAR" -C "$STAGE_DIR" frontend

# ── 3) S3 업로드 ──────────────────────────────────────
TS=$(date +%Y%m%d-%H%M%S)
S3_BACKEND="s3://$UPLOADS_BUCKET/deploy/$TS/backend.tar.gz"
S3_FRONTEND="s3://$UPLOADS_BUCKET/deploy/$TS/frontend.tar.gz"

echo "▶ Uploading artifacts to S3"
aws s3 cp "$BACKEND_TAR" "$S3_BACKEND" --region "$REGION"
aws s3 cp "$FRONTEND_TAR" "$S3_FRONTEND" --region "$REGION"
echo "  $S3_BACKEND"
echo "  $S3_FRONTEND"

# ── 4) SSM Send Command ──────────────────────────────
echo "▶ Triggering deploy on EC2 via SSM"
CMD_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --region "$REGION" \
  --comment "chaeuda deploy $TS" \
  --parameters "commands=[
    'set -e',
    'sudo mkdir -p /opt/chaeuda/scripts',
    'sudo aws s3 cp $S3_BACKEND /tmp/backend.tar.gz --region $REGION',
    'sudo aws s3 cp $S3_FRONTEND /tmp/frontend.tar.gz --region $REGION',
    'sudo tar -xzf /tmp/backend.tar.gz -C /opt/chaeuda/backend/',
    'sudo find /opt/chaeuda/backend -maxdepth 1 -name \"*.jar\" -exec mv {} /opt/chaeuda/backend/app.jar \\;',
    'sudo rm -rf /opt/chaeuda/frontend/* /opt/chaeuda/frontend/.next || true',
    'sudo tar -xzf /tmp/frontend.tar.gz -C /tmp/',
    'sudo cp -R /tmp/frontend/. /opt/chaeuda/frontend/',
    'sudo chown -R ec2-user:ec2-user /opt/chaeuda/backend /opt/chaeuda/frontend',
    'sudo systemctl restart chaeuda-backend chaeuda-frontend',
    'sudo systemctl status chaeuda-backend --no-pager | head -20',
    'sudo systemctl status chaeuda-frontend --no-pager | head -20'
  ]" \
  --query "Command.CommandId" \
  --output text)

echo "  CommandId: $CMD_ID"
echo "▶ Waiting for completion..."

aws ssm wait command-executed --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --region "$REGION"

STATUS=$(aws ssm get-command-invocation \
  --command-id "$CMD_ID" \
  --instance-id "$INSTANCE_ID" \
  --region "$REGION" \
  --query "Status" --output text)

echo "▶ Deploy status: $STATUS"

if [[ "$STATUS" != "Success" ]]; then
  echo "❌ Deploy failed. Fetching stdout/stderr:"
  aws ssm get-command-invocation \
    --command-id "$CMD_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query "StandardErrorContent" --output text
  exit 1
fi

echo "✅ Deploy completed at $TS"

# 정리
rm -rf "$STAGE_DIR" "$ARTIFACT_DIR"
