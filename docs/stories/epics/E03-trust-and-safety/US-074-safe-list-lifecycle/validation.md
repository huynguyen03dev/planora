# Validation Plan — US-074 Safe List Lifecycle

## Proof Strategy

Validation requires proving three layers:
1. **Server Action Security & Isolation:** Unit/Integration tests asserting auth, RBAC (editor vs admin vs viewer), and cross-workspace isolation for archive, restore, and permanent deletion.
2. **Data Integrity & Non-Destruction:** Asserting that archiving a list preserves all underlying cards, comments, and attachments without row deletion.
3. **FOR UPDATE Lock Protocol:** Ephemeral PostgreSQL sandbox tests proving row-lock behavior between purge, archive, and attachment producers.
4. **UI Wiring:** ArchivedCardsDialog behavior under `liveCardCount` / `cloudinaryBlocked` / `canPermanentDelete`; BoardHeader forwards `canPermanentDelete`; role-map derivation.

**E2E gap acknowledged:** No Playwright E2E exists for the list-lifecycle flow. An E2E would need to cover archive → view in drawer → restore → permanent delete as an admin, but the test infrastructure for multi-user board sessions is not set up for this flow. The server-action + component + PostgreSQL proof covers the acceptance criteria at the unit/integration level.

## Test Plan

| Layer | Test Description | Target File |
| --- | --- | --- |
| Unit / Schema | Prisma schema validation for `List.archivedAt` and composite index | `lib/list.test.ts` |
| Integration | `archiveListAction` security boundary (A1 auth, A2 viewer denied, A3 isolation) | `tests/server-actions/list-lifecycle.test.ts` |
| Integration | `restoreListAction` security boundary and active board re-query | `tests/server-actions/list-lifecycle.test.ts` |
| Integration | `permanentlyDeleteListAction` admin-only RBAC gate, title confirmation, Cloudinary guard, FOR UPDATE lock, conditional delete, concurrent restore rollback | `tests/server-actions/list-lifecycle.test.ts` |
| Integration | RBAC role-map proof: `canPermanentDelete` maps to `organization:update` and admin→true/editor→false/viewer→false | `tests/server-actions/list-lifecycle.test.ts` |
| Integration | Sabotage test: removing admin gate fails A2/A3 assertions; removing FOR UPDATE lock call-shape fails lock test | `tests/server-actions/list-lifecycle.test.ts` |
| Integration | Ephemeral PostgreSQL sandbox: migration atomicity, partial unique index, and 3 FOR UPDATE lock interleaving proofs (lock_timeout deterministic) | `tests/db-index-proof.test.ts` |
| Integration | `uploadAttachmentAction` FOR UPDATE lock + revalidation + compensation | `tests/server-actions/list-card.test.ts` |
| Integration | `setCardCoverAction` FOR UPDATE lock + revalidation + compensation | `tests/server-actions/card-priority-cover.test.ts` |
| Integration (Slice B2) | Create-card archived-list rejection | `tests/server-actions/list-card.test.ts` |
| Integration (Slice B2) | Move-card source/target archived rejection | `tests/server-actions/list-card.test.ts` |
| Integration (Slice B2) | All card mutation actions reject under archived parent list | `tests/server-actions/list-card.test.ts` |
| Integration (Slice B2) | Restore-card blocked when parent list is archived | `tests/server-actions/list-card.test.ts` |
| Integration (Slice B2) | Checklist/item actions reject with `listArchived` | `tests/server-actions/checklist.test.ts` |
| Integration (Slice B2) | Sabotage: defeating any resolver guard fails the action | `tests/server-actions/list-card.test.ts` (US-006 suite) |
| UI Component | ArchivedCardsDialog: 22 RTL tests covering admin wiring, liveCardCount, cloudinaryBlocked, dialog lifecycle | `components/boards/archived-cards-dialog.test.tsx` |
| UI Wiring | BoardHeader → ArchivedCardsDialog forwarding (RTL, mocked ArchivedCardsDialog captures canPermanentDelete prop) | `components/boards/board-header-wiring.test.tsx` |
| E2E | Archive → restore → permanent delete (admin) — **NOT IMPLEMENTED — known gap** | — |

## Acceptance Criteria Verification

