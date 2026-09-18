#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
DUMP="${1:?usage: restore-db.sh <dump-file>}"
: "${ALLOW_DB_RESTORE:?Set ALLOW_DB_RESTORE=YES to confirm destructive restore}"
PG_URL="${DATABASE_URL%%\?schema=*}"

if [[ "$ALLOW_DB_RESTORE" != "YES" ]]; then
  echo "Refusing restore: ALLOW_DB_RESTORE must equal YES" >&2
  exit 2
fi

test -s "$DUMP"
cat "$DUMP" | docker run --rm -i --network host postgres:16-alpine \
  pg_restore --clean --if-exists --no-owner --no-acl --dbname="$PG_URL"

echo "Restore completed from: $DUMP"
