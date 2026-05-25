#!/usr/bin/env bash
# Rollback production to latest checkpoint + optional DB restore.
# Usage: ./infra/scripts/rollback-production.sh [--restore-db]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"
REMOTE="${DEPLOY_REMOTE:-/var/www/agent.neeklo.ru}"
RESTORE_DB=0

for arg in "$@"; do
  case "$arg" in
    --restore-db) RESTORE_DB=1 ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

echo "==> Rollback production"
ssh -i "$SSH_KEY" "$SERVER" bash -s <<REMOTE
set -euo pipefail
REMOTE_ROOT="$REMOTE"
CHECKPOINT_FILE="\$REMOTE_ROOT/.releases/latest-checkpoint"
if [[ ! -f "\$CHECKPOINT_FILE" ]]; then
  echo "ROLLBACK_FAIL: no checkpoint found"
  exit 1
fi
CHECKPOINT="\$(cat "\$CHECKPOINT_FILE")"
if [[ ! -d "\$CHECKPOINT" ]]; then
  echo "ROLLBACK_FAIL: checkpoint dir missing: \$CHECKPOINT"
  exit 1
fi
echo "Restoring from \$CHECKPOINT"
for app in api web widget operator-panel; do
  if [[ -d "\$CHECKPOINT/apps/\$app/dist" ]]; then
    rm -rf "\$REMOTE_ROOT/apps/\$app/dist"
    mkdir -p "\$REMOTE_ROOT/apps/\$app"
    cp -a "\$CHECKPOINT/apps/\$app/dist" "\$REMOTE_ROOT/apps/\$app/dist"
  fi
done
for pkg in ai-core ai-runtime realtime-runtime rtc-runtime shared database crypto; do
  if [[ -d "\$CHECKPOINT/packages/\$pkg/dist" ]]; then
    rm -rf "\$REMOTE_ROOT/packages/\$pkg/dist"
    mkdir -p "\$REMOTE_ROOT/packages/\$pkg"
    cp -a "\$CHECKPOINT/packages/\$pkg/dist" "\$REMOTE_ROOT/packages/\$pkg/dist"
  fi
done
[[ -f "\$CHECKPOINT/ecosystem.config.cjs" ]] && cp -a "\$CHECKPOINT/ecosystem.config.cjs" "\$REMOTE_ROOT/"
[[ -f "\$CHECKPOINT/release.json.prev" ]] && cp -a "\$CHECKPOINT/release.json.prev" "\$REMOTE_ROOT/release.json"
pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs
pm2 save
REMOTE

if [[ "$RESTORE_DB" == "1" ]]; then
  echo "==> Restore latest DB backup (manual confirm on server recommended)"
  ssh -i "$SSH_KEY" "$SERVER" bash -s <<'DBROLL'
set -euo pipefail
LATEST=$(ls -t /var/backups/botme/botme-*.sql.gz 2>/dev/null | head -1)
if [[ -z "$LATEST" ]]; then
  echo "ROLLBACK_DB_SKIP: no backup found"
  exit 0
fi
echo "Latest backup: $LATEST"
echo "Run manually if needed: gunzip -c $LATEST | psql \$DATABASE_URL"
DBROLL
fi

bash "$ROOT/infra/scripts/health-verify-production.sh"
HEALTH=ROLLBACK DEPLOYED_BY="${USER:-ci}" bash "$ROOT/infra/scripts/generate-release-json.sh" "$ROOT/release.json"

echo "==> ROLLBACK_PASS"
