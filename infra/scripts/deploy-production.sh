#!/usr/bin/env bash
# Production deploy for agent.neeklo.ru only — rsync from local, safe restarts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
REMOTE="${DEPLOY_REMOTE:-/var/www/agent.neeklo.ru}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"
RSYNC_SSH="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new"

echo "==> Stage safety scripts on remote (preflight dependency)"
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p ${REMOTE}/infra/scripts"
rsync -avz -e "$RSYNC_SSH" \
  infra/scripts/backup-db.sh \
  infra/scripts/deploy-preflight.sh \
  infra/scripts/audit-production-integrity.mjs \
  infra/scripts/repair-runtime-bindings.mjs \
  "${SERVER}:${REMOTE}/infra/scripts/"

echo "==> Pre-deploy safety (M11.4B)"
bash "$ROOT/infra/scripts/deploy-preflight.sh"

echo "==> Build locally"
cd "$ROOT"
pnpm typecheck
pnpm test
pnpm lint
pnpm build

echo "==> Rsync dist artifacts"
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p ${REMOTE}/apps/operator-panel/dist"
rsync -avz -e "$RSYNC_SSH" \
  apps/api/dist/ "${SERVER}:${REMOTE}/apps/api/dist/"
rsync -avz -e "$RSYNC_SSH" \
  apps/web/dist/ "${SERVER}:${REMOTE}/apps/web/dist/"
rsync -avz -e "$RSYNC_SSH" \
  apps/widget/dist/ "${SERVER}:${REMOTE}/apps/widget/dist/"
rsync -avz -e "$RSYNC_SSH" \
  apps/operator-panel/dist/ "${SERVER}:${REMOTE}/apps/operator-panel/dist/"

echo "==> Rsync workspace package dist (runtime deps for api/worker)"
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p ${REMOTE}/packages/{ai-core,ai-runtime,realtime-runtime,rtc-runtime,shared,database,crypto}/dist"
for pkg in ai-core ai-runtime realtime-runtime rtc-runtime shared database crypto; do
  rsync -avz -e "$RSYNC_SSH" \
    "packages/${pkg}/package.json" "${SERVER}:${REMOTE}/packages/${pkg}/package.json"
  rsync -avz -e "$RSYNC_SSH" \
    "packages/${pkg}/dist/" "${SERVER}:${REMOTE}/packages/${pkg}/dist/"
done
rsync -avz -e "$RSYNC_SSH" \
  apps/api/package.json "${SERVER}:${REMOTE}/apps/api/package.json"
rsync -avz -e "$RSYNC_SSH" \
  pnpm-lock.yaml pnpm-workspace.yaml package.json \
  "${SERVER}:${REMOTE}/"

echo "==> Rsync infra (nginx, pm2, migrations)"
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p ${REMOTE}/infra/scripts"
rsync -avz -e "$RSYNC_SSH" \
  ecosystem.config.cjs "${SERVER}:${REMOTE}/ecosystem.config.cjs"
rsync -avz -e "$RSYNC_SSH" \
  packages/database/prisma/migrations/ "${SERVER}:${REMOTE}/packages/database/prisma/migrations/"
rsync -avz -e "$RSYNC_SSH" \
  packages/database/prisma/schema.prisma "${SERVER}:${REMOTE}/packages/database/prisma/schema.prisma"
rsync -avz -e "$RSYNC_SSH" \
  infra/production/nginx/agent.neeklo.ru.conf "${SERVER}:/etc/nginx/sites-enabled/agent.neeklo.ru.conf"
rsync -avz -e "$RSYNC_SSH" \
  infra/production/nginx/demo.neeklo.ru.conf "${SERVER}:/etc/nginx/sites-available/demo.neeklo.ru.conf"
rsync -avz -e "$RSYNC_SSH" \
  infra/scripts/seed-dental-demo.mjs "${SERVER}:${REMOTE}/infra/scripts/seed-dental-demo.mjs"
rsync -avz -e "$RSYNC_SSH" \
  infra/scripts/backup-db.sh \
  infra/scripts/deploy-preflight.sh \
  infra/scripts/audit-production-integrity.mjs \
  infra/scripts/repair-runtime-bindings.mjs \
  "${SERVER}:${REMOTE}/infra/scripts/"

echo "==> Remote migrate + pm2 + nginx test"
ssh -i "$SSH_KEY" "$SERVER" bash -s <<REMOTE_SCRIPT
set -euo pipefail
cd "$REMOTE"
# Ensure public MinIO endpoint for browser presigned uploads
if grep -q '^S3_PUBLIC_ENDPOINT=' .env 2>/dev/null; then
  sed -i 's|^S3_PUBLIC_ENDPOINT=.*|S3_PUBLIC_ENDPOINT=https://agent.neeklo.ru/storage|' .env
else
  echo 'S3_PUBLIC_ENDPOINT=https://agent.neeklo.ru/storage' >> .env
fi
pnpm db:generate
CI=true pnpm install --no-frozen-lockfile
# Ensure new workspace packages are linked (pnpm may skip if lockfile stale)
PNPM_BOTME="node_modules/.pnpm/node_modules/@botme"
mkdir -p "\$PNPM_BOTME" apps/api/node_modules/@botme
for pkg in ai-core ai-runtime realtime-runtime rtc-runtime shared database crypto; do
  if [[ -d "packages/\$pkg" ]]; then
    ln -sfn "../../../packages/\$pkg" "\$PNPM_BOTME/\$pkg" 2>/dev/null || true
    ln -sfn "../../../../packages/\$pkg" "apps/api/node_modules/@botme/\$pkg" 2>/dev/null || true
  fi
done
pnpm db:generate
pnpm db:migrate:deploy
pm2 start ecosystem.config.cjs --update-env 2>/dev/null || pm2 restart ecosystem.config.cjs
pm2 delete agent-botme-widget 2>/dev/null || true
pm2 save
nginx -t
systemctl reload nginx
curl -sf http://127.0.0.1:3110/health | head -c 200
echo ""
curl -sfI -H "Host: agent.neeklo.ru" http://127.0.0.1/widget/ | head -n 1
curl -sfI -H "Host: agent.neeklo.ru" http://127.0.0.1/widget.js | head -n 1
curl -sfI -H "Host: agent.neeklo.ru" http://127.0.0.1/operator-panel.js | head -n 1
echo "Deploy complete"
REMOTE_SCRIPT

echo "==> External smoke"
curl -sf "https://agent.neeklo.ru/api/health" && echo " OK health"
curl -sfI "https://agent.neeklo.ru/widget.js" | head -n 1
curl -sfI "https://agent.neeklo.ru/operator-panel/" | head -n 1
curl -sfI "https://agent.neeklo.ru/widget/" | head -n 1
