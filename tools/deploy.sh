#!/usr/bin/env bash
# 실제 서버(Oracle)에 게임을 올리는 스크립트
# 사용법 (Git Bash): bash tools/deploy.sh
# - 지금 커밋된 내용(HEAD)만 올린다. 커밋하지 않은 수정은 올라가지 않는다.
# - SSH 키 위치가 다르면 DEPLOY_KEY 환경 변수로 지정한다.
set -euo pipefail

HOST="${DEPLOY_HOST:-ubuntu@161.33.17.35}"
KEY="${DEPLOY_KEY:-$USERPROFILE/.ssh/class-village.key}"
SSH="ssh"
# 윈도우에서는 키 권한 확인이 맞는 윈도우 기본 SSH를 쓴다
if [ -x /c/Windows/System32/OpenSSH/ssh.exe ]; then
  SSH=/c/Windows/System32/OpenSSH/ssh.exe
  KEY="$(cygpath -w "$KEY" 2>/dev/null || echo "$KEY")"
fi
REMOTE_DIR=/opt/class-village
cd "$(dirname "$0")/.."

echo "▶ 커밋 $(git rev-parse --short HEAD) 를 서버로 보냅니다"
git archive --format=tar HEAD client server shared package.json package-lock.json \
  | "$SSH" -i "$KEY" -o BatchMode=yes "$HOST" "
    set -e
    sudo mkdir -p $REMOTE_DIR && sudo chown ubuntu:ubuntu $REMOTE_DIR
    rm -rf $REMOTE_DIR/.next && mkdir -p $REMOTE_DIR/.next
    tar -x -C $REMOTE_DIR/.next
    cd $REMOTE_DIR/.next
    npm ci --no-audit --no-fund --loglevel=error
    npx vite build client --logLevel warn
    cd $REMOTE_DIR
    rm -rf client server shared package.json package-lock.json node_modules
    mv .next/* . && rm -rf .next
    sudo systemctl restart class-village
    sleep 2
    systemctl is-active class-village
  "
echo "▶ 완료: https://class-village.duckdns.org"
