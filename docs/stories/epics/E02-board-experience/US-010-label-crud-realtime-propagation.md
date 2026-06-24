# US-010 Label rename/recolor/delete realtime propagation

## Status

implemented

## Lane

normal

Change request completing a documented limitation of US-005. Risk flags: public
contract (extends a socket event), existing behavior (US-005 reducer is
test-covered), weak proof (label-CRUD propagation was manual-only). No hard gate
— authorization reuses the existing `board:["update"]` gate (proven by
US-006/007), no schema/migration. Two-to-three flags → normal with stronger
validation.

## Product Contract

When an `admin`/`editor` renames, recolors, or deletes a board label, the
card-face label chips update or disappear **live** for every other user viewing
the board — no reload. This matches how attach/detach already propagate. Prisma
remains the source of truth; the socket event is a notification only.

Closes the US-005 limitation: "label-set CRUD propagates via `revalidatePath`,
not the socket event," which left other viewers with stale chips until reload.

## Relevant Product Docs

- `docs/product/realtime-sync.md` (label events; in-place/live classification)
- `docs/product/boards-and-cards.md` (Labels row)

## Acceptance Criteria

- Renaming or recoloring a label updates the chip on every card carrying it,
  live, on other viewers' boards (no reload).
- Deleting a label removes its chip from every card carrying it, live, on other
  viewers' boards (no reload).
- Propagation reuses the existing in-place `card:labels-updated` event (never
  deferred during drag), so chips refresh even while an observer is mid-drag.
- No new authorization surface: the actions keep the existing `board:["update"]`
  gate and workspace-isolation scoping.

## Design Notes

- **Commands:** `updateLabelAction` / `deleteLabelAction` in
  `boards/[boardId]/actions.ts` now fan out after the DB write. A local
  `broadcastLabelChange(boardId, cardIds)` helper re-emits `card:labels-updated`
  once per affected card with its current label set — reusing the proven
  live-apply reducer instead of adding a new event type.
- **Queries:** new `getCardIdsWithLabel(labelId)` in `lib/label.ts`. For a
  delete the affected card ids are captured **before** `deleteLabel` (the
  `CardLabel` rows cascade away with the label); the post-delete re-read of each
  card then reflects the removed label.
- **API:** none public.
- **Tables:** none (no schema change).
- **Domain rules:** O(N) emits in the number of cards carrying the label —
  negligible at board scale; chosen over a new board-level event to keep the
  surface small and reuse the unit-tested reducer.
- **Client fix:** `applyRemoteCardLabelsUpdated` (`board-store.ts`) deduped
  self-echoes on label **id only** — a rename/recolor keeps the id set, so it
  would have been swallowed. Now compares the full `{id,name,color}` snapshot
  (also a correctness fix for recolor self-echoes).
- **UI surfaces:** none changed — `card-labels-section.tsx` already drives the
  actions; `list-card-item.tsx` re-renders chips from the per-card snapshot.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-010 --unit 1 --integration 1 --e2e 1 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | `tests/board-store.test.ts` — new case: a rename/recolor applies even when the label id set is unchanged (not deduped). Sabotage-verified (id-only compare turns it red). |
| Integration | `tests/server-actions/list-card.test.ts` — `updateLabelAction`/`deleteLabelAction` auth/permission/isolation boundary still green with the new fan-out seam mocked. |
| E2E | `e2e/realtime-label-sync.spec.ts` — two users, one board: a label renamed by one updates the chip live for the other; a label deleted removes it live. Sabotage-verified (fan-out off turns both red). |
| Platform | chromium on `ubuntu-latest` via the existing `e2e.yml`; unit/integration via `ci.yml`. |
| Release | `npm run lint`, `npx tsc --noEmit`, `npm test` (363) all green; E2E suite green (label specs green together with US-009's). |

## Harness Delta

None to harness tooling. Updates `docs/product/realtime-sync.md`,
`docs/product/boards-and-cards.md`, and `docs/TEST_MATRIX.md`.

## Evidence

- Unit: `npm test` → 363 passing (was 362; +1 board-store dedupe case).
  Sabotage: reverting the dedupe to id-only turns the new case red on the
  reference-identity assertion; reverted.
- E2E: `npx playwright test realtime-label-sync` → 2 passing (~40s). Sabotage:
  neutralizing `broadcastLabelChange` leaves Bob's chip stale — the rename test
  fails (`Renamed-Triage` never appears) and the delete test fails (`Obsolete`
  count stays 1); reverted. Full E2E suite green together (the card-move
  deferral test retains its known keyboard-lift flake, green on isolation /
  CI retry).
- `npm run lint` clean; `npx tsc --noEmit` clean.
