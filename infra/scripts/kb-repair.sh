#!/usr/bin/env bash
# Trigger KB self-healing via production API (requires admin session cookie or run heal endpoint locally).
# Preferred: POST /api/knowledge-bases/:id/heal with authenticated ADMIN user.
#
# Usage:
#   KB_ID=xxx COOKIE='botme_session=...' ./infra/scripts/kb-repair.sh
set -euo pipefail

KB_ID="${KB_ID:?Set KB_ID}"
API_BASE="${API_BASE:-https://agent.neeklo.ru/api}"
COOKIE="${COOKIE:-}"

if [[ -z "$COOKIE" ]]; then
  echo "Set COOKIE env var with authenticated session (ADMIN role required)."
  echo "Alternatively call POST ${API_BASE}/knowledge-bases/${KB_ID}/heal from admin UI."
  exit 1
fi

echo "==> Healing KB ${KB_ID}"
curl -sS -X POST "${API_BASE}/knowledge-bases/${KB_ID}/heal" \
  -H "Cookie: ${COOKIE}" \
  -H "Content-Type: application/json" | jq .

echo "==> Post-heal diagnostics"
curl -sS "${API_BASE}/knowledge-bases/${KB_ID}/diagnostics" \
  -H "Cookie: ${COOKIE}" | jq .
