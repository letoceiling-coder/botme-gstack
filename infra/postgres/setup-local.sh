#!/usr/bin/env bash
# Bootstrap botme role/database on local Postgres (e.g. botmate-infra on :5432).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BOTMATE_PG="${BOTMATE_PG:-$HOME/.local/botmate-infra/root/usr/lib/postgresql/18/bin/psql}"
export LD_LIBRARY_PATH="${BOTMATE_LD_PATH:-$HOME/.local/botmate-infra/root/usr/lib/postgresql/18/lib:$HOME/.local/botmate-infra/root/usr/lib/x86_64-linux-gnu}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

if [ ! -x "$BOTMATE_PG" ]; then
  echo "psql not found at $BOTMATE_PG — install Postgres or set BOTMATE_PG"
  exit 1
fi

"$BOTMATE_PG" -h 127.0.0.1 -p 5432 -U postgres -d postgres <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'botme') THEN
    CREATE USER botme WITH PASSWORD 'botme';
  END IF;
END
$$;
SQL

if ! "$BOTMATE_PG" -h 127.0.0.1 -p 5432 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='botme'" | grep -q 1; then
  "$BOTMATE_PG" -h 127.0.0.1 -p 5432 -U postgres -d postgres -c "CREATE DATABASE botme OWNER botme;"
fi

"$BOTMATE_PG" -h 127.0.0.1 -p 5432 -U postgres -d botme -c "GRANT ALL ON SCHEMA public TO botme;"
"$BOTMATE_PG" -h 127.0.0.1 -p 5432 -U postgres -d botme -c "CREATE EXTENSION IF NOT EXISTS vector;"
"$BOTMATE_PG" -h 127.0.0.1 -p 5432 -U botme -d botme -c "SELECT extname FROM pg_extension WHERE extname='vector';"

echo "✅ botme Postgres ready — run: pnpm db:migrate:deploy"
