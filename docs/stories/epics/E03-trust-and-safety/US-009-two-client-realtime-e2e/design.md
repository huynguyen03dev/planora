# Design

## Why this must be E2E

The realtime invariants are *interaction* properties between two clients and the
real `server.ts` + Socket.io layer. The store reducer is already unit-proven
(`tests/board-store.test.ts`) against synthetic events — but that can't prove the
socket handshake, board-room scoping, or the emit→broadcast→apply path actually
wire up. Only two real browsers against the running app can. This story also
introduces the E2E tooling the repo lacked entirely.

## Harness

- **Runner:** `@playwright/test`, chromium only (slice 1).
- **`playwright.config.ts`** — `testDir: ./e2e`, single worker (one shared
  server + DB; the test coordinates two users on one board, so parallel files
  would race), `webServer` boots `npm run dev` (the real Next + Socket.io
  server) and reuses an already-running dev server locally. `dotenv/config`
  loads `.env` so DB helpers see `DATABASE_URL`.
- **Two browser contexts** in one test (`browser.newContext()` ×2) — isolated
  cookies, so Alice and Bob are genuinely separate sessions.

## Fixture strategy — arrange fast, act + assert via UI

Two users must share one board. The realistic path is invite→email→accept, but
email won't deliver in test and the invite/accept *UI* is not what slice 1 is
proving. So:

- **Arrange (fast path):** Alice signs up and creates workspace + board + a list
  through the real UI; Bob signs up through the real UI; Bob's membership is then
  inserted directly into `workspaceMember` (`e2e/helpers/db.ts`). This is a
  precondition, not the system under test. The invite/accept UI flow is a
  candidate follow-up slice.
- **Act + assert (real UI + real wire):** Alice creates a card in the list; the
  assertion is that it appears on **Bob's already-loaded board** with no reload.

`db.ts` uses raw `pg` (a transitive dep of `@prisma/adapter-pg`), not the
generated Prisma client: the generated client is ESM (`import.meta`) and the
Playwright runner transforms test modules as CJS, so importing it fails. Three
small queries (find user id, insert member, cascade-delete on teardown) don't
need an ORM. Table/column names mirror the `@@map` names in the schema.

## The ordering that makes it a proof

Bob navigates to the board and we wait until the seeded list ("To Do") is
visible **before** Alice creates the card — and we assert the card has count 0 on
Bob's page at that moment. So the card did not exist when Bob's page loaded
(no SSR delivery possible) and Bob never reloads. Its later appearance on Bob's
screen can only be the live `card:created` broadcast. Alice's own card is
asserted too (author-side sanity), which isolates "realtime broke" from "create
broke" when it goes red.

## CI

Separate **non-blocking** `.github/workflows/e2e.yml`: Postgres service →
`prisma migrate deploy` → `playwright install --with-deps chromium` →
`npm run test:e2e`. Kept out of the required US-008 gate because E2E is slower
and flakier; promote to a required check once stable. Uploads the Playwright
report on failure.

## Teardown & data hygiene

Unique per-run emails (`alice-${Date.now()}@e2e.test`) avoid collisions without
inter-run cleanup races. `afterAll` best-effort deletes the workspace (cascades
boards/lists/cards/members) and both users (cascades sessions/accounts), and
closes the `pg` pool; failures there are swallowed so they can't mask a result.

## Blast radius

Additive: new dev-dependency (`@playwright/test`), new `e2e/` dir, new workflow,
`.gitignore` entries, one npm script. No production code touched. The new files
keep the US-008 gate green (vitest ignores `e2e/**`; tsc + eslint pass on them).
