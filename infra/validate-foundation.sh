#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PASS=0
FAIL=0
WARN=0

ok() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN + 1)); }

echo "=== Botme Foundation Validation ==="

echo ""
echo "1. Docker + Infra"
if command -v docker >/dev/null 2>&1; then
  ok "Docker CLI installed"
  if docker compose -f infra/docker-compose.yml ps --format json 2>/dev/null | grep -q .; then
    ok "Docker compose stack detected"
  else
    warn "Docker compose stack not running — run: docker compose -f infra/docker-compose.yml up -d"
  fi
else
  warn "Docker not installed — use docker compose for isolated infra"
fi

echo ""
echo "2. Postgres"
if ss -tln 2>/dev/null | grep -q ':5432'; then
  ok "Postgres listening on 5432"
else
  bad "Postgres not listening on 5432"
fi

echo ""
echo "3. Redis"
if command -v redis-cli >/dev/null 2>&1; then
  REDIS_PING=$(redis-cli -u "${REDIS_URL:-redis://localhost:6379}" ping 2>/dev/null || true)
else
  REDIS_PING=$(python3 -c "
import socket, sys
s=socket.socket()
s.settimeout(2)
try:
  s.connect(('127.0.0.1', 6379))
  s.sendall(b'PING\r\n')
  data=s.recv(64)
  print(data.decode().strip())
except OSError:
  sys.exit(1)
finally:
  s.close()
" 2>/dev/null || true)
fi
if echo "$REDIS_PING" | grep -q PONG; then
  ok "Redis PONG"
else
  bad "Redis unreachable at ${REDIS_URL:-redis://localhost:6379}"
fi

echo ""
echo "4. Prisma migrate"
if pnpm --filter @botme/database exec dotenv -e ../../.env -- prisma migrate status 2>/dev/null | grep -q "Database schema is up to date"; then
  ok "Prisma migrations applied"
elif pnpm --filter @botme/database exec dotenv -e ../../.env -- prisma migrate status 2>/dev/null | grep -q "Following migration"; then
  warn "Pending migrations — run: pnpm db:migrate:deploy"
else
  bad "Prisma migrate status failed (check DATABASE_URL / user permissions)"
fi

echo ""
echo "5. API health"
API_PORT="${API_PORT:-3010}"
HEALTH=$(curl -sf "http://127.0.0.1:${API_PORT}/health" 2>/dev/null || true)
if echo "$HEALTH" | grep -q '"status"'; then
  ok "Botme API health on :${API_PORT}"
  echo "     $HEALTH"
else
  bad "Botme API not healthy on :${API_PORT} (port 3001 may be occupied by another app)"
fi

echo ""
echo "6. TypeScript"
if pnpm typecheck >/dev/null 2>&1; then
  ok "pnpm typecheck"
else
  bad "pnpm typecheck failed"
fi

echo ""
echo "=== Summary: ${PASS} passed, ${FAIL} failed, ${WARN} warnings ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
