# Validation

## Contract

A change made by one user on a board is delivered live, over the real Socket.io
wire, to another user viewing the same board — with no reload. Slice 1 proves
this for card creation.

## Expectations

| Layer | Expected proof |
| --- | --- |
| Unit | Store-reducer apply/defer/dedupe already proven (`tests/board-store.test.ts`) |
| Integration | Server Action emit path exercised via the live `emitCardCreated` |
| E2E | Two browser contexts, two users, one board: A creates a card → B sees it live (`e2e/realtime-card-create.spec.ts`) |
| Platform | chromium on `ubuntu-latest` via `.github/workflows/e2e.yml` (Postgres service) |
| Release | Non-blocking check; promote to required once stable |

## Proof status

**Implemented (2026-06-23).** `e2e/realtime-card-create.spec.ts` — 1 test, green
locally (~16s) against the real `server.ts` (Next + Socket.io) and Postgres.

- Two isolated browser contexts (Alice, Bob); Alice owns workspace+board+list,
  Bob seeded as `editor` member.
- Ordering proof: Bob's board is loaded and the card asserted absent (count 0)
  **before** Alice creates it; Bob never reloads.
- **Sabotage-verified:** guarding `emitCardCreated` behind `if (false)` turned
  the Bob assertion red (card never arrives) while Alice's own card still
  rendered — the test isolates realtime-broadcast failure from create failure.
  Reverted clean.

**Gate impact:** `npm run lint`, `npx tsc --noEmit`, and `npm test` (362, vitest)
all stay green; vitest ignores `e2e/**`, so the US-008 required gate is
unaffected.

## Out of scope (follow-up slices)

- Card move / DnD propagation + drag-aware deferral (keyboard-drag automation).
- Label / comment / list realtime propagation.
- Invite→accept UI flow as the membership path.
- Promoting the E2E workflow to a required status check.
