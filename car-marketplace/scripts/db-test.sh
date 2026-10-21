#!/usr/bin/env bash
# Applies every migration and runs the SQL test suite (schema + row-level security).
#
#   pnpm db:test                          # throwaway local Postgres 16 (needs initdb/pg_ctl)
#   DATABASE_URL=postgres://... pnpm db:test   # an existing database, e.g. CI service
#   pnpm db:types                         # same, and regenerate packages/db types first
#
# Against a running `supabase start` database, migrations are detected and skipped,
# and the Supabase stub is not loaded.
set -euo pipefail

GEN_TYPES=false
for arg in "$@"; do
  [[ "$arg" == "--types" ]] && GEN_TYPES=true
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
TESTS="$ROOT/supabase/tests"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb 2>/dev/null | tail -1)")}"

cleanup() {
  if [[ -n "${TMP_PG:-}" ]]; then
    run_as_pg "$PG_BIN/pg_ctl" -D "$TMP_PG/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$TMP_PG"
  fi
}
trap cleanup EXIT

# initdb refuses to run as root; use the postgres system user when we are root.
run_as_pg() {
  if [[ "$(id -u)" == "0" ]]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  TMP_PG="$(mktemp -d)"
  chmod 777 "$TMP_PG"
  PORT="${PG_TEST_PORT:-54329}"
  run_as_pg "$PG_BIN/initdb" -D "$TMP_PG/data" -U postgres -A trust >/dev/null
  run_as_pg "$PG_BIN/pg_ctl" -D "$TMP_PG/data" -l "$TMP_PG/log" \
    -o "-p $PORT -k $TMP_PG -c listen_addresses=''" -w start >/dev/null
  DATABASE_URL="postgresql://postgres@/postgres?host=$TMP_PG&port=$PORT"
fi

export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 --no-psqlrc)

has() { [[ "$("${PSQL[@]}" -tAc "$1")" == "t" ]]; }

if ! has "select to_regclass('auth.users') is not null"; then
  echo "• Plain Postgres detected — loading the Supabase stub"
  "${PSQL[@]}" -f "$TESTS/_setup/supabase_stub.sql"
fi

if has "select to_regclass('public.listings') is not null"; then
  echo "• Schema already present — skipping migrations"
else
  for file in "$MIGRATIONS"/*.sql; do
    echo "• Migrating $(basename "$file")"
    "${PSQL[@]}" -f "$file"
  done
fi

if [[ "$GEN_TYPES" == "true" ]]; then
  DATABASE_URL="$DATABASE_URL" node "$ROOT/scripts/gen-db-types.mjs"
fi

"${PSQL[@]}" -f "$TESTS/_setup/helpers.sql"

failed=0
passed=0
for file in "$TESTS"/*.test.sql; do
  name="$(basename "$file")"
  if output="$("${PSQL[@]}" -tA -f "$file" 2>&1)"; then
    count="$(grep -c '^ok - ' <<<"$output" || true)"
    passed=$((passed + count))
    echo "✓ $name ($count assertions)"
  else
    failed=$((failed + 1))
    echo "✗ $name"
    grep -E 'FAIL|ERROR' <<<"$output" | sed 's/^/    /'
  fi
done

echo
if [[ $failed -gt 0 ]]; then
  echo "$failed test file(s) failed, $passed assertions passed"
  exit 1
fi
echo "All database tests passed ($passed assertions)"
