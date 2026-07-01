# Exec Plan

## Goal

`(listId, position)` is unique for live cards, concurrent same-list reorders can
never produce duplicate positions, the collision-retry path is live and tested,
the dead move helper is gone, and hot FK lookups are indexed.

## Scope

In scope:

- Raw-SQL migration: **dedupe pass** (`ROW_NUMBER()` renumber of any duplicate live
  rows, run before the index) → partial unique index
  `card(listId, position) WHERE archivedAt IS NULL AND deletedAt IS NULL` + FK
  indexes on `label.boardId`, `cardLabel.labelId`, `cardMember.userId`. If a
  live-traffic window is unavailable, split `CREATE INDEX CONCURRENTLY` into its own
  non-transactional migration step (Prisma wraps statements in a transaction).
- Make `reorderCardWithinListByNeighbors` transactional; read neighbours inside
  the tx (`lib/card.ts:205-277`).
- Make **all three** in-place renumbers collision-safe under a unique index:
  `normalizeCardPositions` (`lib/card.ts`), the `normalizeCardPositionsForTx` twin
  (`actions.ts:198-216`, `Promise.all`), and `normalizeListPositions`
  (`lib/list.ts:230-248` — already live under `list_boardId_position_key`).
- Wire the (now-real) `P2002` → normalize → retry fallback on both reorder paths.
- Delete `moveCardToListByNeighbors` (`lib/card.ts:279-344`).
- Fold the shared ordering helpers into a single `lib/ordering.ts`:
  `isUniqueConstraintError` (all four — `lib/card.ts`, `lib/list.ts`,
  `lib/card-member.ts`, `actions.ts`), `MIN_POSITION_GAP` (`lib/card.ts`,
  `lib/list.ts` only), and the gaps (`CARD_POSITION_GAP` in `lib/card.ts` +
  `actions.ts`; `LIST_POSITION_GAP` in `lib/list.ts`).
- Unit tests for the ordering math + a concurrency integration test.
- Docs: `boards-and-cards.md`, `ARCHITECTURE.md`, `TEST_MATRIX.md`.

Out of scope (see overview.md Non-Goals): LexoRank rewrite; realtime conflict
resolution; reconstructing ordering intent for already-duplicated data.

## Risk Classification

Risk flags:

- **Data model** — new partial unique index + FK indexes; a raw-SQL migration.
- **Existing behavior** — changes the reorder write path (transaction + retry).
- **Weak proof** — the server-side ordering math is currently untested; the
  uniqueness/normalize correctness is the whole argument and must be proven.
- **Multi-domain** — cards + lists + labels + card-members (schema), plus the
  reorder server actions.

Hard gates:

- **Data migration** (partial unique index; dedupe of existing data).

→ **High-risk.** Gated by decision
`docs/decisions/0015-card-position-integrity.md` (status: Proposed — confirm
before the migration is written).

## Work Phases

1. **Decision 0015** — confirm the partial-index + collision-safe-normalize +
   transactional-reorder approach with the human. (Recorded; awaiting confirm.)
2. **Data audit** — query for existing duplicate `(listId, position)` live rows
   in dev/prod; design the dedupe/renumber step accordingly.
3. **Migration** — `prisma migrate dev --name card_position_integrity`; hand-edit
   the SQL to add the dedupe pass, the partial unique index, and the 3 FK indexes;
   add the FK `@@index` lines to `schema.prisma`; regenerate the client.
4. **Collision-safe normalize** — rework all three renumbers
   (`normalizeCardPositions`, the `*ForTx` twin, `normalizeListPositions`) to
   renumber into a disjoint staging range; unit-test each under the constraint
   semantics first. (Or land the `lib/ordering.ts` extraction here so there is one
   implementation to make safe.)
5. **Transactional reorder** — wrap `reorderCardWithinListByNeighbors` in
   `db.$transaction`; wire the `P2002` fallback on both reorder + move paths.
6. **Delete dead code + dedupe constants** — remove `moveCardToListByNeighbors`;
   extract `lib/ordering.ts`.
7. **Tests** — unit (ordering math) + integration (overlapping reorders → no
   duplicate positions; migration on seeded dup data).
8. **Docs + harness** — update product/architecture/matrix; `story update` proof
   flags; `decision verify` for 0015.

## Stop Conditions

Pause for human confirmation if:

- **Existing duplicate live `(listId, position)` rows are found** — confirm the
  dedupe/renumber strategy before the migration runs (data-shaping decision).
- A stakeholder prefers the LexoRank rewrite (decision 0015 Alt 3) — that
  supersedes this plan.
- `normalizeCardPositions` cannot be made collision-safe without a transaction
  pattern the codebase otherwise avoids — revisit the design.
- The migration would need to run against multi-instance / live-traffic data
  without a maintenance window — sequence the index create safely (e.g.
  `CREATE INDEX CONCURRENTLY`) and confirm.
