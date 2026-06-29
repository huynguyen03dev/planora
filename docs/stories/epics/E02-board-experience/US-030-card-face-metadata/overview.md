# Overview — US-030 Card-face metadata row

## Current Behavior

A card on the board face renders **only** its label chips, title, and a priority
chip. `dueDate`, assignees, checklist progress, and comment count all exist in
the schema but never appear on the card — an overdue card gives zero visual
warning, and you cannot see who is on a card or how much work/discussion it
carries without opening the detail sheet. The board-view payload
(`getListsByBoardId`) carries only
`id/listId/title/position/coverImage/priority/labels`.

## Target Behavior

The card face shows a metadata row:

- **Due-date badge** with state: `overdue` (destructive), `today` ("Today",
  amber), `soon` ("Tomorrow" / within 3 days, amber), `upcoming` (muted), and
  `done` (emerald, when `completedAt` is set — a completed card never reads as
  overdue). The accessible label always says "Due …" / "overdue" / "Completed …".
- **Assignee avatars** — an `AvatarGroup` of up to 3 members with a `+N` overflow
  chip when there are more.
- **Checklist progress** — `done/total` with a checkmark icon; emerald when all
  items are done, otherwise muted. Hidden when the card has no checklist items.
- **Comment count** — count with a comment icon. Hidden when zero.

Priority keeps its existing chip and now shares the metadata row. The whole row
renders only when the card has at least one of these. Values reflect on the
viewer's next board render/refresh (the detail-sheet autosave already refreshes).

## Affected Users

- All board viewers (read surface; `viewer` sees the same card face).
- Editors/admins indirectly — their card edits (due date, members, checklist,
  comments) now surface on the board face on refresh.

## Affected Product Docs

- `docs/product/boards-and-cards.md` — **Card metadata** table (the "Members
  render in the detail sheet only" note) and **Filtering & search** (the payload
  now carries `dueDate`/`assignees`).
- `docs/decisions/0011-card-face-metadata-payload.md` — payload + FK indexes.

## Non-Goals

- New persisted fields, Server Actions, or auth/authorization changes.
- Live cross-client broadcast of the new card-face fields.
- Assignee/due-date filtering (now unblocked, separate slice).
- Board virtualization (decision 0010).
