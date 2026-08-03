#!/bin/sh
set -e

# Planora container entrypoint.
#
# 1. Apply pending database migrations. `prisma migrate deploy` is idempotent:
#    it only applies migrations that have not run yet, so every container start
#    (including Railway redeploys) is safe and cheap.
# 2. Start the custom Next.js + Socket.io server (package.json `start` =
#    NODE_ENV=production tsx --require dotenv/config server.ts).

echo "[entrypoint] Running prisma migrate deploy..."
npx prisma migrate deploy

echo "[entrypoint] Starting server (npm run start)..."
exec npm run start
