import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

/** Gap-based spacing between adjacent card positions (Planka pattern). */
export const CARD_POSITION_GAP = 16384;

/**
 * Smallest gap we allow between a card and either neighbour before forcing a
 * renumber. Below this, repeated float bisection loses precision and two
 * positions can round equal — which the `card_listId_position_live_key` partial
 * unique index would then reject.
 */
export const MIN_POSITION_GAP = 0.0001;

/**
 * The where-fragment that defines a "live" card, i.e. one the app treats as
 * present on the board and eligible for a position. It MUST match the predicate
 * of the `card_listId_position_live_key` partial unique index
 * (`archivedAt IS NULL AND deletedAt IS NULL`, per decision 0015). If the app's
 * notion of "live" is broader than the index predicate, two rows the app both
 * considers live can share `(listId, position)` with no P2002 to stop them —
 * exactly the dup-position hole this constant closes. Reuse it everywhere a card
 * is positioned, normalized, or read for reordering.
 */
export const LIVE_CARD_SCOPE = { archivedAt: null, deletedAt: null } as const;

/**
 * Thrown by {@link resolveCardPosition} when the neighbouring live cards are too
 * close together to bisect a fresh position between them (gap < MIN_POSITION_GAP).
 * Callers treat it exactly like a P2002 collision: renumber the list, then retry.
 */
export class PositionSpaceExhaustedError extends Error {
  constructor() {
    super("No positional gap left between neighbours; renumber required");
    this.name = "PositionSpaceExhaustedError";
  }
}

/**
 * Thrown by the position resolvers when a client-supplied `prev`/`next` neighbour
 * hint no longer names a live occupant of the target list/board — either because
 * a rival concurrently moved/deleted it, or because the hint was never valid.
 *
 * Reorder callers treat it as RETRYABLE: drop the offending side's hint and retry
 * so the move re-anchors on the surviving neighbour (or appends), rather than
 * failing the user's drag. Position is not an authorization boundary — the card
 * still lands in the already-authorized target — so self-healing to append on a
 * bogus hint is safe. `side` says which hint to drop.
 */
export class StaleNeighborError extends Error {
  readonly side: "prev" | "next";
  constructor(side: "prev" | "next") {
    super(`Stale ${side} neighbour hint; occupant no longer in target`);
    this.name = "StaleNeighborError";
    this.side = side;
  }
}

/**
 * Compute the position for a card dropped between `prevCardId` and `nextCardId`
 * within `targetListId`, collision-safe under concurrency.
 *
 * The client's prev/next hints describe the *intended* neighbours, but a rival
 * reorder committing between read and write can make them stale — so we never
 * trust `prev.position ± GAP` blindly. Instead we anchor on the surviving hint
 * and bisect against the card that CURRENTLY occupies the adjacent slot:
 *
 * - prev given → bisect between prev and the live card immediately after prev
 *   (or `prev + GAP` if prev is genuinely last). This is what fixes the
 *   concurrent end-drop: once a rival's card lands right after `prev`, the retry
 *   finds it and bisects into a distinct slot instead of recomputing `prev + GAP`
 *   forever.
 * - only next given → symmetric, bisecting before `next`.
 * - neither → append after the last live card.
 *
 * `excludeCardId` omits the card being moved from the adjacency search so a
 * within-list reorder never bisects against the mover's own stale slot.
 *
 * Runs on the caller's transaction client so the read-and-decide shares the
 * reorder's transaction. Throws {@link PositionSpaceExhaustedError} when there
 * is no room to bisect (caller should renumber and retry), or
 * {@link StaleNeighborError} when a prev/next hint no longer names a live card in
 * the target list (caller should drop that hint and retry).
 */
