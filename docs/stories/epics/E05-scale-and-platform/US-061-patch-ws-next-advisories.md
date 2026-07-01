# US-061 Patch ws + next HIGH security advisories

## Status

implemented

## Lane

normal — 2 risk flags (external/dependencies; existing behavior: the `next` bump
is a minor version and needs build + smoke verification). Maintenance request.
Surfaced by the deep review + validation dependency audit (2026-06-30).

## Product Contract

Shipped runtime dependencies carry no known HIGH-severity advisories that are
reachable at runtime.

## Relevant Product Docs

- `AGENTS.md` — stack / dependency baseline.
- `docs/ARCHITECTURE.md` — the custom `server.ts` + Socket.io (the `ws` path).

## Acceptance Criteria

- `ws` (pulled in transitively via `socket.io`) is upgraded past its HIGH advisory
  — a clean, non-major `npm audit fix`.
- `next` is upgraded past its HIGH advisories. The HIGHs are **SSRF via WebSocket
  upgrades / DoS / middleware(proxy) auth-bypass** (`< 16.2.5`–`< 16.2.6`) — *not*
  the "request smuggling in rewrites" GHSA, which is only **moderate**; cite the
  right advisories when verifying the fix. `package.json` **pins `next` to the
  exact `"16.1.6"`** (`package.json:29`), so the reliable remedy is a **deliberate
  manual bump** of that pin to a patched minor (≥ `16.2.9`) then `npm install` —
  not a blanket `npm audit fix` (npm flags the fix as "outside the stated
  dependency range"; without `--force` a plain audit fix will not cross the exact
  pin, and `--force` sweeps in unrelated Prisma-chain churn — see Design Notes).
- After the bumps: `npm audit` shows both runtime HIGHs cleared; `npm run build`
  succeeds; `npm test` is 523/523; the app smoke-boots (board loads, socket
  connects).
- The lone CRITICAL advisory (`vitest`, dev/test-only, arbitrary file read via the
  UI server) is explicitly **out of scope** here — it is not runtime-reachable and
  its fix is a major bump; track separately.

## Design Notes

- `ws` HIGH is runtime-reachable through `socket.io` (realtime broadcast).
- `next` HIGH is a direct, runtime dependency; the exact pin is the reason a clean
  autofix won't resolve it — verify no behavior regression across the minor bump
  (build + manual smoke; the app runs on a custom `server.ts`, so confirm it still
  boots and serves).
- Most other "prod" highs in the audit are Prisma-7 build-chain transitives that
  clear with the Prisma tooling patch — note but do not chase under this story.
- Scope the change to `ws` + `next` and diff `package-lock.json` deliberately: a
  blanket `npm audit fix` (especially `--force`) also adds/removes unrelated
  packages via the Prisma tooling chain, making the diff unreviewable.

## Dependencies

- Independent. (A follow-up may recategorize `shadcn` / `react-email` as
  devDependencies — tracked separately.)

## Validation

`scripts/bin/harness-cli story update --id US-061 --unit 0 --integration 0 --e2e 0 --platform 1`

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — dependency upgrade. |
| Integration | existing suite stays green (523/523) post-upgrade. |
| E2E | n/a. |
| Platform | `npm audit` — `ws` + `next` runtime HIGHs gone; `npm run build` clean; app boots on `server.ts`, a board renders, socket connects (manual smoke). |
| Release | Validation report: pre/post `npm audit` diff + build + smoke result. |

## Harness Delta

Consider a recurring `npm audit` check (backlog / CI gate US-008) — note if friction.

## Evidence

- **Pre-fix `npm audit` (`next` runtime HIGHs):** DoS with Server Components
  (`<16.2.3`/`<16.2.5`), Middleware/Proxy bypass via segment-prefetch routes incl.
  incomplete-fix follow-up (`<16.2.5`/`<16.2.6`), SSRF via WebSocket upgrades
  (`<16.2.5`), DoS via connection exhaustion with Cache Components (`<16.2.5`),
  Middleware/Proxy bypass via dynamic route parameter injection (`<16.2.5`),
  Middleware/Proxy bypass in Pages Router i18n (`<16.2.5`). The highest lower
  bound across all of these is `<16.2.6`; picked `16.2.9` (latest stable 16.x at
  fix time) per the AC's `≥16.2.9` floor. `ws` HIGH: memory-exhaustion DoS from
  tiny fragments (`>=8.0.0 <8.21.0`), transitively via `socket.io`.
- **Fix applied:**
  - `package.json`: bumped the exact `next` pin `"16.1.6"` → `"16.2.9"` (a
    deliberate manual bump, not `npm audit fix`, since the pin is exact and
    `--force` would sweep in unrelated Prisma-chain churn). Bumped the
    lockstep-pinned `eslint-config-next` `"16.1.6"` → `"16.2.9"` alongside it.
  - Added a scoped `"overrides": { "ws": "^8.21.0" }` (no prior `overrides`
    block existed) to force the transitive `ws` resolution past the fixed
    version without touching `socket.io`/`socket.io-client` themselves.
  - `npm install` — `package-lock.json` diff confirmed scoped to exactly: `next`,
    its `@next/*` platform packages, `eslint-config-next`, and `ws` (verified via
    `git diff package-lock.json | grep -oE '"node_modules/...' | sort -u`; no
    unrelated package churn).
- **Post-fix `npm audit`:** `ws` — cleared entirely. `next` — all the HIGH
  advisories above are gone; the only remaining `next` audit entry is an
  unrelated **moderate** transitive-`postcss` issue with a `fixAvailable` that
  requires a major (`9.3.3`) downgrade — explicitly out of this story's scope
  (not one of the cited HIGHs, and "fixing" it means going backwards).
- **Verification:**
  - `npm run build` — Turbopack compiles successfully under Next.js **16.2.9**
    (banner confirms the new version); the only failure is the pre-existing,
    unrelated `scripts/perf-measure.ts:36` TS error (an untracked WIP script —
    confirmed identical on `dev` before this change, same as noted in US-060's
    evidence).
  - `npm test` → 523/523 pass (matches the story's stated baseline exactly).
  - `npm run lint` → 100 problems, unchanged from baseline.
  - **Manual smoke** (`npm run dev`, real `server.ts` boot, not mocked): `GET /`
    → `200`; `GET /socket.io/?EIO=4&transport=polling` → `200` with a real
    Engine.IO handshake body (`sid`, `upgrades: ["websocket"]`, `pingInterval`,
    `pingTimeout`) — confirms Socket.io still serves correctly over the patched
    `ws` after the override.
- The CRITICAL `vitest` advisory and the remaining non-`ws`/`next` HIGHs (Hono,
  Prisma dev-tooling chain, kysely, lodash, etc.) are out of scope per the AC and
  tracked separately, not touched here.
