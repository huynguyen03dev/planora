# Validation

## Contract

A change made by one user on a board is delivered live, over the real Socket.io
wire, to another user viewing the same board — with no reload. Slice 1 proves
this for card creation; slice 2 proves it for card moves and proves the
drag-aware deferral invariant (a structural remote event is deferred while the
observer is mid-drag, then reconciled on drop).

## Expectations

| Layer | Expected proof |
| --- | --- |
| Unit | Store-reducer apply/defer/dedupe already proven (`tests/board-store.test.ts`) |
| Integration | Server Action emit path exercised via the live `emitCardCreated` / `emitCardMoved` / `emitCardArchived` |
| E2E | Two browser contexts, two users, one board: A creates a card → B sees it live (`e2e/realtime-card-create.spec.ts`); A moves a card → B sees it relocate, and a remote structural event is deferred while B is mid-drag then reconciled on drop (`e2e/realtime-card-move.spec.ts`) |
| Platform | chromium on `ubuntu-latest` via `.github/workflows/e2e.yml` (Postgres service) |
| Release | Non-blocking check; promote to required once stable |

## Proof status

**Slice 1 — Implemented (2026-06-23).** `e2e/realtime-card-create.spec.ts` — 1
test, green locally (~16s) against the real `server.ts` (Next + Socket.io) and
Postgres.

- Two isolated browser contexts (Alice, Bob); Alice owns workspace+board+list,
  Bob seeded as `editor` member.
- Ordering proof: Bob's board is loaded and the card asserted absent (count 0)
  **before** Alice creates it; Bob never reloads.
- **Sabotage-verified:** guarding `emitCardCreated` behind `if (false)` turned
  the Bob assertion red (card never arrives) while Alice's own card still
  rendered — the test isolates realtime-broadcast failure from create failure.
  Reverted clean.

**Slice 2 — Implemented (2026-06-24).** `e2e/realtime-card-move.spec.ts` — 2
tests, green locally (~35s combined); full E2E suite (3 tests) green together.

- **Card move propagation:** Alice keyboard-drags a card "To Do" → "Doing"; it
  relocates live in the correct list's droppable on Bob's already-loaded board
  with no reload. Card position is asserted absent in the target before the move
  (ordering proof). **Sabotage-verified** via `emitCardMoved` (`if (false)`):
  Bob's assertion went red while Alice's author-side move still rendered.
- **Drag-aware deferral (the headline invariant):** Bob lifts a card and HOLDS
  it (keyboard sensor → `isDragging` armed). Alice archives a different card
  (mouse, so no foreground-focus contention with Bob's held drag) — a structural
  `card:archived`. A live-applied rename of a third card is the delivery barrier:
  once it shows on Bob's still-dragging board, socket in-order delivery
  guarantees the earlier archive was delivered too. Assertion: the archived card
  is **still present** on Bob mid-drag (deferred, not applied to the list array).
  Bob drops → `consumeResync()` → `router.refresh()` → the archive folds in (card
  gone). **Sabotage-verified** by removing the `isDragging` guard in
  `handleCardArchived`: the archive applied mid-drag and the deferral assertion
  (`toHaveCount(1)`) went red. Reverted clean.
- **Mechanics:** drags use the keyboard sensor (`@hello-pangea/dnd` ignores
  synthetic pointer/CDP drags); list/card scoping is by `data-rfd-*` ids resolved
  from the DB. `liftCard` retries Space until the live region confirms the lift,
  never double-pressing a lifted card. The `pg` pool was made lazily
  re-creatable so per-file `afterAll` disconnects don't break the next spec.

**Gate impact:** `npm run lint`, `npx tsc --noEmit`, and `npm test` (362, vitest)
all stay green; vitest ignores `e2e/**`, so the US-008 required gate is
unaffected.

## Out of scope (follow-up slices)

- Label / comment / list realtime propagation; list reorder (`list:moved`).
- Cross-user move where the observer is *also* mid-drag of their own card
  (cross-context keyboard-focus contention — deferred to a future approach).
- Invite→accept UI flow as the membership path.
- Promoting the E2E workflow to a required status check.
