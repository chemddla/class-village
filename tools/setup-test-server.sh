#!/usr/bin/env bash
# 실제 서버(Oracle)에 동시 작업용 테스트판을 만든다 (한 번만 실행하면 됨, 다시 실행해도 안전)
# 사용법 (Git Bash): bash tools/setup-test-server.sh
#
# - 주소: https://test.class-village.duckdns.org  (실제 수업 서버 https://class-village.duckdns.org 와 따로)
# - 게임 서버: class-village-test 서비스, 포트 2577 (/opt/class-village-test)
# - 웹 서버(Caddy) 설정 끝에 테스트판 주소 하나를 덧붙인다. 원래 설정은 Caddyfile.bak-날짜 로 남겨 둔다.
#   설정 검사를 통과할 때만 적용하므로 실제 수업 서버 주소는 그대로 동작한다.
# - 만든 뒤 내용은 이 컴퓨터의 동시 작업용 상시 서버(tools/live-server.cjs --main --deploy-test)가
#   원격 main이 바뀔 때마다 올려 준다. 처음 한 번은: DEPLOY_TARGET=test DEPLOY_REF=origin/main bash tools/deploy.sh
set -euo pipefail

HOST="${DEPLOY_HOST:-ubuntu@161.33.17.35}"
KEY="${DEPLOY_KEY:-$USERPROFILE/.ssh/class-village.key}"
SSH="ssh"
if [ -x /c/Windows/System32/OpenSSH/ssh.exe ]; then
  SSH=/c/Windows/System32/OpenSSH/ssh.exe
  KEY="$(cygpath -w "$KEY" 2>/dev/null || echo "$KEY")"
fi

"$SSH" -i "$KEY" -o BatchMode=yes "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
sudo mkdir -p /opt/class-village-test && sudo chown ubuntu:ubuntu /opt/class-village-test

sudo tee /etc/systemd/system/class-village-test.service >/dev/null <<'EOF'
[Unit]
Description=Class Village test server (follows origin/main)
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/class-village-test
Environment=NODE_ENV=production
Environment=GAME_PORT=2577
Environment=FREE_LOOK=1
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable class-village-test >/dev/null 2>&1

if ! grep -q '^test.class-village.duckdns.org' /etc/caddy/Caddyfile; then
  backup="/etc/caddy/Caddyfile.bak-$(date +%Y%m%d%H%M%S)"
  sudo cp /etc/caddy/Caddyfile "$backup"
  sudo tee -a /etc/caddy/Caddyfile >/dev/null <<'EOF'

# 동시 작업용 테스트판: 원격 main을 따라간다 (게임 서버 2577)
test.class-village.duckdns.org {
	encode zstd gzip

	handle_path /colyseus/* {
		reverse_proxy localhost:2577
	}

	handle {
		root * /opt/class-village-test/client/dist
		@assets path /assets/*
		header @assets Cache-Control "public, max-age=31536000, immutable"
		file_server
	}
}
EOF
  if ! sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    sudo cp "$backup" /etc/caddy/Caddyfile
    echo "웹 서버 설정 검사 실패 → 원래 설정으로 되돌림" >&2
    exit 1
  fi
  sudo systemctl reload caddy
fi
echo "caddy: $(systemctl is-active caddy) · 실제 수업 서버: $(systemctl is-active class-village)"
REMOTE
echo "▶ 테스트판 준비 완료: https://test.class-village.duckdns.org (내용은 deploy.sh DEPLOY_TARGET=test 로 올림)"
