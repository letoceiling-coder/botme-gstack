#!/usr/bin/env bash
# Deploy demo.neeklo.ru landing + operator page + dental seed
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
REMOTE_AGENT="${DEPLOY_REMOTE:-/var/www/agent.neeklo.ru}"
REMOTE_DEMO="/var/www/demo.neeklo.ru"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"
RSYNC_SSH="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new"

echo "==> Build demo site + operator panel locally"
cd "$ROOT"
pnpm --filter @botme/demo-site build
pnpm --filter @botme/operator-panel build

echo "==> Rsync demo static"
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p ${REMOTE_DEMO}/dist"
rsync -avz -e "$RSYNC_SSH" \
  apps/demo-site/dist/ "${SERVER}:${REMOTE_DEMO}/dist/"

echo "==> Rsync operator-panel.js (for demo aliases)"
rsync -avz -e "$RSYNC_SSH" \
  apps/operator-panel/dist/operator-panel.js \
  "${SERVER}:${REMOTE_AGENT}/apps/operator-panel/dist/operator-panel.js"

echo "==> Rsync demo nginx"
rsync -avz -e "$RSYNC_SSH" \
  infra/production/nginx/demo.neeklo.ru.conf \
  "${SERVER}:/etc/nginx/sites-available/demo.neeklo.ru.conf"

echo "==> Remote: CORS + seed + nginx"
ssh -i "$SSH_KEY" "$SERVER" bash -s <<REMOTE_SCRIPT
set -euo pipefail
cd "${REMOTE_AGENT}"

# Append demo.neeklo.ru to CORS_ORIGINS if missing
if grep -q '^CORS_ORIGINS=' .env 2>/dev/null; then
  if ! grep '^CORS_ORIGINS=' .env | grep -q 'demo.neeklo.ru'; then
    sed -i 's|^CORS_ORIGINS=\(.*\)|CORS_ORIGINS=\1,https://demo.neeklo.ru|' .env
    echo "Added demo.neeklo.ru to CORS_ORIGINS"
    pm2 restart agent-botme-api --update-env
  fi
else
  echo 'CORS_ORIGINS=https://agent.neeklo.ru,https://demo.neeklo.ru' >> .env
  pm2 restart agent-botme-api --update-env
fi

# Demo URL for operator panel origin detection
if grep -q '^DEMO_URL=' .env 2>/dev/null; then
  sed -i 's|^DEMO_URL=.*|DEMO_URL=https://demo.neeklo.ru|' .env
else
  echo 'DEMO_URL=https://demo.neeklo.ru' >> .env
fi

export DEMO_CONFIG_PATH="${REMOTE_DEMO}/demo-config.json"
cd apps/api
node ../../infra/scripts/seed-dental-demo.mjs || echo "Seed skipped — configure integration first"
cd "${REMOTE_AGENT}"

ln -sf /etc/nginx/sites-available/demo.neeklo.ru.conf /etc/nginx/sites-enabled/demo.neeklo.ru.conf 2>/dev/null || true
nginx -t
systemctl reload nginx
REMOTE_SCRIPT

echo "==> Smoke tests"
curl -sfI "https://demo.neeklo.ru/" | head -n 1
curl -sfI "https://demo.neeklo.ru/operator" | head -n 1
curl -sfI "https://demo.neeklo.ru/widget.js" | head -n 1
curl -sfI "https://demo.neeklo.ru/operator-panel.js" | head -n 1
curl -sf "https://demo.neeklo.ru/demo-config.json" | head -c 200 || echo "demo-config pending seed"
curl -sf "https://demo.neeklo.ru/api/health" && echo " demo API OK"
echo "Demo deploy complete"
