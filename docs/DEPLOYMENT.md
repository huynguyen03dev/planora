# Planora — Railway Deployment Playbook

This repository is pre-wired for a one-click-ish deploy to **Railway**
(`railway.com`). Everything below is written for a human who has never used
Railway. All repo-side work is done — the remaining steps are point-and-click
in the Railway dashboard plus pasting a few values.

Read once, follow in order. Total time: ~30–45 minutes including the first
build.

---

## 1. What is being deployed

- **App**: Next.js 16 (App Router, React 19) running behind a **custom Node
  server** (`server.ts`) that serves Next.js and **Socket.io** (real-time board
  sync) on a single HTTP port. WebSockets are fully supported on Railway
  (always-on service, no cold starts).
- **Database**: PostgreSQL 16 via Prisma 7 (`@prisma/adapter-pg`).
- **Email**: Resend (production). Email verification is enforced in every
  environment (decision 0023) — the first-login flow depends on it.
- **Attachments**: Cloudinary (server-side signed uploads).
- **Due-date reminders**: an in-process scheduler in `server.ts` calls the
  cron route every 15 minutes, guarded by `CRON_SECRET`.

## 2. Deployment decisions (why it is set up this way)

| Question | Decision | Why |
| --- | --- | --- |
| Builder | **Dockerfile** (`Dockerfile`, pinned in `railway.json`) | Deterministic, reproducible image. Nixpacks auto-detection is a moving target; a committed Dockerfile builds the same everywhere (locally, on Railway, in CI). |
| Base image | `node:24-slim` | Matches the dev toolchain (README: "Node.js 20+ (developed on 24)", local is v24.x). Slim keeps the image small. |
| `tsx` in deps vs devDeps | `tsx` is a **production dependency** (and also listed in devDependencies) | The `start` script (`tsx --require dotenv/config server.ts`) works with `npm ci` output regardless of dev-dep pruning. |
| devDependencies in the runtime image | **Kept** (full `node_modules` copied into runtime) | The `prisma` CLI is a devDependency and the container entrypoint runs `npx prisma migrate deploy` at every start. Trade-off: a larger image (dev test tooling is included). Acceptable for this deployment; a future optimization is installing only the `prisma` CLI at runtime. |
| Migrations | **Automatic at container start** (`scripts/docker-entrypoint.sh` → `prisma migrate deploy`, idempotent) | No manual step, no one-off CLI, safe on every redeploy. |
| `output: standalone` | **Not set, not needed** | The app runs its own server (`server.ts`) which serves the `.next` build in place. Standalone output exists for serverless-style hosting; this app is not deployed that way. |
| PORT | `server.ts` reads `process.env.PORT` (default 3000) and binds `0.0.0.0` in production | Railway injects `PORT`; the server listens on whatever Railway gives it. |
| Database | **Railway in-project PostgreSQL plugin** (internal URL) | One-click, inside the same project/network, included in the trial. Neon is a fine alternative (public URL) if you prefer a separate provider. |
| Env at build time | None required | All `NEXT_PUBLIC_*` values are read server-side at runtime (no client inlining), so the image builds without any variables. Railway makes service variables available during builds anyway. |
| Cron driver | In-process `setInterval` in `server.ts` (enabled when `CRON_SECRET` is set) | No external cron service needed. |

One subtlety worth knowing: `next build` type-checks the whole tsconfig tree,
and `scripts/perf-measure.ts` imports `../e2e/helpers`. The Docker build
context therefore includes `e2e/` (it is not in `.dockerignore`), but the
runtime stage copies only the paths the server actually executes — tests, e2e
and docs never ship in the image.

## 3. Prerequisites

- A **GitHub account** (you have one — this repo is `huynguyen03dev/planora`).
- The repo pushed to GitHub with the `dev` branch (it is).
- Docker installed locally **only if** you want to run the local image
  validation (section 9) — optional but recommended before your first Railway
  deploy.

## 4. Step-by-step deployment

### 4.1 Create the Railway account

1. Go to **https://railway.com** and click **Start a New Project** (or
   **Login**).
2. Choose **Continue with GitHub** and authorize Railway. No separate
   password is needed.
3. Railway's trial includes $5 of credit (30 days) — enough for this app
   (Postgres + one always-on service fit comfortably; see section 11).

### 4.2 Create the project and deploy the repo

1. In the dashboard, click **New Project** → **Deploy from GitHub repo**.
2. Authorize the GitHub app for the `huynguyen03dev` account if prompted
   (Railway asks which repos to grant access; grant at least `planora`).
3. Pick the **`planora`** repository.
4. Railway asks for a **branch** — enter **`dev`** (the integration line;
   this repo's release workflow promotes `dev → main` via PR, but `dev` is
   what is demo-ready).
5. Railway will try to deploy immediately. **Don't worry about the first
   failed/starting deploy** — it needs the Postgres plugin and env vars first
   (below). You can click **Redeploy** afterwards.

### 4.3 Add PostgreSQL

1. In your project, click **New** → **Database** → **PostgreSQL** (in-project
   plugin). Wait until it shows a healthy state.
