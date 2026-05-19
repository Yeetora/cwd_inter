#!/bin/bash
# 채우다 EC2 부트스트랩 스크립트 (Amazon Linux 2023 ARM64 기준)
# 실행 시점: EC2 최초 부팅 1회
# 이 스크립트는 패키지 설치까지만 담당. 애플리케이션 배포는 CI/CD 파이프라인에서 진행.

set -euxo pipefail
exec > >(tee /var/log/user-data.log) 2>&1

dnf update -y

# Java 21 (Amazon Corretto)
dnf install -y java-21-amazon-corretto-headless

# Node 24 (NodeSource RPM)
curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -
dnf install -y nodejs

# MySQL 8 (mariadb 호환 패키지 대신 MySQL Community)
dnf install -y mariadb105-server  # AL2023 기본; 채우다는 8.x 권장이지만 우선 가능한 패키지로
systemctl enable --now mariadb

# Nginx (리버스 프록시)
dnf install -y nginx
systemctl enable --now nginx

# 디렉터리 구조 마련
mkdir -p /opt/chaeuda/backend
mkdir -p /opt/chaeuda/frontend
mkdir -p /opt/chaeuda/env
chown -R ec2-user:ec2-user /opt/chaeuda

# CloudWatch agent (선택사항, 추후 추가)
# dnf install -y amazon-cloudwatch-agent

# Nginx 기본 설정 — 추후 CI/CD에서 덮어쓰기
cat > /etc/nginx/conf.d/chaeuda.conf <<'NGINX'
server {
    listen 80;
    server_name _;

    # 큰 이미지 업로드 대응
    client_max_body_size 60M;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

systemctl reload nginx

echo "Bootstrap complete." > /tmp/bootstrap.done
