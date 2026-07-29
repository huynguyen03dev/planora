# Exec Plan — US-074 Safe List Lifecycle

## Goal

Replace immediate hard-delete in `deleteListAction` with a two-stage safe lifecycle: soft-archive with restore support, plus guarded permanent deletion for workspace admins.

## Scope

In scope:
- Schema update: add `archivedAt` and index to `List` model.
- Server Actions: `archiveListAction`, `restoreListAction`, `permanentlyDeleteListAction`.
- RBAC gating: archive/restore allowed for editors & admins; permanent delete allowed for admins only.
- UI: Board column "Archive List" menu item, Board Header "Archived Lists" drawer with Restore and Permanent Delete modals.
- Security tests & RBAC matrix updates.

Out of scope:
- Redesigning card soft-delete (US-016).
- Board-level deletion redesign.

## Risk Classification

Risk flags:
- `data_model`: Prisma schema migration (`List.archivedAt`).
- `authorization`: Admin-only permanent deletion gate; editor archive/restore.
- `existing_behavior`: Replaces existing hard-delete behavior in `deleteListAction`.

Hard gates:
- Data deletion & migration gate -> High-Risk lane.
- Requires Decision 0026 acceptance before coding.

## Work Phases (Planned)

1. **Intake & Decision Gate:** Record Decision 0026 and intake classification. (Current state: Complete).
2. **Schema & Migration:** Add `archivedAt` to `List` schema, run Prisma migration, update client.
3. **Server Action Implementation:** Update `lib/actions/list.ts` with `archiveListAction`, `restoreListAction`, `permanentlyDeleteListAction`.
4. **Security & Integration Tests:** Add test coverage in `tests/server-actions/list-lifecycle.test.ts` for auth, RBAC, workspace isolation, and archive/restore/delete behavior.
5. **UI Surface:** Update board column menu, construct "Archived Lists" drawer tab, wire confirmation modal.
6. **Verification & Audit:** Execute test suite, run Playwright E2E verification, update harness proof rows.

## Stop Conditions

Pause implementation and surface to human if:
- Schema migration encounters lock contention or breaking conflicts.
- RBAC permissions require unexpected role statement changes.
- Existing tests fail unexpectedly during migration.
