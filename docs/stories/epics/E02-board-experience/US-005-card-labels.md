# US-005 Card Labels

## Status

in_progress

Slice 1 (this change): full label CRUD + attach/detach, role-gated, with label
management UI in the card detail sheet. Slice 2 (follow-up): card-face chips in
the board view + realtime broadcast (threads `labels` through the Zustand store /
`apply-drop` / card payloads — kept with the perf path, see US-004).

## Lane

normal

## Product Contract

Boards carry a set of named, colored **labels**. Members with content-edit
rights can create, rename, recolor, and delete a board's labels, and can attach
or detach any of the board's labels on a card. Labels render as colored chips on
the card face (board view) and in the card detail sheet. Label changes broadcast
live to other board viewers. Deleting a label removes it from every card it was
attached to.

Labels are **board-scoped** (`Label.boardId`) and many-to-many with cards
(`CardLabel`), matching the existing schema. No schema or migration change.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` (Card metadata → Labels row)
- `docs/product/realtime-sync.md` (new label events, classified in-place/live)

## Acceptance Criteria

- An `admin`/`editor` can create a label on a board (name + color from the
  shared palette), rename it, recolor it, and delete it. A `viewer` cannot
  (server rejects, UI hides the controls).
- From a card, an `admin`/`editor` can attach/detach any of the board's labels;
  a `viewer` cannot. Attaching an already-attached label is a no-op (CardLabel
  composite PK).
- Labels appear as colored chips on the card face in the board view and in the
  card detail sheet; the disabled "Labels" `ActionChip` is replaced with a real
  control.
- All label mutations are workspace-isolated: the action loads the board/card,
  verifies it belongs to the session's workspace, then checks
  `board:["update"]` (label CRUD) or `card:["update"]` (attach/detach) via
  `hasWorkspacePermission`.
- Deleting a label cascades to its `CardLabel` rows (cards lose the chip).
- Label add/remove/CRUD emits a **live, in-place** realtime event to the board
  room; it is NOT structural and is NOT deferred during drag.

## Design Notes

- **Commands** (new, in `boards/[boardId]/actions.ts`): `createLabelAction`,
  `updateLabelAction`, `deleteLabelAction`, `addCardLabelAction`,
  `removeCardLabelAction`. Each follows the standard order:
  `verifySession()` → load board/card for workspace scope → `hasWorkspacePermission`
  → Zod parse → Prisma → realtime emit → `revalidatePath` → serializable return.
  (Attach/detach mirror `assignCardMemberAction`/`removeCardMemberAction`.)
- **Queries**: include board `labels` on board-page load; include each card's
  attached labels (`include: { labels: { include: { label: true } } }`) in
  `lib/board.ts` / `lib/card.ts` selects.
- **API**: none public.
- **Tables**: `Label`, `CardLabel` (already exist — no migration).
- **Domain rules**: color drawn from a fixed palette (reuse the tokens behind
  `components/boards/color-palette.tsx`); label belongs to exactly one board;
  CardLabel PK `(cardId, labelId)` dedupes; `onDelete: Cascade` removes
  CardLabel rows on label or card delete.
- **Authorization**: reuse existing `board`/`card` statements — NO new statement
  in `lib/permissions.ts`. This is the decision that keeps the story in the
  normal lane (a dedicated `label` statement would be an authorization hard
  gate). `viewer` is read-only; `editor`/`admin` mutate.
- **Realtime**: add a board-room event (e.g. `card:labels-updated` for
  attach/detach; `board:labels-updated` for label-set CRUD). Classify as
  **in-place / live** in `realtime-sync.md` (safe mid-drag, like `card:updated`).
- **UI surfaces**: `card-detail-sheet.tsx` (label popover: list board labels with
  toggle checkboxes + create/edit/delete inline) replacing the disabled chip;
  `list-card-item.tsx` (chips on card face); new
  `lib/schemas/label.ts` Zod validators.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-005 --unit 1 --integration 1 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | Zod label schema (name length, color in palette) — pure, in `lib/schemas`. |
| Integration | Server actions with `vi.mock("@/lib/prisma")`: viewer denied, editor allowed, workspace isolation enforced, attach dedupe no-op, delete cascade. Addresses the weak-proof flag. |
| E2E | Deferred — no RTL/Playwright harness yet (tracked debt). |
| Platform | n/a |
| Release | `npm run build` + `npm run lint` clean. |

## Harness Delta

None to harness tooling. Updates `docs/product/boards-and-cards.md` (Labels row),
`docs/product/realtime-sync.md` (label events), and `docs/TEST_MATRIX.md`.

## Evidence

Slice 1 (commit on `feat/card-labels-US-005`):

- Unit + data-layer tests green: `lib/schemas/label.test.ts` (8),
  `lib/label.test.ts` (6) — `npx vitest run` → 97/97 passing.
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build` clean.
- Action permission gating (verifySession → `hasWorkspacePermission` →
  Prisma) is NOT yet covered by an integration test — tracked gap.
- Slice 2 pending: card-face chips screenshot + realtime.
