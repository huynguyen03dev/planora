-- US-056 Card position integrity under concurrent reorders.
-- Decision: docs/decisions/0015-card-position-integrity.md
--
-- Adds the uniqueness backstop that `Card` lacked (only `List` had one), so the
-- collision-retry path in lib/card.ts / actions.ts becomes reachable and two
-- concurrent reorders into the same gap can no longer both commit a duplicate
-- position.
--
-- SCHEMA-INVISIBLE: a partial unique index (WHERE predicate) cannot be expressed
-- with Prisma's `@@unique`, so it lives only here. `prisma migrate` / `db pull`
-- will report drift for it on later runs — this is expected; do NOT let a future
-- migration drop it.

-- 1) DEDUPE FIRST. `CREATE UNIQUE INDEX` fails if any live (listId, position)
--    duplicates already exist. Renumber every list's live cards onto a fresh
--    evenly-spaced sequence (gap = 16384 = CARD_POSITION_GAP). This runs BEFORE
--    the index exists, so the UPDATE itself cannot trip the constraint. Archived
--    / soft-deleted cards are left untouched (they are exempt from the index).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "listId"
      ORDER BY "position", "createdAt"
    ) AS rn
  FROM "card"
  WHERE "archivedAt" IS NULL AND "deletedAt" IS NULL
)
UPDATE "card" c
SET "position" = ranked.rn * 16384
FROM ranked
WHERE c.id = ranked.id;

-- 2) Enforce uniqueness for LIVE cards only. Soft-deleted / archived cards keep
--    whatever position they had and must not collide with live cards.
--
-- NOTE (zero-downtime prod deploy): to build without a maintenance window,
-- replace this with `CREATE UNIQUE INDEX CONCURRENTLY` in its own
-- non-transactional migration step — CONCURRENTLY cannot run inside the
-- transaction Prisma wraps each migration in. Plain CREATE is used here (dev /
-- windowed deploy) because it is transaction-safe.
CREATE UNIQUE INDEX "card_listId_position_live_key"
  ON "card" ("listId", "position")
  WHERE "archivedAt" IS NULL AND "deletedAt" IS NULL;
