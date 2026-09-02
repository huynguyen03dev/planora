#!/bin/sh
set -e

# Planora container entrypoint: apply pending migrations (`prisma migrate
# deploy` is idempotent — only unapplied migrations run, so redeploys are
# safe), then start the custom Next.js + Socket.io server (`npm run start`).

echo "[entrypoint] Running prisma migrate deploy..."
npx prisma migrate deploy

echo "[entrypoint] Starting server (npm run start)..."
exec npm run start
