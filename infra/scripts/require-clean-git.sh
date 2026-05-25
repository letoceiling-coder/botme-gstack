#!/usr/bin/env bash
# Abort deploy if working tree is not clean (release discipline).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -d .git ]]; then
  echo "GIT_CHECK_SKIP: not a git repository"
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "DEPLOY_ABORT: dirty working tree — commit and push before deploy."
  git status --short
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${REQUIRE_MAIN:-0}" == "1" && "$BRANCH" != "main" ]]; then
  echo "DEPLOY_ABORT: production deploy must run from main (current: $BRANCH)"
  exit 1
fi

echo "GIT_CHECK_PASS branch=$BRANCH commit=$(git rev-parse --short HEAD)"
