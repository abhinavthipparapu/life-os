#!/bin/sh
# Backup and restore drill (sections 12.1 and 13). Restores into a scratch database, compares every
# table's row count against the source, then drops the scratch copy. The source is only read.
set -eu
SCRATCH="lifeos_restore_drill"
psql_in() { docker compose exec -T postgres psql -U lifeos "$@"; }
counts() {
  psql_in -d "$1" -Atc "SELECT string_agg(t, E'\n' ORDER BY t) FROM (
    SELECT table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I', table_name), false, true, '')))[1]::text AS t
    FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') x"
}
cleanup() { psql_in -d postgres -qc "DROP DATABASE IF EXISTS $SCRATCH" >/dev/null; }
trap cleanup EXIT

start=$(date +%s)
cleanup
docker compose exec -T postgres pg_dump -U lifeos -Fc lifeos > /tmp/lifeos-drill.dump
size=$(wc -c < /tmp/lifeos-drill.dump | tr -d ' ')
psql_in -d postgres -qc "CREATE DATABASE $SCRATCH"
docker compose exec -T postgres pg_restore -U lifeos -d "$SCRATCH" --no-owner < /tmp/lifeos-drill.dump
rm -f /tmp/lifeos-drill.dump
source_counts=$(counts lifeos)
restored_counts=$(counts "$SCRATCH")
if [ "$source_counts" != "$restored_counts" ]; then
  echo "FAILED: restored row counts differ from the source"
  exit 1
fi
tables=$(printf '%s\n' "$source_counts" | wc -l | tr -d ' ')
echo "Restore drill passed: $tables tables match, dump ${size} bytes, $(( $(date +%s) - start ))s."
