# 0015 Card position integrity via partial unique index + collision-safe normalize

Date: 2026-07-01

## Status

Proposed

> Recording the approach ahead of implementation (US-056). Confirm before the
> migration is written — it trips the data-migration hard gate.
>
> **Re-review 2026-07-01** (see the section at the end): scope corrected to cover
> **lists** (already exposed today) and **both** card-normalize copies; the "order
> the writes" option is struck as unsound; dedupe SQL, `CREATE INDEX CONCURRENTLY`,
> and expected Prisma schema-drift are now specified. Still awaiting human
> acceptance.

## Context

Card ordering uses gap-based `Float` positions (Planka pattern). A senior
validation pass (2026-06-30) confirmed three linked defects around it:

- **No uniqueness backstop.** `List` has `@@unique([boardId, position])`
  (`prisma/schema.prisma:252`) but `Card` has only the non-unique
  `@@index([listId, position])` (`:283`). The `20260316082853_init` migration
  emits a plain `CREATE INDEX`, and no later migration adds a UNIQUE.
- **Dead collision-retry.** The `P2002` catch → `normalizeCardPositions` → retry
  arms in `lib/card.ts:266` and `:333`, and in the live move path
  `app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts:1328`, guard a
  constraint that does not exist. An `UPDATE` of `position` can never raise
  `P2002` today, so the retry can never fire.
- **Non-transactional same-list reorder.** `reorderCardWithinListByNeighbors`
  (`lib/card.ts:205-277`) reads the card, resolves a midpoint (more reads), then
  writes — as separate round-trips with no `db.$transaction`, unlike the
  cross-list move (`actions.ts:1277`), which is transactional. Two concurrent
  same-list reorders resolving to the same midpoint both pass the
  `MIN_POSITION_GAP` guard and both commit → **duplicate positions**, with order
  then decided only by `createdAt`.

The naive fix — add `@@unique([listId, position])` — introduces two new bugs the
validation caught:

1. **It would constrain soft-deleted rows.** `Card` carries both `deletedAt`
   (`schema.prisma:267`) and `archivedAt` (`:269`). A plain unique index over all
   rows collides when an archived/deleted card shares a `(listId, position)` with
   a live one, breaking archive/restore.
2. **`normalizeCardPositions` can transiently self-collide** under a unique index
   — a bulk renumber that reuses intermediate values violates uniqueness mid-flight.

## Decision

1. **Enforce `(listId, position)` uniqueness with a PARTIAL unique index**, via a
   raw-SQL migration (Prisma `@@unique` cannot express a predicate):

   ```sql
   CREATE UNIQUE INDEX "card_listId_position_live_key"
     ON "card" ("listId", "position")
     WHERE "archivedAt" IS NULL AND "deletedAt" IS NULL;
   ```

   This backstops live cards only, leaving soft-deleted rows unconstrained.

2. **Make every in-place renumber collision-safe** under a unique index — renumber
   into a **disjoint staging range** (two passes: shift all rows to a
   non-overlapping band, then compact to the final evenly-spaced sequence). Simply
   *ordering* the in-place writes does **not** work — an ascending in-place
   renumber still collides mid-transaction (reproduced on PG17). This applies to
   **all three** copies: `normalizeCardPositions` (`lib/card.ts:184`), the
   `normalizeCardPositionsForTx` twin used by the cross-list move
   (`actions.ts:198-216`, which additionally uses `Promise.all` — unordered, so
   *more* collision-prone), and `normalizeListPositions` (`lib/list.ts:230-248`;
   lists are already exposed today — see the re-review section).

3. **Wrap the same-list reorder in `db.$transaction`**, reading neighbours inside
   the transaction, for parity with the cross-list move. This closes the
   read-then-write race so the unique index is a backstop, not the primary guard.

4. **The now-real `P2002` path becomes the live fallback**: on a genuine
   collision, catch → `normalizeCardPositions` → retry once.

5. **Delete the dead `moveCardToListByNeighbors`** (`lib/card.ts:279-344`) — zero
   callers, non-transactional, and it skips the `completedAt` + `cardHistoryEvent`
   writes the live path performs, so it is a latent analytics-corruption trap.

6. **Add the missing FK indexes in the same migration** (`label.boardId`,
   `cardLabel.labelId`, `cardMember.userId`) since it is already a schema change.

## Alternatives Considered

1. **Plain `@@unique([listId, position])`.** Rejected — collides on soft-deleted
   rows (breaks archive/restore) and cannot be expressed with a predicate in
   Prisma schema.
