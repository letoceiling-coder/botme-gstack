#!/usr/bin/env bash
# Pre-deploy safety gate (M11.4B): backup, migration check, integrity audit, destructive scan.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"
REMOTE="${DEPLOY_REMOTE:-/var/www/agent.neeklo.ru}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"

echo "==> Preflight: scan for forbidden destructive patterns"
if command -v rg >/dev/null 2>&1; then
  if rg -i "$FORBIDDEN_PATTERN" infra/scripts/deploy-production.sh infra/scripts/deploy-demo.sh 2>/dev/null; then
    echo "PREFLIGHT_FAIL: destructive pattern found in deploy scripts"
    exit 1
  fi
else
  if grep -Ei 'migrate reset|migrate:reset|db:push|force-reset|TRUNCATE' infra/scripts/deploy-production.sh infra/scripts/deploy-demo.sh 2>/dev/null; then
    echo "PREFLIGHT_FAIL: destructive pattern found in deploy scripts"
    exit 1
  fi
fi
echo "Preflight: deploy scripts clean"

echo "==> Preflight: validate schema + migrations locally"
cd "$ROOT"
pnpm db:generate
if [[ -f "$ROOT/.env" ]]; then
  pnpm --filter @botme/database exec dotenv -e ../../.env -- prisma validate
  echo "Preflight: schema valid"
else
  echo "Preflight: skip prisma validate (no local .env)"
fi

if [[ "$SKIP_BACKUP" != "1" ]]; then
  echo "==> Preflight: remote DB backup"
  bash "$ROOT/infra/scripts/backup-db.sh" remote
fi

echo "==> Preflight: remote integrity audit"
ssh -i "$SSH_KEY" "$SERVER" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE"
set -a && source .env && set +a
node infra/scripts/audit-production-integrity.mjs || {
  echo "Integrity violations detected — running repair"
  node infra/scripts/repair-runtime-bindings.mjs
  node infra/scripts/audit-production-integrity.mjs
}
REMOTE

echo "==> PREFLIGHT_PASS"