- [x] **Slice A:** Archiving a list hides the column and its cards from the active board view (`where: { archivedAt: null }`), setting `List.archivedAt` while keeping child card rows and states completely intact with no card history events recorded.
- [x] **Slice A:** Partial unique index `list_boardId_position_live_key` and active-list position resolution exclude archived lists (`lib/list.test.ts`).
- [x] **Slice A:** `archiveListAction` security boundary (A1 auth, A2 viewer denied, A3 isolation) and non-destructive soft archive proven in `tests/server-actions/list-lifecycle.test.ts`.
- [x] **Slice B:** Restoring an archived list returns the column and all original cards to their exact previous positions (`restoreListAction` emits `list:restored` small list snapshot, handled drag-aware in `BoardStoreProvider` with `router.refresh()` card re-fetch, proven in `tests/server-actions/list-lifecycle.test.ts`, `components/boards/archived-cards-dialog.test.tsx`, `app/(authenticated)/(dashboard)/boards/[boardId]/board-store-provider.test.tsx`, and `tests/board-store.test.ts`).
- [x] **Slice B2:** Archived-list boundary hardening — central resolver guards reject mutations on cards under archived lists (`getListWithBoard`/`getCardWithListAndBoard`/`getCardWithListAndMembers` return null; `getChecklistWithCard`/`getChecklistItemWithCard` expose `listArchived`); due-date reminders and scheduled automation exclude archived-list cards. Proven in 19 new sabotage-sensitive test cases across `tests/server-actions/list-card.test.ts` and `tests/server-actions/checklist.test.ts`.
- [x] **Slice C:** Non-admin members (editors/viewers) cannot invoke `permanentlyDeleteListAction`.
- [x] **Slice C:** Admin-only `organization:["update"]` gate proven via A2 (viewer/editor) + A3 (cross-workspace) rejection.
- [x] **Slice C:** RBAC role-map proof: admin has `canPermanentDelete=true`, editor has `false`, viewer has `false` (direct `getBoardPagePermissionsForRole` test).
- [x] **Slice C:** Exact case-sensitive title confirmation required; wrong case, whitespace-padded, and mismatched titles all rejected.
- [x] **Slice C:** Archived-list only; active list and archived-board list rejected as "List not found".
- [x] **Slice C:** Cloudinary-backed attachment guard under FOR UPDATE (decision 0029) blocks permanent purge when any card has `cloudinaryPublicId` is not null. Guard is inside the same transaction that locks the list row — concurrent archive cannot race. Moved from outside-tx to inside-tx (fix).
- [x] **Slice C:** Live cards (`archivedAt:null AND deletedAt:null`) block permanent deletion without explicit force.
- [x] **Slice C:** Force intent explicitly submitted; never inferred. Force never bypasses auth, Cloudinary, title, or archived-list guards.
- [x] **Slice C:** Transaction body writes truthful CARD_DELETED CardHistoryEvent for every cascaded card before deletion — active, archived, and deleted-all-states cards included.
- [x] **Slice C:** Conditional deleteMany `WHERE archivedAt IS NOT NULL` with count=0 rolls back history (concurrent restore protection). FOR UPDATE lock at tx start narrows race window.
- [x] **Slice C:** FOR UPDATE call-shape proven: `tx.$queryRaw` with FOR UPDATE SQL is called; removing the mock (lock removal) makes success test fail. Revalidation edge cases tested (active row, missing row).
- [x] **Slice C:** Emit `list:deleted` + `analytics:refresh` only after successful commit.
- [x] **Slice C:** Double purge (after permanent delete) returns not found.
- [x] **Slice C:** DB interleaving proofs: 3 PostgreSQL sandbox tests with deterministic lock_timeout assertions: producer FOR UPDATE blocks archiver; archiver lock_timeout proves producer holds lock; purge lock freezes producer (zero rows after purge). See `tests/db-index-proof.test.ts`.
- [x] **Slice C:** UI: permanent-delete affordance visible only when `canPermanentDelete=true`; exact-typing modal with disabled→enabled confirm button and dialog stays open during async submit; force-delete checkbox driven by `liveCardCount` (not `cardCount`); Cloudinary blocked list shows no submit path; pending state ("Deleting…" disabled); error surfaces in dialog with retry; duplicate submission prevented. Admin wiring proven: `canPermanentDelete` derived server-side from role (admin=true), verified via direct role-map test (`getBoardPagePermissionsForRole`); boards page passes it through `BoardHeader` → `ArchivedCardsDialog` (RTL forwarding test, mocked ArchivedCardsDialog captures prop). 22 RTL tests + 2 wiring tests.
- [x] **Slice C: In-flight upload race closed:** `uploadAttachmentAction` and `setCardCoverAction` acquire FOR UPDATE lock on parent list and revalidate `archivedAt IS NULL` before inserting attachment under transaction client. On failure, just-uploaded Cloudinary asset is compensated (`cloudinary.uploader.destroy` with exact publicId + resourceType). Cloudinary module is vi-mocked and tested. `createAttachment`, `createActivityEntry`, `updateCardCover` accept `Prisma.TransactionClient`. Both producer call paths proven to use the lock-holding transaction; removing the lock/revalidation makes focused tests fail. Success paths proven to NOT compensate (no destroy call). 2 producer compensation tests + 2 success-no-compensate tests.
- [x] **Slice C:** `verifySession()` restored as first operation after parsing (fix). Early unauthenticated rejection with no reads/writes restored. A1 auth test updated to expect rejection.

## Command Verification

```bash
# Unit & Integration — Slice C + B + B2 + lock protocol
npx vitest run tests/server-actions/list-lifecycle.test.ts lib/list.test.ts tests/server-actions/list-card.test.ts tests/server-actions/card-priority-cover.test.ts

# UI wiring
npx vitest run components/boards/archived-cards-dialog.test.tsx components/boards/board-header-wiring.test.tsx

# PostgreSQL interleaving proofs (requires local PG)
npx vitest run tests/db-index-proof.test.ts

# E2E — NOT IMPLEMENTED (known gap)
```