2. **App-level serialization / Postgres advisory locks per list.** Serializes
   reorders without a schema change, but adds lock-management complexity and
   leaves no DB backstop against a code path that forgets to lock. Rejected as
   primary; the transaction (decision 3) plus the partial index is simpler.
3. **Integer / LexoRank rebalancing rewrite.** A larger, higher-risk rewrite of
   the ordering scheme. Deferred — out of proportion to the defect.
4. **Leave as-is.** Rejected — silent duplicate positions and permanently dead
   retry code.

## Consequences

Positive:

- No duplicate live positions; deterministic order under concurrency.
- The existing retry/normalize code becomes live *and* unit-tested (today it is
  neither).
- Hot label/card-label/card-member lookups get index coverage in the same migration.

Tradeoffs:

- The migration is raw SQL, not pure Prisma schema — a documented, reviewed
  deviation.
- `normalizeCardPositions` must be reworked to be collision-safe; more care than
  a one-line schema edit.
- The migration must **first dedupe any existing duplicate `(listId, position)`
  live rows**, or `CREATE UNIQUE INDEX` will fail on real data.

## Follow-Up

- Audit production/dev data for existing duplicate `(listId, position)` live rows
  and add a dedupe/renumber step at the top of the migration.
- Fold the shared ordering helpers into a single `lib/ordering.ts`:
  `isUniqueConstraintError` (all four: `lib/card.ts`, `lib/list.ts`,
  `lib/card-member.ts`, `actions.ts`), `MIN_POSITION_GAP` (`lib/card.ts`,
  `lib/list.ts` only), and the gaps (`CARD_POSITION_GAP` in `lib/card.ts` +
  `actions.ts`; `LIST_POSITION_GAP` in `lib/list.ts`).
- Verified during implementation of US-056; this decision gates its migration phase.

## Re-review corrections (2026-07-01)

An independent senior re-review (against the live DB + an empirical PG17 test)
confirmed the approach but corrected the blast radius:

- **Lists are already exposed — not just a card problem.**
  `list_boardId_position_key` is a **live, plain (non-partial), non-deferrable**
  unique index (migration `20260322132618_list_position_unique`), and
  `normalizeListPositions` (`lib/list.ts:230-248`) does the same in-place ascending
  renumber that self-collides under a unique index. The transient self-collision
  this decision fixes for cards **can already abort list reorders in production
  today.** The collision-safe rework (decision 2) must cover lists, and US-056's
  validation must add a list-normalize collision test.
- **Two card-normalize copies, not one.** `moveCardAction` does *not* call
  `lib/card.ts`'s functions; it uses local `resolveCardPositionForTx` /
  `normalizeCardPositionsForTx` (`actions.ts:141-216`). The latter uses
  `Promise.all` (unordered concurrent UPDATEs) — the worst collision profile of the
  three. Both card copies (and the list copy) get the disjoint-range rework, **or**
  the `lib/ordering.ts` extraction (Follow-Up) lands first and all call sites adopt
  it. This decision earlier implied a single shared function; it is three sites.
- **Dedupe pass — the exact shape.** Before `CREATE UNIQUE INDEX`, renumber any
  pre-existing duplicate live `(listId, position)` rows, per list, deterministically
  — e.g. `ROW_NUMBER() OVER (PARTITION BY "listId" ORDER BY "position", "createdAt")`
  mapped onto a fresh evenly-spaced sequence. Run it **before** the index exists (so
  it cannot trip the constraint) — that ordering is load-bearing. Same treatment for
  `list(boardId, position)` if any live duplicates exist there.
- **`CREATE INDEX CONCURRENTLY` cannot run inside Prisma's migration transaction.**
  Prisma wraps migration statements in a transaction and `CONCURRENTLY` is illegal
  there. If a live-traffic build without a maintenance window is required, the
  concurrent create must be its own non-transactional migration step (dedupe UPDATE
  sequenced before it) — an explicit decision, not a deferred "confirm."
- **The partial unique index is schema-invisible → expected Prisma drift.** It
  lives only in raw SQL; `prisma migrate` / `db pull` will report drift (a DB index
  the schema doesn't declare) on the next run. Intentional — annotate the migration
  and note the expected drift so a later migration doesn't "helpfully" drop it.
- **Concurrency proof feasibility.** The repo has no real-DB integration harness
  (every server-action test mocks `@/lib/prisma`), so a true interleaved-transaction
  race test isn't producible today. US-056's validation is reframed accordingly
  (structural argument + a P2002-retry unit test, or add a real-DB harness as
  explicit scope) — see its `validation.md`.
