# 0016 Index Label.boardId and BoardStar.userId

Date: 2026-07-01

## Status

Accepted

## Context

The 2026-07-01 whole-project review (US-062) found two child models whose
hot-path lookups had no supporting index:

- `Label` was the only child model missing an index on its `boardId` foreign key
  (cf. `Checklist`, `Comment`, `Attachment`, which all index theirs). Board open
  and the board-delete cascade both scan `label` by `boardId`.
- `BoardStar` had only `@@unique([boardId, userId])`. `getStarredBoardIds`
  (`lib/board.ts`) filters by `userId` alone, which cannot use that composite
  (its leading column is `boardId`), forcing a sequential scan on every
  dashboard/sidebar render.

Both tables are small today, so the cost is latent — but it grows with labels
per board and stars per user, and adding an index is a routine, reversible
schema change. Schema/migration work is a FEATURE_INTAKE hard gate, so it is
recorded here.

## Decision

Add `@@index([boardId])` to `Label` and `@@index([userId])` to `BoardStar`,
shipped as a single additive migration
(`20260701100202_add_label_boardstar_indexes`):

```sql
CREATE INDEX "boardStar_userId_idx" ON "boardStar"("userId");
CREATE INDEX "label_boardId_idx" ON "label"("boardId");
```

## Alternatives Considered

1. Leave unindexed until profiling proves a problem (per decision 0010's
   "prove it first" posture). Rejected here: unlike card virtualization, an FK
   index is cheap, non-behavioural, and the missing `Label` index is an
   inconsistency with every sibling model rather than a speculative optimization.
2. Rely on the existing `BoardStar` composite unique for the `userId` query.
   Rejected: a `(boardId, userId)` index cannot serve a `userId`-only predicate.

## Consequences

Positive:

- `getStarredBoardIds` and board open/label queries use an index instead of a
  sequential scan; the board-delete cascade drops `label` rows by index.
- `Label` is now consistent with the other board-child models.

Tradeoffs:

- Two additional indexes to maintain on write (negligible for these tables).

## Follow-Up

- None. Additive, reversible migration; no data backfill.
