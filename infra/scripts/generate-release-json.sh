#!/usr/bin/env bash
# Generate release.json metadata after successful deploy.
# Usage: HEALTH=PASS ./infra/scripts/generate-release-json.sh [output-path]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-$ROOT/release.json}"
HEALTH="${HEALTH:-PASS}"
VERSION="${RELEASE_VERSION:-M11.7B}"
DEPLOYED_BY="${DEPLOYED_BY:-${USER:-ci}}"

cd "$ROOT"
COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
DEPLOYED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<EOF
{
  "version": "$VERSION",
  "commit": "$COMMIT",
  "branch": "$BRANCH",
  "deployedAt": "$DEPLOYED_AT",
  "deployedBy": "$DEPLOYED_BY",
  "health": "$HEALTH"
}
EOF

echo "RELEASE_JSON_OK $OUT"
cat "$OUT"
