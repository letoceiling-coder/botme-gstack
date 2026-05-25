#!/usr/bin/env bash
# Production-safe PostgreSQL backup before deploy.
# Usage: ./infra/scripts/backup-db.sh [remote|local]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODE="${1:-remote}"
SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"
REMOTE="${DEPLOY_REMOTE:-/var/www/agent.neeklo.ru}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/botme}"

run_remote_backup() {
  ssh -i "$SSH_KEY" "$SERVER" bash -s <<REMOTE
set -euo pipefail
mkdir -p "$BACKUP_DIR"
cd "$REMOTE"
set -a && source .env && set +a
DB_URL="\${DATABASE_URL%%\\?*}"
OUT="$BACKUP_DIR/botme-${STAMP}.sql.gz"
pg_dump "\$DB_URL" | gzip > "\$OUT"
ls -lh "\$OUT"
echo "BACKUP_OK \$OUT"
REMOTE
}

run_local_backup() {
  cd "$ROOT"
  set -a && source .env && set +a
  DB_URL="${DATABASE_URL%%\?*}"
  mkdir -p "$ROOT/.backups"
  OUT="$ROOT/.backups/botme-${STAMP}.sql.gz"
  pg_dump "$DB_URL" | gzip > "$OUT"
  ls -lh "$OUT"
  echo "BACKUP_OK $OUT"
}

echo "==> DB backup ($MODE) @ $STAMP"
if [[ "$MODE" == "local" ]]; then
  run_local_backup
else
  run_remote_backup
fi
echo "==> Backup complete"
