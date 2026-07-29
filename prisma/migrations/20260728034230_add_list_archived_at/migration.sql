-- US-074 Safe List Lifecycle: add List.archivedAt and active-only partial unique index.
-- Decision: docs/decisions/0026-safe-list-lifecycle-and-deletion-semantics.md
--
-- Atomicity & Locking:
-- - All statements execute within an explicit migration transaction (BEGIN / COMMIT) enclosed in this file.
-- - Prisma Migrate executes the script without wrapping statements in a single transaction automatically; explicit BEGIN / COMMIT guarantees all-or-nothing atomicity.
-- - ALTER TABLE takes a brief AccessExclusiveLock to add the nullable archivedAt column (metadata update only in PostgreSQL 11+).
-- - CREATE INDEX list_boardId_archivedAt_idx takes a ShareLock on "list" for fast lookup filtering.
-- - DROP INDEX list_boardId_position_key drops the pre-existing global unique index.
-- - CREATE UNIQUE INDEX list_boardId_position_live_key takes a ShareLock on "list" to validate and enforce uniqueness for active lists.
--
-- Fail-Fast Safety:
-- - The pre-existing global unique index "list_boardId_position_key" guarantees live list positions are non-duplicate.
-- - No CTE renumbering is performed, preserving exact original position values.
-- - If position corruption were present, creating the partial unique index will fail visibly and roll back atomically.

BEGIN;

-- 1. AlterTable: add nullable archivedAt column
ALTER TABLE "list" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- 2. CreateIndex: lookup index for filtering live / archived lists
CREATE INDEX "list_boardId_archivedAt_idx" ON "list"("boardId", "archivedAt");

-- 3. Drop existing global unique index on (boardId, position)
DROP INDEX IF EXISTS "list_boardId_position_key";

-- 4. Partial UNIQUE index on active (live) lists only (where archivedAt IS NULL).
-- Archived lists retain their original position without colliding with active lists.
CREATE UNIQUE INDEX "list_boardId_position_live_key"
  ON "list" ("boardId", "position")
  WHERE "archivedAt" IS NULL;

COMMIT;
