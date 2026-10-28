#!/usr/bin/env bash
# Starts a disposable local PostgreSQL cluster for the database/RLS test suite,
# runs `vitest` against it, then stops the cluster.
#
# Requires PostgreSQL 15+ binaries (initdb, pg_ctl). Set PG_BIN to override.
# Usage: npm run test:db
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || echo /opt/homebrew/opt/postgresql@16/bin/pg_ctl)")}"
PGDATA="$ROOT/.tmp/pgdata"
PORT="${TEST_PG_PORT:-54329}"

if [ ! -x "$PG_BIN/pg_ctl" ]; then
  echo "pg_ctl not found. Install PostgreSQL 15+ or set PG_BIN." >&2
  exit 1
fi

# Stop a cluster left over from an interrupted run before recreating it.
if [ -f "$PGDATA/postmaster.pid" ]; then "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true; fi
rm -rf "$PGDATA"
mkdir -p "$ROOT/.tmp"
"$PG_BIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$PGDATA" -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories=''" -l "$ROOT/.tmp/pg.log" -w start >/dev/null

cleanup() { "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true; }
trap cleanup EXIT

export TEST_DATABASE_URL="postgresql://postgres@localhost:$PORT/postgres"
cd "$ROOT"
npx vitest run --project db "$@"
