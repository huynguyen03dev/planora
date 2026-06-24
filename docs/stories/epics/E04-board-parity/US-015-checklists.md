# US-015 Checklists

## Status

implemented

## Lane

normal (with stronger validation — new DB-writing Server Actions on the mutation
boundary)

Spec slice from `docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md`
(Theme B — Daily-use Parity, P1; third child of epic `E04-board-parity`, after
US-013 filtering and US-014 search). The `Checklist`/`ChecklistItem` schema exists
but the only UI is a dead `<ActionChip label="Checklist" />` placeholder in the
card detail sheet — a "schema written, UI not cashed" gap this story retires.

Risk flags: public-contract (new Server Action shapes / client-visible behavior),
weak-proof (board/detail UI has no RTL harness), data-model-adjacent (new write
paths, though the tables already exist so **no migration**). No hard gate — no
auth/authz change (reuses `card:["update"]`), no external system, no validation
weakened. 2 effective flags → normal lane with US-006-style security tests on
every new action.

## Product Contract

A card can carry **checklists**, each a titled group of **items** that can be
checked off. On the card detail sheet a user can: add a checklist, delete a
checklist (cascades to its items), add an item, toggle an item complete/incomplete,
and delete an item. All five are Server Actions gated by `card:["update"]` (viewer
denied; editor/admin allowed), workspace-isolation-scoped via the checklist's
owning board.

Scope: **slice 1 is the data layer + actions + the detail-sheet UI.** Deferred to
follow-ups (positions are float-gap assigned so they slot in without rework):
renaming a checklist/item, drag-reordering, a per-checklist progress bar beyond a
simple count, and **cross-client realtime** (checklists render only in the detail
sheet; slice 1 revalidates the board path, same as the estimate/due-date actions
which also do not emit — listed alongside the matrix's other pending events).

## Slices / PRs

- **PR1 (this packet, data layer):** Zod schemas, `lib/checklist.ts` query+write
  layer, the 5 Server Actions, and the US-006-style security suite. No UI yet.
- **PR2 (UI):** replace the dead `ActionChip` with a real checklist section in
  `card-detail-sheet.tsx` (add/toggle/delete wired to the actions) + manual
  browser QA.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` (Card metadata → Checklists row)

## Acceptance Criteria

- Server Actions exist for: create checklist, delete checklist, add item, toggle
  item, delete item — each `verifySession()` → `card:["update"]` permission →
  workspace-isolation scoping (workspaceId derived from the checklist's board,
  never client-supplied) → Zod parse → Prisma → `revalidatePath`.
- A denied caller (signed out / viewer / wrong workspace) reaches **no** write
  seam and gets a not-found-style error (no resource existence leak).
- New items/checklists append in float-gap position order.
- Deleting a checklist cascades to its items (schema relation).
- (PR2) The card detail sheet renders checklists with checkable items, replacing
  the disabled placeholder button.

## Design Notes

- Permission: reuse `card:["update"]` (no dedicated `checklist` statement) —
  consistent with labels reusing card/board permissions.
- Scoping resolvers: `getChecklistWithCard(checklistId)` and
  `getChecklistItemWithCard(itemId)` return a `ChecklistScopeRecord`
  (`{ board:{workspaceId,archivedAt}, boardId, cardId, cardArchived }`), mirroring
  `getLabelWithBoard`. The action derives `workspaceId` from this — the A3
  isolation guarantee.
- Activity: checklist create/delete write a `CHECKLIST` activity entry (the enum
  value already exists); per-item toggles do not log (would be noisy).
- Positions: float-gap append (`+16384`), reuse-ready for a future reorder slice.
- Realtime: deferred (see Scope).

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-015 --unit 0 --integration 1 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — actions are integration-shaped (mock Prisma); pure helpers are thin. |
| Integration | `tests/server-actions/checklist.test.ts` — A1 auth / A2 viewer-denied / A3 cross-workspace isolation + positive control for each of the 5 actions, plus archived-board / archived-card guards. Sabotage-verified (defeating one gate turns its A2+A3 red). |
| E2E | (PR2) Manual browser QA of the detail-sheet checklist UI; automated E2E deferred (same board-UI debt as US-005/US-013/US-014). |
| Platform | n/a |
| Release | `npx tsc --noEmit`, `npm run lint`, `npm test` green. |

## Harness Delta

Third child of epic `E04-board-parity` (Theme B of IN-01). No new artifact
locations.

## Evidence

### PR1 (data layer)

- Integration: `npx vitest run tests/server-actions/checklist.test.ts` → **22
  passing** (5 actions × {A1, A2, A3, allow} + 2 archived guards). Full suite
  `npm test` → **405 passing** (was 383; +22). `npx tsc --noEmit` + `npm run lint`
  clean.
- Sabotage-verified: forcing `canUpdateCard = true` on `deleteChecklistItemAction`
  turned its A2 (viewer) + A3 (isolation) red while A1/allow stayed green;
  reverted.

### PR2 (UI)

- `components/boards/card-checklists-section.tsx` — new section rendered in the
  card detail sheet (replaces the dead `<ActionChip label="Checklist" />`). Per
  checklist: title, `done/total` count, item rows (native checkbox + delete),
  add-item form; plus an add-checklist form. Calls the 5 actions via a
  `useTransition` + `router.refresh()` runner (mirrors `CardLabelsSection`).
- Wiring: `page.tsx` loads `getCardChecklists(cardId)` in the existing parallel
  block and passes `checklists` to `<CardDetailSheet>`, which threads it through
  to `CardDetailDialogBody` → the section. No store/realtime changes (revalidate
  refreshes the prop).
- Proof: `npx tsc --noEmit` + `npm run lint` clean; `npm test` 405 green
  (unchanged — UI has no unit harness). Manual browser QA (2026-06-24, dev server
  + Chrome DevTools MCP, "Filter Board" → Card A):
  - Section shows "No checklists yet." + "Add checklist" (dead chip gone).
  - Create "Acceptance criteria" → renders at `0/0`; **activity log records
    "created this checklist"**.
  - Add item "Write unit tests" → `0/1`, checkbox + delete present.
  - Toggle complete → checkbox checked, `1/1`, line-through; **no activity spam**
    (item toggles don't log, as designed).
  - Delete item → `0/0`, "No items yet."
  - Delete checklist → "No checklists yet."; activity log records "deleted this
    checklist". Each step persisted through the real Server Action → Prisma →
    revalidate path.
