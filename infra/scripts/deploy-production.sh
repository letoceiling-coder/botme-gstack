#!/usr/bin/env bash
# Production deploy for agent.neeklo.ru — git-disciplined release pipeline (M11.7B).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
REMOTE="${DEPLOY_REMOTE:-/var/www/agent.neeklo.ru}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"
RSYNC_SSH="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new"
RELEASE_VERSION="${RELEASE_VERSION:-M11.8C}"

cd "$ROOT"
chmod +x infra/scripts/*.sh 2>/dev/null || true

echo "==> Release discipline: clean git tree"
bash "$ROOT/infra/scripts/require-clean-git.sh"

echo "==> Stage safety scripts on remote"
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p ${REMOTE}/infra/scripts ${REMOTE}/.releases"
rsync -avz -e "$RSYNC_SSH" \
  infra/scripts/backup-db.sh \
  infra/scripts/deploy-preflight.sh \
  infra/scripts/snapshot-release.sh \
  infra/scripts/health-verify-production.sh \
  infra/scripts/generate-release-json.sh \
  infra/scripts/rollback-production.sh \
  infra/scripts/require-clean-git.sh \
  infra/scripts/audit-production-integrity.mjs \
  infra/scripts/repair-runtime-bindings.mjs \
  "${SERVER}:${REMOTE}/infra/scripts/"

echo "==> Pre-deploy safety"
bash "$ROOT/infra/scripts/deploy-preflight.sh"

echo "==> Snapshot rollback checkpoint on remote"
bash "$ROOT/infra/scripts/snapshot-release.sh" remote

echo "==> CI gate: lint, typecheck, test, build"
pnpm lint
pnpm typecheck
pnpm test
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
rsync -avz -e "$RSYNC_SSH" \
  operator-runtime/ "${SERVER}:${REMOTE}/operator-runtime/"

echo "==> Rsync workspace package dist"
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

echo "==> Remote migrate + pm2 + nginx"
ssh -i "$SSH_KEY" "$SERVER" bash -s <<REMOTE_SCRIPT
set -euo pipefail
cd "$REMOTE"
if grep -q '^S3_PUBLIC_ENDPOINT=' .env 2>/dev/null; then
  sed -i 's|^S3_PUBLIC_ENDPOINT=.*|S3_PUBLIC_ENDPOINT=https://agent.neeklo.ru/storage|' .env
else
  echo 'S3_PUBLIC_ENDPOINT=https://agent.neeklo.ru/storage' >> .env
fi
pnpm db:generate
CI=true pnpm install --no-frozen-lockfile
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
REMOTE_SCRIPT

echo "==> Production health verification"
bash "$ROOT/infra/scripts/health-verify-production.sh"

echo "==> Release metadata"
RELEASE_VERSION="$RELEASE_VERSION" HEALTH=PASS DEPLOYED_BY="${USER:-ci}" \
  bash "$ROOT/infra/scripts/generate-release-json.sh" "$ROOT/release.json"
scp -i "$SSH_KEY" "$ROOT/release.json" "${SERVER}:${REMOTE}/release.json"

echo "==> DEPLOY_PASS commit=$(git rev-parse --short HEAD)"
