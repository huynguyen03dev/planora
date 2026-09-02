# syntax=docker/dockerfile:1
# Planora — production image for Railway (Dockerfile builder). Build decisions
# (full rationale in docs/DEPLOYMENT.md):
#   - Node 24 matches the dev toolchain.
#   - The app runs a custom server (server.ts: Next.js + Socket.io on one HTTP
#     server); tsx is a prod dependency so runtime node_modules is
#     self-sufficient for `start`.
#   - devDependencies are kept on purpose: the entrypoint runs `prisma migrate deploy`.
#   - No `output: standalone`: the custom server serves the build in place.
#   - e2e/ stays in the build context (`next build` type-checks the whole tree
#     and scripts/perf-measure.ts imports ../e2e/helpers) but is never copied
#     into the runtime stage — tests/e2e/docs don't ship.

# Stage 1: install all dependencies (devDeps included)
FROM node:24-slim AS deps
WORKDIR /app
# openssl: Prisma's engine detection (install/generate + `migrate deploy`) needs libssl.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: generate Prisma client + build Next.js
FROM node:24-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Railway build-time vars must be declared with ARG to be received; NEXT_PUBLIC_*
# are inlined by Next at build time in both bundles, so missing them compiles
# to undefined and breaks email links / Cloudinary uploads.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ARG NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ENV NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=$NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

# Prisma client generates into gitignored app/generated/prisma/ and must exist
# before `next build`; `prisma generate` never connects to the DB.
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: runtime
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
# Build output + generated Prisma client, copied from the build stage so the
# result is deterministic despite app/generated being gitignored/context-excluded.
COPY --from=build /app/.next ./.next
COPY --from=build /app/app/generated ./app/generated
# Explicit copies keep tests/e2e/docs out of the image: server.ts + lib/*
# (run by tsx), emails/ (react-email templates), prisma/ + prisma.config.ts
# (`prisma migrate deploy`). No public/ dir today — if one is added, copy it too.
COPY package.json package-lock.json prisma.config.ts server.ts next.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY lib ./lib
COPY emails ./emails
COPY scripts ./scripts
RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
