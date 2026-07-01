# US-061 Patch ws + next HIGH security advisories

## Status

planned

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

Add after implementation (attach the pre/post audit diff).
