# Overview — US-074 Safe List Lifecycle

## Status

implemented — Slices A & B (soft archive and restore), Slice B2 (archived-list boundary hardening), and Slice C (guarded permanent purge) are implemented and verified. Governed by Decisions 0026 and 0029 (Accepted).

### Slice B2 — Archived-List Boundary Hardening (prerequisite for Slice C)

Implemented central resolver guards that make an archived List immutable through all ordinary list/card/checklist/comment/member/label/attachment actions and background automation/reminder processing:

- **`getListWithBoard`** now filters `archivedAt: null` — active lists only. Ordinary list actions (`updateListAction`, `reorderListAction`, `createCardAction`, `moveCardAction` target check) naturally reject archived lists via "List not found".
- **`updateListTitle`** now includes `where: { archivedAt: null }` — defense in depth at the Prisma layer.
- **`getCardWithListAndBoard`** returns `null` when the parent list is archived — every card-layer action (`archiveCardAction`, `reorderCardAction`, `updateCardDetailsAction`, `createCommentAction`, `assignCardMemberAction`, `removeCardMemberAction`, `addCardLabelAction`, `removeCardLabelAction`, `updateCardPriorityAction`, `updateCardCoverAction`, `setCardCoverAction`, `uploadAttachmentAction`, `moveCardAction` source check) rejects with "Card not found".
- **`getCardWithListAndMembers`** returns `null` when the parent list is archived — `toggleCardCompletionAction`, `updateCardEstimateAction`, `updateCardDueDateAction` reject with "Card not found".
- **`getArchivedCardWithListAndBoard`** ensures parent list is active (`list.archivedAt: null`) — `restoreCardAction` rejects with "Card not found" when the parent list is archived; user must restore the list first.
- **Checklist scope** (`getChecklistWithCard`, `getChecklistItemWithCard`) now exposes `listArchived: boolean` — all four checklist/item actions reject with "Checklist not found"/"Item not found".
- **Due-date reminder cron** (`buildCardSelectionWhere`, scheduled pass) filters `list.archivedAt: null` — eliminates reminders and scheduled automation on cards under archived lists.
- **Analytics** left untouched — documented as remaining limitation (analytics processes `CardHistoryEvent` rows that were already committed before list archive; the events themselves are not replayed).

## Current Behavior

`deleteListAction` in `app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts` previously performed an immediate, hard SQL deletion (`db.list.delete`). With Slice A implemented, `deleteListAction` / `archiveListAction` performs a soft archive (`archivedAt = now()`), eliminating immediate hard-delete data destruction.

## Target Behavior

List deletion is restructured into a safe two-stage lifecycle:

1. **Soft-Delete / Archive (`archiveListAction`):**
   - Setting `archivedAt = now()` on a list soft-deletes the list.
   - Archiving a list hides it and its contained cards from the active board view.
   - All underlying card records, comments, attachments, checklists, and activity history are preserved.
   - Contained cards maintain their individual `archivedAt` status; list archiving acts as an active board query filter.
   - Editors and Admins can restore an archived list (`restoreListAction`), clearing `archivedAt` and restoring the list and its cards to the active board view.

2. **Guarded Permanent Deletion (`permanentlyDeleteListAction`):**
   - Restricted strictly to **Workspace Admins** (`admin` role). Editors and Viewers cannot permanently delete lists.
   - Requires explicit confirmation in the UI (e.g. confirming list name in a modal).
   - If active/unarchived cards exist inside the archived list, permanent deletion is blocked unless explicit force-delete confirmation is provided.
   - Lists containing Cloudinary-backed attachments are blocked until durable external-asset cleanup exists.
   - Every cascaded card receives a truthful `CARD_DELETED` history event in the same transaction before database deletion. No unsupported list-level audit event is fabricated.

## Affected Users

- **Workspace Admins:** Full authority to archive, restore, and permanently delete lists.
- **Workspace Editors:** Authority to archive and restore lists; denied permanent deletion.
- **Workspace Viewers:** Read-only access; denied all archive/restore/deletion actions.

## Affected Product Docs

- `docs/product/boards-and-cards.md` — document list soft-delete (`archivedAt`), archive/restore actions, and guarded permanent deletion semantics.
- `docs/decisions/0026-safe-list-lifecycle-and-deletion-semantics.md` — Decision record governing safe list lifecycle.
- `docs/TEST_MATRIX.md` — update matrix proof status for list lifecycle.

## Non-Goals

- Changing card soft-delete semantics (US-016 already handles card archive/restore).
- Auto-expiring or auto-purging archived lists after N days (v1 keeps archived lists indefinitely until manually purged by an admin).
- Restructuring board soft-deletion (boards already use `archivedAt`).
