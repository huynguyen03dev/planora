# syntax=docker/dockerfile:1
# Planora — production image for Railway (Dockerfile builder).
#
# How the image is built (full rationale in docs/DEPLOYMENT.md, section
# "Deployment decisions"):
#   - Node 24 — matches the dev environment (README: "Node.js 20+ (developed
#     on 24)"); the local toolchain is v24.x.
#   - The app runs a custom server (server.ts: Next.js handler + Socket.io on
#     one HTTP server). tsx — required by the `start` script — is a production
#     dependency, so the runtime node_modules is self-sufficient for start.
#   - devDependencies are kept in the runtime image on purpose: the `prisma`
#     CLI is a devDependency and the entrypoint runs `prisma migrate deploy`
#     before starting the server.
#   - No `output: standalone` in next.config.ts: the custom server serves the
#     build in place; standalone output is not needed (or used).
#   - `next build` type-checks the whole tsconfig tree, and
#     scripts/perf-measure.ts imports ../e2e/helpers. The build context must
#     therefore include e2e/ (it is NOT in .dockerignore), but the runtime
#     stage copies only the paths the server actually executes — tests, e2e
#     and docs never ship in the image.

# ── Stage 1: install all dependencies (devDeps included) ─────────────────
FROM node:24-slim AS deps
WORKDIR /app
# openssl: Prisma's engine detection at install/generate time (and at
# `migrate deploy` in the runtime stage) needs a detectable libssl.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: generate Prisma client + build Next.js ─────────────────────
FROM node:24-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The Prisma client is generated into app/generated/prisma/ (gitignored) and
# must exist before `next build`. `prisma generate` never connects to the DB.
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: runtime ────────────────────────────────────────────────────
FROM node:24-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# System TLS: the Prisma CLI (`migrate deploy` at startup) and outbound HTTPS
# (Resend, Cloudinary, Better Auth) rely on OpenSSL + CA certificates.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Full node_modules (devDeps kept on purpose — see header comment).
COPY --from=deps /app/node_modules ./node_modules
# Build output + the generated Prisma client. Copied from the build stage so
# the result is deterministic even though app/generated is gitignored and
# excluded from the Docker context.
COPY --from=build /app/.next ./.next
COPY --from=build /app/app/generated ./app/generated
# Source tree needed by the custom server at runtime: server.ts and lib/* are
# executed by tsx (path aliases resolve via tsconfig.json); emails/ holds the
# react-email templates imported by lib/email.ts; prisma/ + prisma.config.ts
# are used by `prisma migrate deploy`. Explicit copies keep tests/e2e/docs out
# of the image. NOTE: there is no public/ dir today; if one is ever added, add
# `COPY public ./public`.
COPY package.json package-lock.json prisma.config.ts server.ts next.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY lib ./lib
COPY emails ./emails
COPY scripts ./scripts
RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
