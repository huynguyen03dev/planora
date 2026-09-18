#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
OUT="${1:-.local-backups/planora-$(date -u +%Y%m%dT%H%M%SZ).dump}"
mkdir -p "$(dirname "$OUT")"
PG_URL="${DATABASE_URL%%\?schema=*}"

docker run --rm --network host postgres:16-alpine \
  pg_dump --format=custom --no-owner --no-acl "$PG_URL" > "$OUT"

test -s "$OUT"
echo "Backup created: $OUT"
