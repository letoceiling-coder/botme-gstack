#!/usr/bin/env bash
# Post-deploy production health gate — abort release if any check fails.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"
REMOTE="${DEPLOY_REMOTE:-/var/www/agent.neeklo.ru}"
API_ORIGIN="${API_ORIGIN:-https://agent.neeklo.ru}"
TURN_HOST="${TURN_HOST:-turn.neeklo.ru}"

fail() {
  echo "HEALTH_FAIL: $1"
  exit 1
}

echo "==> Health: external API"
HEALTH_JSON="$(curl -sf "${API_ORIGIN}/api/health" || fail "API /health unreachable")"
echo "$HEALTH_JSON" | grep -q '"status"' || fail "invalid health payload"
echo "$HEALTH_JSON" | grep -q '"postgres":"ok"' || fail "postgres not ok"
echo "$HEALTH_JSON" | grep -q '"redis":"ok"' || fail "redis not ok"

echo "==> Health: static assets"
curl -sfI "${API_ORIGIN}/widget.js" | head -n 1 | grep -q "200\|304" || fail "widget.js"
curl -sfI "${API_ORIGIN}/widget/" | head -n 1 | grep -q "200\|304" || fail "widget/"
curl -sfI "${API_ORIGIN}/operator-panel/" | head -n 1 | grep -q "200\|304" || fail "operator-panel/"

echo "==> Health: remote pm2 + local services"
ssh -i "$SSH_KEY" "$SERVER" bash -s <<REMOTE || fail "remote health"
set -euo pipefail
pm2 jlist | grep -q '"name":"agent-botme-api"' || { echo "pm2 api missing"; exit 1; }
pm2 jlist | grep -q '"status":"online"' || { echo "pm2 not online"; exit 1; }
curl -sf http://127.0.0.1:3110/health >/dev/null
nginx -t >/dev/null 2>&1
REMOTE

echo "==> Health: TURN TCP probe"
if command -v nc >/dev/null 2>&1; then
  nc -z -w 4 "$TURN_HOST" 3478 || fail "TURN TCP ${TURN_HOST}:3478"
else
  timeout 4 bash -c "echo >/dev/tcp/${TURN_HOST}/3478" || fail "TURN TCP ${TURN_HOST}:3478"
fi

echo "==> HEALTH_PASS"
