# Boards & Cards

The kanban core: boards hold ordered lists, lists hold ordered cards, and cards
carry rich metadata. All mutations are Server Actions under
`app/(authenticated)/(dashboard)/boards/**/actions.ts`; query logic lives in
`lib/board.ts`, `lib/list.ts`, `lib/card.ts`.

## Boards

- Created inside a workspace with a title and optional `backgroundColor`.
- Actions: `createBoardAction`, `updateBoardAction`, `deleteBoardAction`.
- Soft-deleted via `archivedAt`; deletion cascades to lists, cards, labels,
  stars, and activity.
- Users can **star** a board (favorite) — `BoardStar`, unique per user+board.

## Lists

- Ordered columns on a board, ordered by `position Float`, unique per
  `(boardId, position)`.
- Actions: `createListAction`, `updateListAction` (rename),
  `updateListIsDoneAction` (toggle completion column), `deleteListAction`,
  `reorderListAction`.
- `isDone` marks the completion column: **moving a card into an isDone list
  auto-sets the card's `completedAt`**; moving it out reopens it.

## Cards

- The work item. Fields: title, `description` (text), `priority`
  (`URGENT|HIGH|MEDIUM|LOW`), `dueDate`, `estimateHours`, `completedAt`,
  cover image, `archivedAt` (soft delete).
- Actions: `createCardAction`, `updateCardDetailsAction` (title/description),
  `updateCardEstimateAction`, `updateCardDueDateAction`, `archiveCardAction`,
  `reorderCardAction`, `moveCardAction`.
- **Estimate rule:** once a card has completed once, its estimate cannot be
  changed (audited as `ESTIMATE_CHANGED` history). Workspaces may require an
  estimate before a card can be marked done (`requireEstimateBeforeDone`).
- **Move semantics:** `moveCardAction` relocates a card across lists and applies
  the auto-completion/reopen logic based on the target list's `isDone`.

## Card metadata

| Feature | Model | Action(s) | Notes |
| --- | --- | --- | --- |
| Assignees | `CardMember` | `assignCardMemberAction`, `removeCardMemberAction` | Workspace members only; assignment notifies + emails; assign/remove broadcast live via `card:members-updated` so an open card detail sheet on another client updates without reload (US-011). Members render in the detail sheet only, not the card face. |
| Labels | `Label` / `CardLabel` | `createLabelAction`, `updateLabelAction`, `deleteLabelAction`, `addCardLabelAction`, `removeCardLabelAction` | Board-scoped, named + colored (palette from `BOARD_COLORS`); attached per card. Label-set CRUD reuses `board:["update"]`, attach/detach reuse `card:["update"]` — no dedicated `label` permission statement (US-005). Managed in the card detail sheet; colored chips render on the card face in the board view; attach/detach broadcast live via the `card:labels-updated` socket event; label rename/recolor/delete fan that same event out per affected card so chips refresh live for other viewers (US-010). |
| Checklists | `Checklist` / `ChecklistItem` | — | Ordered items with `isCompleted` |
| Comments | `Comment` | `createCommentAction` | Notifies + emails; applied live over socket |
| Attachments | `Attachment` | `uploadAttachmentAction` | Cloudinary-hosted; orphan cleanup on failure |

## Ordering (Float gap positioning)

Lists, cards, checklists, and checklist items order by `position Float` with a
gap of `16384`. New positions are the midpoint between neighbours; the system
normalizes positions on overflow. The neighbour math is pure and unit-tested in
`lib/dnd/apply-drop.ts` (`translateCardDrop`, `translateListDrop`).

## Drag-and-drop

- Implemented with `@hello-pangea/dnd`; both lists and cards are draggable,
  within and across lists.
- The drop produces an optimistic local update, then a `reorder*`/`moveCard`
  Server Action persists the new position and emits a socket event.
- Remote structural events are **deferred during an active drag** and resynced
  on drop — see `realtime-sync.md`. This is a load-bearing invariant.
- The board does **not** lock during persistence: `ListColumn` / `ListCardItem`
  are memoized and `apply-drop` preserves untouched-list references, so a drop
  re-renders only the affected columns, and dragging stays available while the
  Server Action is in flight (correctness held by the optimistic commit +
  rollback). Pure reorder/move skip `revalidatePath`; see decision 0008 and
  story `US-004`. On very large columns (~90+ cards) the residual cost is DOM
  layout / `@hello-pangea/dnd` measurement, not React re-renders — windowing is
  a tracked follow-up, not done here.

## Filtering & search

- Two board-header controls narrow the visible cards, client-side and per-viewer:
  a **label filter** (US-013) and a **title search** (US-014). Both are live with
  no reload, no server round-trip, and no Server Action; neither mutates data nor
  is shared with other viewers.
- **Label filter:** options are the labels actually in use on the board; selecting
  one or more shows only cards carrying at least one of them (OR). The control is
  hidden when the board has no labels.
- **Search:** a header box narrows to cards whose **title** contains the typed
  text (case-insensitive substring), live as you type; a clear (✕) button resets
  it. Search is **title-only** in slice 1 — the board-view card payload carries
  `title` and `labels` but not `description` (that lives in the detail sheet), so
  searching the description is a follow-up that first enriches the card payload.
- **Composition:** search and the label filter combine via **AND** — a card is
  visible only if it matches the query *and* the active label filter.
- Non-matching cards are **hidden (CSS), not removed** from the rendered list, so
  `@hello-pangea/dnd`'s index space stays aligned with the store's `cards` array
  and drop positions are never corrupted (see `lib/dnd/apply-drop.ts`).
- A list whose cards are all narrowed out (by filter and/or search) shows a
  "No cards match" hint instead of the empty "No cards yet" placeholder.
- Filtering by **assignee** and **due date** is a planned follow-up slice: the
  board-view card payload carries `labels` but not `dueDate`/`assignees` yet
  (those live in the card detail sheet), so those dimensions need the card
  payload enriched first.

## Activity

Board/list/card changes write to the workspace **Activity** log
(`lib/activity.ts`) with an action + entity type, powering audit and recent-
activity views. Board/card references use `SetNull` so the log survives deletion.

## Validation & access

Every action: `verifySession()` → workspace permission check
(`board`/`list`/`card` statements in `lib/permissions.ts`) → Zod parse
(`lib/schemas/`) → Prisma (transaction for multi-row position writes) → emit.
`viewer` role cannot mutate structure; `editor` can CRUD content but not delete
boards or manage members; `admin` has full control.
