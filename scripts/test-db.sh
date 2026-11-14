#!/usr/bin/env bash
# Applies every migration to a throwaway local Postgres and runs scripts/test-db.sql against it.
# Needs the PostgreSQL server binaries (initdb, pg_ctl); no Docker, no Supabase CLI.
# With arguments, runs them as a command while the database is up (the tool tests: npm run test:tools).
# The pieces Supabase provides (auth schema, roles, realtime publication) are stubbed in scripts/test-db-stubs.sql.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT:-54329}"
RUN=""
if [ "$(id -u)" = "0" ]; then
  # Postgres refuses to run as root: use the postgres account, in a folder it can reach
  RUN="runuser -u postgres --"
  DIR="$($RUN mktemp -d "$(getent passwd postgres | cut -d: -f6)/hestia-pg.XXXXXX")"
else
  DIR="$(mktemp -d "${TMPDIR:-/tmp}/hestia-pg.XXXXXX")"
fi
cleanup() { $RUN "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
$RUN "$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
PSQL="psql -X -q -v ON_ERROR_STOP=1 -h $DIR -p $PORT -U postgres"
$PSQL -d postgres -c "create database hestia"
$PSQL -d hestia -f "$ROOT/scripts/test-db-stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "· $(basename "$f")"
  $PSQL -d hestia -f "$f" >/dev/null
done
echo "· tests"
$PSQL -d hestia -f "$ROOT/scripts/test-db.sql" >/dev/null
echo "OK"
# Anything after the script's name runs while the database is still up, e.g.  scripts/test-db.sh npx vitest run
if [ "$#" -gt 0 ]; then
  HESTIA_TEST_PG_HOST="$DIR" HESTIA_TEST_PG_PORT="$PORT" "$@"
fi