2. Open the Postgres plugin → **Variables** tab → copy the value of
   `DATABASE_URL`. **Use the "Internal" URL** (it stays on Railway's private
   network; "Public" also works but is unnecessary).

### 4.4 Set environment variables

1. Open your **service** (the app, not the database) → **Variables** tab.
2. Add **Raw Editor** variables, one per line: `VAR=value`.
3. Use the table in section 5 for exactly which variables and where each
   value comes from.
4. After adding variables, click **Redeploy** so the service picks them up.

### 4.5 Deploy

1. With Postgres + variables in place, trigger **Deploy** (or **Redeploy**).
2. Watch the **Build** logs tab: `docker build` downloads the base image and
   npm dependencies first (~5–10 min on the first build; much faster after).
3. When the deploy is live, Railway shows a **Settings → Networking** URL
   like `https://planora-production-xxxx.up.railway.app`. Open it — you should
   see the Planora landing page.
4. Migrations run automatically at container start (entrypoint). You can
   confirm in the **Deploy** logs: `[entrypoint] Running prisma migrate deploy`
   then `> Ready on http://…:PORT` (the host part is the container hostname or
   `0.0.0.0` — either is fine).

> If the first deploy was started before the env vars existed (step 4.4),
> Railway redeploys on every variable change anyway — a final **Redeploy**
> after step 4.4 is the definitive one.

## 5. Environment variable reference

Create these on the service (section 4.4). **Never commit `.env`**; these live
only in Railway. "Copy from local .env" means: open your local `.env` and copy
the value — the secret value itself must never be printed, committed, or
pasted into this document or a chat log you don't control.

| Variable | Value source | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Railway Postgres plugin → Variables → copy | Use the **Internal** URL of the in-project Postgres. |
| `BETTER_AUTH_SECRET` | **NEW** — generate: `openssl rand -base64 32` | Session/signature secret. Fresh value for prod; do not reuse another environment's value. |
| `BETTER_AUTH_URL` | Prod URL, e.g. `https://planora-production-xxxx.up.railway.app` (or your custom domain) | Better Auth base URL. The local `.env` value is `http://localhost:3000` — **prod must use the deployed URL**. |
| `NEXT_PUBLIC_APP_URL` | Same prod URL as `BETTER_AUTH_URL` | Used server-side for absolute links in emails/notifications. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Prod URL (comma-separated), e.g. `https://planora-production-xxxx.up.railway.app` | Auth origin allowlist. Add `http://localhost:3000` too only if you plan to hit the prod API from a local frontend. |
| `RESEND_API_KEY` | Copy from local `.env` (by name — do not print the value) | Required: production email always goes through Resend (see `lib/email.ts`). Without it, verification emails are only logged and sign-up cannot complete. |
| `EMAIL_FROM` | Copy from local `.env` | Currently `Planora <noreply@planora.hazeruno.dpdns.org>` — that domain is already verified in Resend, so delivery will work as-is. |
| `CRON_SECRET` | **NEW** — generate: `openssl rand -base64 32` | Guards `/api/cron/due-date-reminders`; also enables the in-process 15-minute reminder scheduler in `server.ts`. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Copy from local `.env` | Read server-side at runtime. |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Copy from local `.env` | Read server-side at runtime. |
| `CLOUDINARY_API_KEY` | Copy from local `.env` | Server-side signed uploads. |
| `CLOUDINARY_API_SECRET` | Copy from local `.env` | Server-side signed uploads. |
| `DATABASE_POOL_MAX` (optional) | Omit, or 10 | Default 10; lower only if Railway Postgres complains about connection count. |
| `SMTP_HOST` / `SMTP_PORT` | **Do not set** | Dev-only Mailpit sink; `lib/email.ts` ignores SMTP in production. Setting it has no effect — skip it. |

## 6. Database migrations

Migrations run **automatically at every container start**:

```
[entrypoint] Running prisma migrate deploy...   → applies only pending ones
[entrypoint] Starting server (npm run start)...
```

`prisma migrate deploy` is idempotent and safe on every redeploy. No manual
step is required.

To verify after first deploy: open the **Deploy** logs and look for
`[entrypoint] Running prisma migrate deploy` followed by
`> Ready on http://…:PORT`.

## 7. First-login verification flow (must work end-to-end)

Email verification is enforced (decision 0023) — this flow is the proof the
deploy is healthy:

1. Open the deployed URL and click **Sign up**.
2. Create an account with your real email address.
3. Within a few seconds, Resend delivers the verification email (check spam if
   it is not in the inbox; the sender is `noreply@planora.hazeruno.dpdns.org`).
4. Click the verification link — you land back on the app, verified.
5. You can now reach `/boards` and create your first workspace/board.
6. Optional sanity check: open the site in a second browser tab — real-time
   updates (cards, presence) should sync between the two tabs via Socket.io.

## 8. Optional: custom domain

You can serve the app on your own domain instead of `*.up.railway.app`:

1. In the service → **Settings → Networking**, click **Generate Domain** →
   **Custom Domain**, and enter e.g. `planora.hazeruno.dpdns.org`.
