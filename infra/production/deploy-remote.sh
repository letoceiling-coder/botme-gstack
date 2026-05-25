#!/bin/bash
# Run ON the server at /var/www/agent.neeklo.ru after initial setup.
# Does not touch other nginx configs, pm2 apps, or SSL certs.

set -euo pipefail

ROOT="/var/www/agent.neeklo.ru"
cd "$ROOT"

echo "==> Node / pnpm"
node -v
pnpm -v

echo "==> Install"
pnpm install

echo "==> Typecheck + lint + build"
pnpm typecheck
pnpm lint
pnpm build

echo "==> Database"
pnpm db:generate
pnpm db:migrate:deploy

echo "==> PM2 (unique app names only)"
pm2 start ecosystem.config.cjs --update-env || pm2 restart ecosystem.config.cjs
pm2 save

echo "==> Health"
curl -sf "http://127.0.0.1:3110/health" || echo "API health check failed"

echo "==> Done. Configure nginx + certbot separately if not yet applied."
