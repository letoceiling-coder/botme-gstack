#!/usr/bin/env bash
# Snapshot current production artifacts before deploy (rollback checkpoint).
# Usage: ./infra/scripts/snapshot-release.sh [remote]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODE="${1:-remote}"
SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"
REMOTE="${DEPLOY_REMOTE:-/var/www/agent.neeklo.ru}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
CHECKPOINT="${RELEASES_DIR:-/var/www/agent.neeklo.ru/.releases}/checkpoint-${STAMP}"

snapshot_remote() {
  ssh -i "$SSH_KEY" "$SERVER" bash -s <<REMOTE
set -euo pipefail
REMOTE_ROOT="$REMOTE"
CHECKPOINT="$CHECKPOINT"
mkdir -p "\$REMOTE_ROOT/.releases"
mkdir -p "\$CHECKPOINT"
for app in api web widget operator-panel; do
  if [[ -d "\$REMOTE_ROOT/apps/\$app/dist" ]]; then
    mkdir -p "\$CHECKPOINT/apps/\$app"
    cp -a "\$REMOTE_ROOT/apps/\$app/dist" "\$CHECKPOINT/apps/\$app/dist"
  fi
done
for pkg in ai-core ai-runtime realtime-runtime rtc-runtime shared database crypto; do
  if [[ -d "\$REMOTE_ROOT/packages/\$pkg/dist" ]]; then
    mkdir -p "\$CHECKPOINT/packages/\$pkg"
    cp -a "\$REMOTE_ROOT/packages/\$pkg/dist" "\$CHECKPOINT/packages/\$pkg/dist"
  fi
done
[[ -f "\$REMOTE_ROOT/ecosystem.config.cjs" ]] && cp -a "\$REMOTE_ROOT/ecosystem.config.cjs" "\$CHECKPOINT/"
[[ -f "\$REMOTE_ROOT/release.json" ]] && cp -a "\$REMOTE_ROOT/release.json" "\$CHECKPOINT/release.json.prev"
echo "\$CHECKPOINT" > "\$REMOTE_ROOT/.releases/latest-checkpoint"
echo "SNAPSHOT_OK \$CHECKPOINT"
REMOTE
}

echo "==> Snapshot release checkpoint ($MODE) @ $STAMP"
if [[ "$MODE" == "remote" ]]; then
  snapshot_remote
else
  CHECKPOINT="$ROOT/.releases/checkpoint-${STAMP}"
  mkdir -p "$CHECKPOINT"
  for app in api web widget operator-panel; do
    if [[ -d "$ROOT/apps/$app/dist" ]]; then
      mkdir -p "$CHECKPOINT/apps/$app"
      cp -a "$ROOT/apps/$app/dist" "$CHECKPOINT/apps/$app/dist"
    fi
  done
  echo "$CHECKPOINT" > "$ROOT/.releases/latest-checkpoint"
  echo "SNAPSHOT_OK $CHECKPOINT"
fi