2. At your DNS provider, add a **CNAME** record: `planora` →
   `<your-service>.up.railway.app`.
3. Update `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, and
   `BETTER_AUTH_TRUSTED_ORIGINS` to the custom domain and redeploy.

(Resend delivery does not depend on the app domain — `EMAIL_FROM` uses
`planora.hazeruno.dpdns.org`, which is already verified with Resend. Keep
`EMAIL_FROM` as-is.)

## 9. Validate the image locally (optional, recommended)

Prove the exact image Railway will build works on your machine first (Docker
required; ~5–10 min first run):

```bash
./scripts/validate-docker.sh
```

What it does: `docker build` → boots a throwaway Postgres 16 container →
runs the image with dummy env vars → waits for the entrypoint to apply
migrations and the server to answer HTTP 200 on the landing page → cleans
everything up.

Expected output ends with:

```
✅ SUCCESS: image builds, migrations apply, server answers HTTP 200.
```

If Docker is not installed locally, run this after creating your Railway
account, or run the equivalent commands by hand (the script is short and
self-explanatory).

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Build fails with an out-of-memory error (`heap out of memory`, exit 137) | `next build` exceeded the build memory | Add a service variable `NODE_OPTIONS=--max-old-space-size=2048` and redeploy. (Railway builds generally have plenty of memory; this is the fix if not.) |
| App logs `Ready on http://…:PORT` but site won't load | Healthcheck / port mismatch | The container listens on all interfaces and honors Railway's injected `PORT`. If you changed nothing, this works; confirm the service is **healthy** in the dashboard. |
| Sign-up works but verification email never arrives | `RESEND_API_KEY` unset/typo, or domain not verified in Resend | Confirm `RESEND_API_KEY` is set on the service; confirm `planora.hazeruno.dpdns.org` is **verified** under Resend → Domains (sender must match `EMAIL_FROM`'s domain). Check spam. |
| Real-time (drag/presence) not syncing between tabs | Socket.io handshake failing | Everything is same-origin (page + socket share the Railway URL), and the Socket.io CORS config is intentionally `origin: false` in production — same-origin is unaffected. Verify in DevTools → Network that `/socket.io/?EIO=4...` returns 200, and that `transports` includes `websocket` (the client tries `websocket` first, falls back to `polling`). Railway supports WebSockets on always-on services. |
| `[entrypoint] Running prisma migrate deploy` errors (connection refused) | `DATABASE_URL` missing or points at an unreachable host | Re-check the value came from the Postgres plugin's Variables tab (internal URL). |
| `[due-date-scheduler] Failed to tick` repeats in logs | The in-process scheduler self-calls the cron route using `HOSTNAME`; if that hostname does not resolve inside the container the fetch fails (errors are caught and logged only) | Add a service variable `HOSTNAME=0.0.0.0` and redeploy — the self-call then targets the local host deterministically. Harmless to set; does not change which interfaces the server binds. |
| App loads but login redirects to `localhost:3000` | `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` still local | Set both to the deployed URL (section 5) and redeploy. |
| Cold start / long first load | N/A | Railway always-on services have no cold starts; the first deploy is just a longer build (npm install + `next build`). |
| Uploads (attachments) fail | Cloudinary vars missing | Confirm the three Cloudinary variables are set on the service (the app throws "Missing Cloudinary configuration" server-side otherwise). |
| Emails failing with 403 from Resend | Sending from a domain not verified in Resend | Keep `EMAIL_FROM` exactly as in local `.env` (verified domain) — do not invent a new from-address. |

## 11. Cost / limits note

- Railway trial: $5 credit, ~30 days — enough for one always-on service (this
  app) + one Postgres plugin.
- Runtime: 1 vCPU / 0.5 GB — this app fits (Next.js server + Socket.io in a
  single process). If the service is ever OOM-killed under load, raise the
  plan or set `NODE_OPTIONS=--max-old-space-size=384`.
- Always-on means no cold starts, and WebSockets work.

## 12. Pre-deploy findings (read before deploying)

No app-level blockers were found — the image builds and runs unmodified. Notes:

- `server.ts` binds all interfaces and honors Railway's `PORT`. The cron
  scheduler self-calls `http://${HOSTNAME}:${PORT}/api/cron/...` (HOSTNAME
  defaults to `0.0.0.0` when unset); Docker/Railway containers usually set
  `HOSTNAME` to the container id, which resolves inside the container. If
  reminder ticks ever fail, set `HOSTNAME=0.0.0.0` (troubleshooting table).
- `next.config.ts` contains `allowedDevOrigins` for the local web-preview
  proxy — dev-only, ignored in production.
- The database starts **empty** on Railway. Local/demo data does not come
  along; seed via the app's UI (or `scripts/demo-fixture.ts`) after deploy if
  needed.
- Do not set `SMTP_HOST`/`SMTP_PORT` in production (dev-only Mailpit sink).
- `BETTER_AUTH_SECRET` and `CRON_SECRET` should be **new random values** for
  prod (commands in section 5), not copies of local values.