export async function resolveCardPosition(
  client: Prisma.TransactionClient,
  data: {
    targetListId: string;
    prevCardId?: string | null;
    nextCardId?: string | null;
    excludeCardId?: string | null;
  },
): Promise<number> {
  const prevCard = data.prevCardId
    ? await client.card.findUnique({
        where: { id: data.prevCardId, ...LIVE_CARD_SCOPE },
        select: { id: true, listId: true, position: true },
      })
    : null;
  const nextCard = data.nextCardId
    ? await client.card.findUnique({
        where: { id: data.nextCardId, ...LIVE_CARD_SCOPE },
        select: { id: true, listId: true, position: true },
      })
    : null;

  if (data.prevCardId && (!prevCard || prevCard.listId !== data.targetListId)) {
    throw new StaleNeighborError("prev");
  }

  if (data.nextCardId && (!nextCard || nextCard.listId !== data.targetListId)) {
    throw new StaleNeighborError("next");
  }

  const notMoved = data.excludeCardId ? { id: { not: data.excludeCardId } } : {};

  if (prevCard) {
    const following = await client.card.findFirst({
      where: {
        listId: data.targetListId,
        ...LIVE_CARD_SCOPE,
        position: { gt: prevCard.position },
        ...notMoved,
      },
      orderBy: { position: "asc" },
      select: { position: true },
    });

    if (!following) {
      return prevCard.position + CARD_POSITION_GAP;
    }
    return bisect(prevCard.position, following.position);
  }

  if (nextCard) {
    const preceding = await client.card.findFirst({
      where: {
        listId: data.targetListId,
        ...LIVE_CARD_SCOPE,
        position: { lt: nextCard.position },
        ...notMoved,
      },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    if (!preceding) {
      return nextCard.position - CARD_POSITION_GAP;
    }
    return bisect(preceding.position, nextCard.position);
  }

  const lastCard = await client.card.findFirst({
    where: {
      listId: data.targetListId,
      ...LIVE_CARD_SCOPE,
      ...notMoved,
    },
    orderBy: [{ position: "desc" }, { createdAt: "desc" }],
    select: { position: true },
  });

  return lastCard ? lastCard.position + CARD_POSITION_GAP : CARD_POSITION_GAP;
}

/** Midpoint of two positions, or throw if they are too close to split cleanly. */
function bisect(a: number, b: number): number {
  const lower = Math.min(a, b);
  const upper = Math.max(a, b);
  if (upper - lower < MIN_POSITION_GAP) {
    throw new PositionSpaceExhaustedError();
  }
  return (lower + upper) / 2;
}

/**
 * Renumber a list's live cards onto a fresh evenly-spaced sequence, collision
 * safe under the `card_listId_position_live_key` partial unique index. Runs on
 * the caller's transaction client so it can share the reorder's transaction.
 */
export async function normalizeCardPositions(
  tx: Prisma.TransactionClient,
  listId: string,
): Promise<void> {
  const cards = await tx.card.findMany({
    where: { listId, ...LIVE_CARD_SCOPE },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, position: true },
  });

  await renumberPositions(cards, CARD_POSITION_GAP, (id, position) =>
    tx.card.update({ where: { id }, data: { position } }),
  );
}

/**
 * Renumber ordered rows onto a fresh, evenly-spaced positive sequence
 * (`gap`, `2*gap`, …) WITHOUT ever transiently violating a `(scope, position)`
 * unique index.
 *
 * A naive in-place renumber assigns row A a value row B still holds; under a
 * non-deferrable unique index that aborts mid-transaction even when the final
 * state is unique and even when the writes are ordered (reproduced on PG17).
 * We therefore renumber in two passes: first move every row into a disjoint
 * negative staging band (strictly below every current position and below zero,
 * so it collides with neither the current values nor the positive finals), then
 * compact to the final sequence. No intermediate state ever holds a duplicate.
 *
 * Must run inside the caller's transaction — the staging values are only safe
 * until commit. `rows` MUST already be in the desired final order, and
 * `updatePosition` MUST be issued sequentially against the same transaction
 * client (this function awaits each write in turn; do not parallelize them).
 */
export async function renumberPositions(
  rows: readonly { id: string; position: number }[],
  gap: number,
  updatePosition: (id: string, position: number) => Promise<unknown>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  // Fold with reduce rather than `Math.min(...rows.map(...))`: spreading a very
  // large array as call arguments overflows the JS argument limit and throws
  // RangeError, and this is the integrity-recovery path that must complete over
  // ANY input size. Seed with 0 so the staging base is always below zero too.
  const minPosition = rows.reduce((min, row) => Math.min(min, row.position), 0);
  // Staging values sit strictly below every current position AND below zero,
  // so pass 1 never collides with a current value and pass 2's positive finals
  // never collide with a still-staged (negative) row.
  const stagingBase = minPosition - gap;

  for (let i = 0; i < rows.length; i += 1) {
    await updatePosition(rows[i].id, stagingBase - i * gap);
  }

  for (let i = 0; i < rows.length; i += 1) {
    await updatePosition(rows[i].id, gap * (i + 1));
  }
}
