# Design

> Shaped by an independent senior validation pass (2026-06-30). Its two
> load-bearing findings — the partial-index requirement and the normalize
> self-collision — are folded in below (see "Validation findings" appendix).

## Domain Model

A card's `position` is a `Float` that orders it within its `listId`. The
invariant this story establishes:

- **For live cards** (`archivedAt IS NULL AND deletedAt IS NULL`), `(listId,
  position)` is unique. Soft-deleted/archived cards are exempt — they retain
  whatever position they had and must not collide with live cards.
- A reorder computes a midpoint between the target neighbours' positions
  (`resolveCardPosition`). When the gap falls below `MIN_POSITION_GAP`, the list
  is renumbered (`normalizeCardPositions`) onto a fresh, evenly-spaced sequence,
  then the reorder retries.

## Application Flow

```text
Same-list reorder (reorderCardWithinListByNeighbors) — MADE TRANSACTIONAL
  db.$transaction:
    read the moving card + the two target neighbours (inside the tx)
    position = resolveCardPosition(prev, next)
    if gap < MIN_POSITION_GAP:
        normalizeCardPositions(listId)      -- collision-safe (see below)
        recompute position
    UPDATE card SET position = ...
    on P2002 (unique violation, now reachable):
        normalizeCardPositions(listId); recompute; retry once
```

Cross-list move (`moveCardAction`, `actions.ts:1277`) already runs in a
transaction and additionally writes the `completedAt` transition and
`cardHistoryEvent` rows; it keeps that behavior and gains the same `P2002`
fallback semantics now that the constraint exists. **Note it does not reuse
`lib/card.ts`'s functions** — it has local `resolveCardPositionForTx` /
`normalizeCardPositionsForTx` twins (`actions.ts:141-216`); the twin uses
`Promise.all` (unordered writes — the *most* collision-prone of the three). The
collision-safe renumber below must be applied to it too — or extract
`lib/ordering.ts` first and have all sites adopt it.

**Collision-safe normalize.** A bulk renumber that reassigns positions in place
can transiently violate the unique index (row A takes a value row B still holds).
Renumber into a disjoint range first — e.g. shift the list to a high offset (or
negative staging band) in one pass, then compact to the final evenly-spaced
sequence — so no intermediate state collides. Do the renumber inside the
reorder's transaction. Commit to this **two-pass disjoint-range** technique;
merely *ordering* the in-place writes does **not** avoid the collision (an
ascending in-place renumber still aborts mid-transaction — reproduced on PG17).
**The same rework applies to `normalizeListPositions` (`lib/list.ts:230-248`)**,
which already runs under the live `list_boardId_position_key` and carries the
identical latent bug today, and to the `normalizeCardPositionsForTx` twin
(`actions.ts:198-216`).

## Interface Contract

No public API / Server-Action signature change. `reorderCardWithinListByNeighbors`
and `moveCardAction` keep their input/return shapes; only their internals become
transactional + collision-backed. No client-visible behavior change beyond
"reorders no longer duplicate positions under concurrency."

## Data Model

**Partial unique index (raw SQL migration — Prisma `@@unique` can't express a
predicate):**

```sql
-- 0) DEDUPE existing duplicate live positions FIRST, or CREATE UNIQUE INDEX fails.
--    Renumber colliding live rows deterministically, per list, BEFORE the index
--    exists (so this UPDATE itself cannot trip the constraint):
--
--    WITH ranked AS (
--      SELECT id, ROW_NUMBER() OVER (
--               PARTITION BY "listId" ORDER BY "position", "createdAt"
--             ) AS rn
--      FROM "card" WHERE "archivedAt" IS NULL AND "deletedAt" IS NULL
--    )
--    UPDATE "card" c SET "position" = ranked.rn * 16384   -- = CARD_POSITION_GAP
--    FROM ranked WHERE c.id = ranked.id;

CREATE UNIQUE INDEX "card_listId_position_live_key"
  ON "card" ("listId", "position")
  WHERE "archivedAt" IS NULL AND "deletedAt" IS NULL;
```

**FK indexes (same migration):**

