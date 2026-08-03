# 0026 Safe List Lifecycle and Permanent Deletion Semantics

Date: 2026-07-28

## Status

Accepted — implementation of story **US-074** (Safe List Lifecycle) may proceed.

## Context

Currently, `deleteListAction` in `app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts` performs an immediate hard delete (`db.list.delete`). Because Prisma cascade deletion is configured on the `List` model, deleting a list permanently destroys all contained cards, comments, checklists, checklist items, attachments, card members, and card labels without an archive buffer, recovery mechanism, or confirmation safety check.

This presents a critical data-loss risk for multi-tenant teams. If a list containing dozens of active cards is deleted by accident, the data cannot be restored through the application interface.

Card soft-deletion already exists in Planora via `Card.archivedAt` (US-016), but lists do not have an `archivedAt` field. To protect team data while supporting board hygiene, Planora requires a safe list lifecycle: soft-archive with full restore capability, and guarded permanent deletion.

## Decision

1. **Add Soft-Delete to List Model:** Introduce `archivedAt DateTime?` to the `List` model. Archiving a list (`archiveListAction`) sets `archivedAt = now()`.
2. **Archive Semantics:**
   - Archiving a list hides the list and all its contained cards from the active board view.
   - All underlying card relations, comments, attachments, checklists, and activity history remain intact in the database.
   - Contained cards retain their individual `archivedAt` status; list archiving acts as a scope filter on active board queries.
   - An archived list can be restored (`restoreListAction`) by workspace editors and admins, clearing `archivedAt` and returning the list and its cards to the active board view. Target position restored at original `List.position` if free; if any active list occupies it, it appends after the last active list (never renumbering active lists). Concurrent restores are safe via bounded retry on PostgreSQL P2002 partial unique index collisions.
3. **Guarded Permanent Deletion Semantics:**
   - Permanent deletion (`permanentlyDeleteListAction`) is restricted strictly to **workspace admins** (`admin` role). Editors and Viewers cannot permanently delete lists.
   - Permanent deletion is a multi-step operation requiring explicit user confirmation (e.g. typing the list name or confirming via a high-risk modal).
   - If an archived list contains unarchived/active cards, permanent deletion is blocked unless the admin explicitly chooses to "Archive all cards first" or "Force permanent deletion of list and all contents."
5. **Ordering Invariant & Partial Unique Index:**
   - Global `@@unique([boardId, position])` on `List` is replaced by a raw-SQL partial unique index `list_boardId_position_live_key` on `("boardId", "position") WHERE "archivedAt" IS NULL`, mirroring decision 0015/card precedent.
   - All board-list queries (`getListsByBoardId`), position calculations (`createList`, `resolveListPosition`), and normalization (`normalizeListPositions`) filter `where: { boardId, archivedAt: null }`.
   - Archiving a list (`archiveListAction`) does NOT emit `CARD_ARCHIVED` or `CARD_DELETED` history events; card rows and individual `Card.archivedAt` states remain unchanged to preserve event-sourced state integrity.
   - Slice A reuses the existing `list:deleted` realtime payload/event purely as the active-board view-removal signal.


## Alternatives Considered

1. **Keep Immediate Hard-Delete with Undo Toast:** Rejected — Toast timeouts (e.g. 5 seconds) are inadequate for accidental deletion discovery after page reload or session end.
2. **Soft-Delete Lists without Permanent Delete Option:** Rejected — Workspaces need a way to purge unwanted lists permanently to comply with data cleanup policies.
3. **Move Cards to Default List on List Delete:** Rejected — Loss of original list context breaks card organization and historical structure.

## Consequences

Positive:
- Eliminates accidental catastrophic data loss when lists are deleted.
- Aligns List lifecycle semantics with Card soft-delete patterns (`archivedAt`).
- Provides workspace admins with safe data governance controls.

Tradeoffs:
- Requires a database schema update (adding `archivedAt` and `[boardId, archivedAt]` index to `List`).
- Board view queries must filter `where: { archivedAt: null }` for lists, matching the card filtering pattern.

## Follow-Up

- Story: US-074 (Safe list lifecycle — archive/restore plus guarded permanent deletion).
- Gate satisfied: accepted by the CEO before US-074 code changes began.
