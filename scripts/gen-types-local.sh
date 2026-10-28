#!/usr/bin/env bash
# Regenerates src/types/database.ts from the migrations using a disposable
# local PostgreSQL cluster (no Supabase project or Docker needed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || echo /opt/homebrew/opt/postgresql@16/bin/pg_ctl)")}"
PGDATA="$ROOT/.tmp/pgtypes"
PORT="${TYPES_PG_PORT:-54330}"
if [ -f "$PGDATA/postmaster.pid" ]; then "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true; fi
rm -rf "$PGDATA" && mkdir -p "$ROOT/.tmp"
"$PG_BIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$PGDATA" -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories=''" -l "$ROOT/.tmp/pgtypes.log" -w start >/dev/null
trap '"$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true' EXIT
for f in "$ROOT/supabase/tests/harness/supabase_stubs.sql" "$ROOT"/supabase/migrations/*.sql; do
  "$PG_BIN/psql" -h localhost -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
DATABASE_URL="postgresql://postgres@localhost:$PORT/postgres" node "$ROOT/scripts/gen-db-types.mjs"
