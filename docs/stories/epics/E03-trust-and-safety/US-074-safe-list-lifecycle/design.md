# Design — US-074 Safe List Lifecycle

## Domain Model

- **List Entity:** Gains `archivedAt DateTime?` field.
  - Active list: `archivedAt == null`
  - Archived list: `archivedAt != null`
- **Active Board Query:** Updated to filter `where: { boardId, archivedAt: null }`.
- **List Lifecycle State Machine:**
  - `Active` ──(archiveListAction)──> `Archived`
  - `Archived` ──(restoreListAction)──> `Active`
  - `Archived` ──(permanentlyDeleteListAction)──> `Deleted` (DB Row Removed)

## Application Flow & Server Actions

1. `archiveListAction({ listId })`:
   - Gated by `list:["delete"]` permission (editors & admins).
   - Validates session & workspace isolation.
   - Sets `List.archivedAt = now()`.
   - Records `LIST_ARCHIVED` in Activity Log.
   - Broadcasts `list:archived` socket event and revalidates board path.

2. `restoreListAction({ listId })`:
   - Gated by `list:["delete"]` permission (editors & admins).
   - Validates session & workspace isolation.
   - Sets `List.archivedAt = null`.
   - Records `LIST_RESTORED` in Activity Log.
   - Broadcasts `list:created` / `list:updated` socket event and revalidates board path.

3. `permanentlyDeleteListAction({ listId, confirmationText })`:
   - Gated strictly by `organization:["update"]` or `list:["permanent_delete"]` (**Admin only**).
   - Validates `confirmationText` matches the list title.
   - Checks if list is archived (`archivedAt != null`). If list is active, rejects with `LIST_MUST_BE_ARCHIVED_FIRST`.
   - Executes `db.$transaction` to remove list and log `LIST_PERMANENTLY_DELETED`.
   - Revalidates board path.

## Data Model & Migration Concerns

- **Schema Modification (Prisma):**
  - Add `archivedAt DateTime?` to `List` model in `prisma/schema.prisma`.
  - Add composite index `@@index([boardId, archivedAt])` on `List`.
  - Migration script: `npx prisma migrate dev --name add_list_archived_at`.

## UI / Platform Impact

- **Board Column Menu:** Replace "Delete List" with "Archive List".
- **Board Header Archive Drawer:**
  - Add "Archived Lists" tab alongside "Archived Cards".
  - Displays list title, card count, archive timestamp.
  - "Restore" button (visible to editors and admins).
  - "Delete Permanently" button (visible to admins only, triggers confirmation modal).

## Observability & Audit Logs

- `Activity` log entries captured for `LIST_ARCHIVED`, `LIST_RESTORED`, and `LIST_PERMANENTLY_DELETED` with `userId`, `workspaceId`, `boardId`, `listId`.
