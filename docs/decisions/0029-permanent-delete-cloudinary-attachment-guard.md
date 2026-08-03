# 0029 Permanent Delete Cloudinary Attachment Guard

Date: 2026-07-29
Updated: 2026-08-15

## Status

Accepted (Updated for FOR UPDATE lock + producer protocol)

## Context

Slice C of US-074 (guarded permanent list deletion) introduces a safety
constraint: an archived list containing attachments with `cloudinaryPublicId`
set (i.e., Cloudinary-hosted files) must be blocked from permanent purge. The
product rule states that Cloudinary assets are our users' data and must not be
orphaned by list deletion.

During implementation, a separate race condition was identified: attachment
producers (`uploadAttachmentAction`, `setCardCoverAction`) could insert an
attachment referencing a Cloudinary upload into a list that was concurrently
archived or purged. Closing this race required an in-transaction FOR UPDATE
lock on the parent List row.

## Decision (Original, Affirmed)

1. **Guard semantics:** `permanentlyDeleteListAction` must block permanent purge
   when any card in the list has an attachment with non-null `cloudinaryPublicId`.
   No outbox, cleanup worker, or cleanup-on-delete is added; the guard is a pure
   precondition check.

2. **Scope:** Guard covers permanent list deletion only. Individual card
   deletion, board deletion, and archive operations are unaffected.

3. **No schema change:** `Attachment.cloudinaryPublicId` already exists.

## Decision (Updated — FOR UPDATE Lock Protocol)

4. **Purge lock:** The Cloudinary attachment guard check is moved inside the
   `$transaction` callback, AFTER acquiring a `SELECT ... FOR UPDATE` row lock
   on the parent `list` row. The same lock revalidates `archivedAt IS NOT NULL`
   (the list must still be archived). This prevents the race where a concurrent
   restore clears `archivedAt` between the guard read and the conditional
   `deleteMany`.

5. **Producer lock (upload paths):** Both `uploadAttachmentAction` and
   `setCardCoverAction` acquire a `SELECT ... FOR UPDATE` lock on the parent
   `list` row before inserting the `Attachment` record. The lock is acquired
   INSIDE `db.$transaction` AFTER the external Cloudinary upload call (the
   Cloudinary upload is NOT held under the DB lock). If the lock revalidation
   finds `archivedAt IS NOT NULL` or zero rows (list archived/purged
   concurrently), the producer throws, the just-uploaded Cloudinary asset is
   compensated via `cloudinary.uploader.destroy` with the exact publicId and
   resourceType, and the action returns `"Card not found"`.

6. **Compensation boundary:** The `cloudinary.uploader.destroy` call is NOT
   inside the DB transaction. If the destroy call itself fails (crash, network
   error), the orphaned Cloudinary asset is a residual risk. The guard ensures
   this only happens when a list concurrently transitions state between
   Cloudinary upload completion and DB insert — a rare edge case. A future
   orphan-reconciliation job could clean up such residuals. The approved
   contract remains block-on-existing-Cloudinary-assets; no outbox.

7. **Affected functions:** `createAttachment`, `createActivityEntry`, and
   `updateCardCover` now accept an optional `Prisma.TransactionClient`
   parameter so they can participate in the lock-holding transaction.

8. **Redundant verifySession removed:** The `permanentlyDeleteListAction` had
   two `verifySession()` calls — one early-guard (removed) and one to capture
   `userId` for history events. The remaining call is the first operation after
   parsing, providing early unauthenticated rejection AND the userId needed by
   the transaction body.

## Alternatives Considered

1. **Implement Cloudinary cleanup inline:** Rejected — a `cloudinary.uploader.destroy`
   call inside the transaction would add a network round-trip that cannot be
   rolled back and a partial-failure state where Cloudinary deleted the file but
   the DB transaction failed (or vice versa).

2. **Implement an outbox table + background worker:** Rejected — adds schema,
   scheduler, and reconciliation complexity unjustified before real Cloudinary
   volume exists.

3. **No guard (purge silently orphans files):** Rejected per CEO gate.

## Consequences

Positive:
- Production contract is future-safe against both accidental purge and
  in-flight-upload race.
- The FOR UPDATE protocol is proven via PostgreSQL interleaving tests
  (lock_timeout deterministic blocking).

Tradeoffs:
- Compensation failure (destroy call fails) leaves an orphaned Cloudinary
  asset — tracked residual risk.
- The producer lock contention means a concurrent archive/purge briefly
  blocks an upload transaction rather than failing early.

## Follow-Up

- US-074 Slice C correction implements the lock protocol.
- A future story should add orphan-reconciliation (background worker) and
  consider relaxing the guard if cleanup succeeds.
- Crash recovery: if the application crashes between Cloudinary upload
  completion and DB insert, the already-uploaded file is orphaned. A
  periodic reconciliation worker could find and clean up such residuals
  (e.g., by comparing upload timestamps against attachment rows).
