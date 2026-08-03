#!/usr/bin/env bash
# Validate the Railway image LOCALLY before touching Railway.
#
# Builds the production Docker image, boots a throwaway Postgres 16, then runs
# the image against it with dummy env vars. The container entrypoint applies
# the Prisma migrations and starts the server; the script then polls the
# landing page for HTTP 200. Everything is torn down on exit (trap).
#
# Prereqs: docker, curl, openssl. Run from the repo root:
#   ./scripts/validate-docker.sh
#
# Exit codes: 0 = image builds + migrations apply + server answers 200.

set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="planora:local-validate"
NET="planora-validate-net"
PG="planora-validate-pg"
APP="planora-validate-app"
PORT=3099
BASE_URL="http://127.0.0.1:${PORT}"

cleanup() {
  docker rm -f "$APP" >/dev/null 2>&1 || true
  docker rm -f "$PG" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Building image (first run downloads base image + npm deps; takes a few minutes)..."
docker build -t "$IMAGE" .

echo "==> Starting throwaway Postgres 16..."
docker network create "$NET"
docker run -d --rm --name "$PG" --network "$NET" \
  -e POSTGRES_DB=planora \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16-alpine >/dev/null

echo "==> Waiting for Postgres to accept connections..."
ready=0
for _ in $(seq 1 30); do
  if docker exec "$PG" pg_isready -U postgres -d planora >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" != "1" ]; then
  echo "❌ Postgres did not become ready in time."
  exit 1
fi

echo "==> Running the image (entrypoint: migrate deploy -> npm run start)..."
docker run -d --rm --name "$APP" --network "$NET" -p "127.0.0.1:${PORT}:3000" \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://postgres:postgres@${PG}:5432/planora?schema=public" \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32 | tr -d '\n')" \
  -e BETTER_AUTH_URL="${BASE_URL}" \
  -e NEXT_PUBLIC_APP_URL="${BASE_URL}" \
  -e BETTER_AUTH_TRUSTED_ORIGINS="${BASE_URL}" \
  -e RESEND_API_KEY="re_dummy_validation_only" \
  -e EMAIL_FROM="Planora <noreply@example.com>" \
  -e CRON_SECRET="$(openssl rand -base64 32 | tr -d '\n')" \
  "$IMAGE"

echo "==> Waiting for HTTP 200 on ${BASE_URL}/ (max ~2 min)..."
ok=0
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/" || true)"
  if [ "$code" = "200" ]; then
    ok=1
    break
  fi
  sleep 2
done

echo ""
echo "==> Container logs (tail):"
docker logs "$APP" 2>&1 | tail -30 || true
echo ""

if [ "$ok" = "1" ]; then
  echo "✅ SUCCESS: image builds, migrations apply, server answers HTTP 200."
  echo "   Containers/network cleaned up automatically."
  exit 0
else
  echo "❌ FAILURE: server did not answer HTTP 200. See logs above."
  exit 1
fi
