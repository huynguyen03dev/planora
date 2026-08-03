# Validation

## Proof Strategy

Correctness rests on the **live-position-uniqueness invariant**: no two live
cards in a list share a `position`, no matter how reorders interleave. That must
be proven at the unit level (the ordering math + collision-safe normalize) and at
the integration level (overlapping reorders + the migration on real-shaped data).
Secondary: the migration is safe on data that already contains duplicate live
positions, and archived/deleted cards are exempt from the constraint. The identical
invariant already holds for **lists** under the live `list_boardId_position_key`, so
`normalizeListPositions` must be proven collision-safe too — not just the card path.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit (`lib/ordering.ts` / `lib/card.ts` / `lib/list.ts`) | `resolveCardPosition`: insert at head, tail, and between two neighbours; empty list; single-item list; two adjacent positions whose gap `< MIN_POSITION_GAP` triggers normalize. `resolveListPosition`: same shape. `normalizeCardPositions`: produces an evenly-spaced strictly-increasing sequence, and is **collision-safe** — no intermediate state repeats a live `(listId, position)` (assert against the disjoint-range renumber). **`normalizeListPositions` and the `normalizeCardPositionsForTx` twin: the same collision-safety assertion** — all three renumbers stage to a disjoint band. |
| Unit (retry path) | a simulated `P2002` on the position `UPDATE` triggers `normalizeCardPositions` + one retry that then succeeds; a second consecutive `P2002` surfaces as a clean failure, not an infinite loop. |
| Integration (concurrency) | **Feasibility caveat:** every server-action test mocks `@/lib/prisma`, so a *true* interleaved-transaction race cannot be run today. Prove the invariant instead by (a) a **structural argument** — the partial unique index + the transaction make duplicate live positions impossible — backed by (b) a unit test that a duplicate-position `UPDATE` raises `P2002` and the `normalize`+retry recovers to distinct positions. A real-Postgres harness for a genuine two-transaction interleave is an **explicit scope option** (call it out in the PR if chosen); it does not exist yet. |
| Integration (migration) | apply the migration to a seed that includes duplicate live `(listId, position)` rows → dedupe pass renumbers them, unique index creates successfully; a seed with an archived card sharing a live card's `(listId, position)` → index still creates (partial predicate exempts it). |
| Platform | `prisma migrate` up succeeds; `card_listId_position_live_key` + the 3 FK indexes exist (`\d card` / `\d label` etc.); `npm run build` + `npm test` green. |
| Performance | (spot) board open no longer full-scans `label` (FK index used); label rename/delete no longer full-scans `cardLabel`. |

## Fixtures

- A board + list with cards at known float positions, including a pair one
  `MIN_POSITION_GAP` apart (to force normalize) and a pair of duplicate live
  positions (to exercise the migration dedupe).
- An archived card and a soft-deleted card sharing a live card's `(listId,
  position)` (to prove the partial predicate exempts them).
- Inject any "now"/ordering seed deterministically; do not rely on wall-clock.

## Commands

Add commands after scripts exist.

```text
npx vitest run lib/card.test.ts lib/list.test.ts lib/ordering.test.ts
npx vitest run tests/server-actions/list-card.test.ts
npx prisma migrate dev --name card_position_integrity
npm run lint && npx tsc --noEmit && npm run build && npm test
scripts/bin/harness-cli decision verify --id 0015
```

## Acceptance Evidence

Add results after verification (migration output, index list, unit + concurrency
test runs, pre/post query-plan for a board-open label fetch).
