#!/usr/bin/env bash
set -euo pipefail

: "${APP_HOST:?Set APP_HOST, e.g. 35.184.40.197}"
: "${APP_USER:?Set APP_USER, e.g. dichvuvpsntk}"
APP_DIR="${APP_DIR:-/opt/zalo-shopee-cashback-bot}"
SSH_PORT="${SSH_PORT:-22}"
SSH_OPTS=(-p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
RSYNC_RSH="ssh -p ${SSH_PORT} -o StrictHostKeyChecking=accept-new"

if [[ -n "${SSH_PASS:-}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "sshpass is required when SSH_PASS is set" >&2
    exit 1
  fi
  SSH=(sshpass -e ssh "${SSH_OPTS[@]}")
  RSYNC_PREFIX=(sshpass -e)
  export SSHPASS="$SSH_PASS"
else
  SSH=(ssh "${SSH_OPTS[@]}")
  RSYNC_PREFIX=()
fi

REMOTE="${APP_USER}@${APP_HOST}"

echo "==> Creating remote app directory: ${APP_DIR}"
"${SSH[@]}" "$REMOTE" "mkdir -p '${APP_DIR}'"

echo "==> Uploading source"
"${RSYNC_PREFIX[@]}" rsync -az --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'data/*.json' \
  -e "$RSYNC_RSH" \
  ./ "$REMOTE:$APP_DIR/"

echo "==> Preparing .env if missing"
"${SSH[@]}" "$REMOTE" "cd '${APP_DIR}' && if [ ! -f .env ]; then cp .env.example .env; chmod 600 .env; fi"

echo "==> Running remote checks"
"${SSH[@]}" "$REMOTE" "cd '${APP_DIR}' && npm test"

echo "==> Starting service"
"${SSH[@]}" "$REMOTE" "cd '${APP_DIR}' && if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then docker compose up -d --build; elif command -v systemctl >/dev/null 2>&1 && sudo -n true 2>/dev/null; then sudo cp deploy/zalo-shopee-cashback.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now zalo-shopee-cashback; else nohup npm start > app.log 2>&1 & echo \\$! > app.pid; fi"

echo "==> Health check"
"${SSH[@]}" "$REMOTE" "curl -fsS http://127.0.0.1:3000/health"

echo "Deploy completed. Configure .env with real Zalo/Shopee tokens before enabling live webhook."
