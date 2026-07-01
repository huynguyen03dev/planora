# Overview

US-056 — Card position integrity under concurrent reorders. Epic:
`E03-trust-and-safety`. Surfaced by the deep review + an independent senior
validation pass (2026-06-30); gated by decision
`docs/decisions/0015-card-position-integrity.md`.

## Current Behavior

Card ordering uses gap-based `Float` positions (Planka pattern). Three linked
defects, all validation-confirmed against the schema and migrations:

- **No uniqueness backstop on cards.** `List` has `@@unique([boardId, position])`
  (`prisma/schema.prisma:252`); `Card` has only the *non-unique*
  `@@index([listId, position])` (`:283`). The `20260316082853_init` migration
  emits a plain `CREATE INDEX`, and no later migration adds a UNIQUE.
- **The collision-retry code is dead.** `reorderCardWithinListByNeighbors`
  (`lib/card.ts` ~`:266`) and the live cross-list move
  (`app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts:1328`) both
  `catch` a `P2002` unique violation → `normalizeCardPositions` → retry. With no
  unique constraint, an `UPDATE` of `position` can never raise `P2002`, so the
  catch can never fire.
- **The same-list reorder is non-transactional.**
  `reorderCardWithinListByNeighbors` (`lib/card.ts:205-277`) reads the card,
  resolves a midpoint (further reads), then writes — separate round-trips with no
  `db.$transaction`. The cross-list move (`actions.ts:1277`) *is* transactional.

Net effect: two clients dragging within the same list to the same gap both
compute the same midpoint, both pass the `MIN_POSITION_GAP` guard, and both
commit — **duplicate positions**, after which order is decided only by
`createdAt`. There is no DB backstop and no working retry.

Two adjacent problems compound it:

- **`moveCardToListByNeighbors` (`lib/card.ts:279-344`) is dead code** — zero
  callers repo-wide. It writes only `{ listId, position }`, unlike the live
  `moveCardAction`, which also handles the `completedAt` transition
  (`actions.ts:1283-1297`) and `recordCardHistoryEvents` (`:1324`). A future dev
  wiring up the obvious-looking lib entry point would silently corrupt analytics
  history and reintroduce the race.
- **The server-side ordering math has zero unit coverage.**
  `lib/dnd/apply-drop.test.ts` covers only the *client-side* translation;
  `tests/server-actions/list-card.test.ts` mocks the lib reorder functions and
  asserts only that they were called. `resolveCardPosition`,
  `normalizeCardPositions`, and `resolveListPosition` are untested — exactly where
  the bugs live.

Missing FK indexes (same schema area, folded in here): `label.boardId`
(`Label` has no `@@index` at all — a full scan on every board/card-detail open),
`cardLabel.labelId` (PK is `@@id([cardId, labelId])`, unusable for a
`labelId`-only lookup), `cardMember.userId` (PK `@@id([cardId, userId])`).

**Re-review (2026-07-01) — wider blast radius than first scoped.** Two additions:
(1) **Lists are already affected.** `list_boardId_position_key` is a live plain
unique index (migration `20260322132618_list_position_unique`), and
`normalizeListPositions` (`lib/list.ts:230-248`) runs the same in-place ascending
renumber — so the transient self-collision described above can **already abort a
list reorder in production today**, before any card change lands. (2) **There are
two card-normalize copies, not one.** `moveCardAction` uses local
`resolveCardPositionForTx` / `normalizeCardPositionsForTx` twins
(`actions.ts:141-216`), the latter with `Promise.all` (unordered → worst collision
profile); it does **not** share `lib/card.ts`'s functions. The fix must cover
`lib/card.ts`, the `*ForTx` twin, **and** `lib/list.ts`.

## Target Behavior

- `(listId, position)` is unique for **live** cards — enforced by a partial
  unique index that excludes soft-deleted rows (`archivedAt`/`deletedAt`).
- Concurrent same-list reorders can never produce duplicate live positions: the
  reorder runs in a transaction, and the (now-real) `P2002` path is the fallback.
- The `P2002` → `normalizeCardPositions` → retry code is **live and unit-tested**.
- `normalizeCardPositions` is **collision-safe** under the unique index — as are
  its `*ForTx` twin (`actions.ts:198-216`) and `normalizeListPositions`
  (`lib/list.ts:230-248`), which shares the same latent bug today.
- Dead `moveCardToListByNeighbors` is removed.
- Hot FK lookups (`label.boardId`, `cardLabel.labelId`, `cardMember.userId`) are
  indexed.

## Affected Users

- All board users who drag-reorder cards — correctness under concurrency (no
  more silently duplicated positions / non-deterministic order).
- No change to the setter UX or the client drag interaction.

## Affected Product Docs

- `docs/product/boards-and-cards.md` — state the position-uniqueness invariant.
- `docs/ARCHITECTURE.md` — float-gap ordering + the "transaction for multi-row
  position writes" rule (make the same-list path conform).
- `docs/TEST_MATRIX.md` — add ordering-math unit + concurrency-integration rows.

## Non-Goals

- Rewriting ordering to integer / LexoRank rebalancing (decision 0015, Alt 3).
- Realtime reorder conflict resolution — the drag-aware deferral invariant is
  already handled elsewhere.
- Changing the client-side `apply-drop` translation.
- Backfilling history for any positions already duplicated in existing data
  (the migration dedupes, but does not reconstruct lost ordering intent).