```sql
CREATE INDEX "label_boardId_idx"        ON "label"     ("boardId");
CREATE INDEX "cardLabel_labelId_idx"    ON "cardLabel" ("labelId");
CREATE INDEX "cardMember_userId_idx"    ON "cardMember"("userId");
```

`Card` already carries `@@index([listId, position])` (`:283`),
`@@index([listId, archivedAt])` (`:284`), `@@index([dueDate, completedAt])`
(`:285`) — the new partial unique index is additive and does not replace the
existing composite index (which still serves range scans). Keep the Prisma
schema in sync by adding the FK `@@index` lines to `schema.prisma`; the partial
unique index lives in the raw-SQL migration only, annotated with a comment
pointing back to this decision.

Migration must run a **dedupe/renumber pass first** on any pre-existing duplicate
`(listId, position)` live rows, then create the unique index. (Audit `list(boardId,
position)` for live duplicates too — that index is already live, so it is a
data-audit step, not a new index.)

**Two migration-mechanics constraints (re-review):**

- `CREATE INDEX CONCURRENTLY` **cannot run inside a transaction**, and Prisma wraps
  migration statements in one. If a live-traffic build without a maintenance window
  is needed, split the concurrent create into its own non-transactional migration
  step, sequenced after the dedupe UPDATE.
- The partial unique index is **schema-invisible** (no Prisma-schema representation),
  so `prisma migrate` / `db pull` will report drift on the next run. Intentional —
  annotate the migration; do not let a later migration drop it.

## UI / Platform Impact

- No new UI. The board reorder simply becomes correct under concurrency.
- Migration is `prisma migrate dev --name card_position_integrity` with the raw
  SQL hand-added to the generated migration (Prisma supports editing the SQL of a
  created migration). Verify up-migration on seeded data including duplicate live
  positions.

## Observability

- Log `P2002` collisions and `normalizeCardPositions` invocations (list id +
  count) — today neither can occur, so any occurrence post-fix is a useful signal
  of contention.

## Alternatives Considered

See `docs/decisions/0015-card-position-integrity.md` (plain `@@unique` — breaks
soft-delete; advisory locks; LexoRank rewrite; leave as-is). The partial unique
index + transactional reorder + collision-safe normalize is the chosen path.

## Validation findings (senior panel, 2026-06-30)

| # | Finding | Disposition |
| --- | --- | --- |
| V-1 | `Card` lacks the `(listId, position)` unique `List` has → dead retry + dup-position race | Fixed — partial unique index (this design) |
| V-2 | Plain `@@unique` would collide on soft-deleted rows (`archivedAt`/`deletedAt`) → breaks archive/restore | Fixed — WHERE-predicate partial index |
| V-3 | `normalizeCardPositions` can transiently self-collide under a unique index | Fixed — renumber into a disjoint range inside the tx |
| V-4 | Same-list reorder non-transactional (cross-list move is) | Fixed — wrap in `db.$transaction`, read neighbours inside |
| V-5 | `moveCardToListByNeighbors` dead + diverges from live path | Fixed — delete |
| V-6 | Server-side ordering math has zero unit coverage | Fixed — see validation.md |
| V-7 | Missing FK indexes (`label.boardId` hot; `cardLabel.labelId`, `cardMember.userId`) | Fixed — same migration |

### Re-review additions (2026-07-01)

| # | Finding | Disposition |
| --- | --- | --- |
| V-8 | `normalizeListPositions` (`lib/list.ts:230-248`) has the *same* self-collision under the **already-live** `list_boardId_position_key` — a latent prod bug today | In scope — collision-safe rework covers lists; add a list-normalize test |
| V-9 | `moveCardAction` uses `*ForTx` twins (`actions.ts:141-216`), not `lib/card.ts`; `normalizeCardPositionsForTx` uses `Promise.all` (worst collision profile) | In scope — rework all three copies (or extract `lib/ordering.ts` first) |
| V-10 | Dedupe pass was named but not written | Fixed — `ROW_NUMBER()` renumber sketch in Data Model, run before the index |
| V-11 | `CREATE INDEX CONCURRENTLY` illegal in Prisma's tx migration; partial index causes expected schema drift | Documented in Data Model |
| V-12 | Live interleaved-transaction concurrency test not producible (mock-only harness) | Reframed in `validation.md` — structural proof + P2002-retry unit test |
