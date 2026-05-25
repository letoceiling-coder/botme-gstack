#!/usr/bin/env bash
# Deploy coturn on turn.neeklo.ru via SSH (uses deploy key).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"

if [[ -z "${TURN_AUTH_SECRET:-}" ]]; then
  TURN_AUTH_SECRET="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"
  echo "Generated TURN_AUTH_SECRET (save this): ${TURN_AUTH_SECRET}"
fi

scp -i "$SSH_KEY" "$ROOT/infra/scripts/setup-coturn.sh" "${SERVER}:/tmp/setup-coturn.sh"
ssh -i "$SSH_KEY" "$SERVER" "TURN_AUTH_SECRET='${TURN_AUTH_SECRET}' TURN_HOST='turn.neeklo.ru' bash /tmp/setup-coturn.sh"

ENV_FILE="/var/www/agent.neeklo.ru/.env"
ssh -i "$SSH_KEY" "$SERVER" bash -s <<REMOTE
set -euo pipefail
for kv in "FEATURE_RTC_CALLS=true" "TURN_HOST=turn.neeklo.ru" "TURN_AUTH_SECRET=${TURN_AUTH_SECRET}"; do
  key="\${kv%%=*}"
  if grep -q "^\${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^\${key}=.*|\${kv}|" "$ENV_FILE"
  else
    echo "\${kv}" >> "$ENV_FILE"
  fi
done
cd /var/www/agent.neeklo.ru && pm2 restart agent-botme-api --update-env
systemctl is-active coturn
REMOTE

echo "==> coturn deployed. Verify: turnutils_uclient -v -u USER -w PASS turn.neeklo.ru"
