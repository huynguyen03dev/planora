import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

/** Gap-based spacing between adjacent card positions (Planka pattern). */
export const CARD_POSITION_GAP = 16384;

/**
 * Minimum gap before forcing a renumber: below this, float bisection can round
 * two positions equal, which `card_listId_position_live_key` would reject.
 */
export const MIN_POSITION_GAP = 0.0001;

/**
 * The where-fragment defining a "live" card. MUST match the predicate of the
 * `card_listId_position_live_key` partial unique index (`archivedAt IS NULL AND
 * deletedAt IS NULL`, decision 0015); a broader "live" notion would allow
 * duplicate `(listId, position)` rows with no P2002 to stop them. Reuse it
 * everywhere cards are positioned or read for reordering.
 */
export const LIVE_CARD_SCOPE = { archivedAt: null, deletedAt: null } as const;

/**
 * Thrown by {@link resolveCardPositionIntent} when neighbouring live cards are
 * too close to bisect (gap < MIN_POSITION_GAP). Callers renumber the scope IN
 * THE SAME transaction (lock still held) and re-resolve — never retry in a
 * separate transaction.
 */
export class PositionSpaceExhaustedError extends Error {
  constructor() {
    super("No positional gap left between neighbours; renumber required");
    this.name = "PositionSpaceExhaustedError";
  }
}

/**
 * Thrown by the position resolvers when the client's EXPLICIT placement intent
 * can no longer be honoured on the current DB state:
 *
 * - `MOVE_REVISION` — the moved card/list was itself moved (or otherwise
 *   reordered) by another user since the client read it; the client's
 *   `expectedMoveRevision` does not match. Return ORDER_CONFLICT and resync.
 * - `ANCHORS_STALE` — a "between" intent arrived with both anchors stale, or
 *   both anchors are still live but their positions contradict the requested
 *   prev-before-next relationship. Return ORDER_CONFLICT rather than silently
 *   appending or reversing the placement.
 * - `SCOPE_STALE` — an ordering-scope row (source/target list, or board) is
 *   missing/archived under the lock; the write cannot proceed in that scope.
 *
 * Actions map this to a typed `ORDER_CONFLICT` result; clients roll back the
 * optimistic commit and resync. Throwing inside `$transaction` aborts it.
 */
export class OrderConflictError extends Error {
  readonly reason: OrderConflictReason;
  constructor(reason: OrderConflictReason) {
    super(
      reason === "MOVE_REVISION"
        ? "Item was moved by someone else"
        : reason === "ANCHORS_STALE"
          ? "Placement anchors are no longer valid"
          : "Ordering scope changed",
    );
    this.name = "OrderConflictError";
    this.reason = reason;
  }
}

export type OrderConflictReason = "MOVE_REVISION" | "ANCHORS_STALE" | "SCOPE_STALE";

/**
 * Explicit client placement intent (decision 0032), derived from the exact drop
 * index: at the start, at the end, or between two named anchors.
 *
 * - `start` / `end` are ABSOLUTE (relative to the current live ends), so a stale
 *   anchor hint never blocks them.
 * - `between` is RELATIVE to `prevCardId`/`nextCardId`: rebase on the single
 *   surviving anchor when exactly one is stale; ORDER_CONFLICT when both are
 *   stale or contradictory.
 */
export type PlacementIntent = "start" | "end" | "between";

/** Row shape returned by {@link lockListRowsForUpdate}. */
export type LockedListRow = {
  id: string;
  boardId: string;
  position: number;
  moveRevision: number;
};

/** Row shape returned by {@link lockCardRowForUpdate}. */
export type LockedCardRow = {
  id: string;
  listId: string;
  position: number;
  moveRevision: number;
};

/**
 * The ordering protocol starts with a workspace row lock: this serializes the
 * complete ordering scope, including recursive automation cascades that can
 * target another board without a cascade-wide lock plan. Within that gate,
 * callers acquire board → lists (ascending id) → card; helpers sort ids so
 * callers cannot introduce a lock inversion. Archived/missing lists are skipped;
 * callers compare returned vs. input length to detect a scope that vanished
 * under the lock.
 */
export async function lockWorkspaceRowForUpdate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "workspace" WHERE id = ${workspaceId} FOR UPDATE
  `;
}

export async function lockBoardRowsForUpdate(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
): Promise<Array<{ id: string }>> {
  const unique = [...new Set(ids)].sort();
  const rows: Array<{ id: string }> = [];
  for (const id of unique) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "board"
      WHERE id = ${id} AND "archivedAt" IS NULL
      FOR UPDATE
    `;
    if (locked.length > 0) {
      rows.push(locked[0]);
    }
  }
  return rows;
}

export async function lockListRowsForUpdate(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
): Promise<LockedListRow[]> {
  const unique = [...new Set(ids)].sort();
  const rows: LockedListRow[] = [];
  for (const id of unique) {
    const locked = await tx.$queryRaw<LockedListRow[]>`
      SELECT id, "boardId", position, "moveRevision" FROM "list"
      WHERE id = ${id} AND "archivedAt" IS NULL
      FOR UPDATE
    `;
    if (locked.length > 0) {
      rows.push(locked[0]);
    }
  }
  return rows;
}

/**
 * Lock a live card row (`FOR UPDATE`) — the moved item. Reading `moveRevision`
 * and `listId` under the lock makes the `expectedMoveRevision` compare-and-set
 * race-free. Returns null when the card is missing/archived/soft-deleted.
 */
export async function lockCardRowForUpdate(
  tx: Prisma.TransactionClient,
  cardId: string,
): Promise<LockedCardRow | null> {
  const locked = await tx.$queryRaw<LockedCardRow[]>`
    SELECT id, "listId", position, "moveRevision" FROM "card"
    WHERE id = ${cardId} AND "archivedAt" IS NULL AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  return locked[0] ?? null;
}

/**
 * Lock an active board row (`FOR UPDATE`) — the list-ordering scope. Returns
 * null when the board is missing/archived (caller treats as not-found).
 */
export async function lockBoardRowForUpdate(
  tx: Prisma.TransactionClient,
  boardId: string,
): Promise<{ id: string } | null> {
  const locked = await lockBoardRowsForUpdate(tx, [boardId]);
  return locked[0] ?? null;
}

/**
 * Compute the position for a card placed in `targetListId` per an EXPLICIT
 * {@link PlacementIntent}, reading only CURRENT live occupants (decision 0032).
 * The caller's transaction client MUST already hold the target list's `FOR
 * UPDATE` row lock ({@link lockListRowsForUpdate}) so read-decide-write is
 * serialized — no retry loop needed.
 *
 * - `start` / `end` → before/after the current first/last live card (or `GAP`
 *   when empty). Absolute; never conflict.
 * - `between` → validate BOTH anchors against current live occupants; bisect
 *   between the surviving anchor and the card CURRENTLY occupying the adjacent
 *   slot (anchored-bisection fixing the concurrent end-drop: once a rival lands
 *   right after `prev`, we bisect into a distinct slot instead of recomputing
 *   `prev + GAP`). Rebase on the single surviving anchor when exactly one is
 *   stale; throw {@link OrderConflictError}("ANCHORS_STALE") when both are
 *   stale or reversed.
 *
 * `excludeCardId` omits the mover from the adjacency search so a within-list
 * reorder never bisects against its own stale slot. Throws
 * {@link PositionSpaceExhaustedError} when there is no room — the caller
 * renumbers the scope IN THE SAME transaction (lock still held) and re-resolves.
 */
export async function resolveCardPositionIntent(
  client: Prisma.TransactionClient,
  data: {
    targetListId: string;
    intent: PlacementIntent;
    prevCardId?: string | null;
    nextCardId?: string | null;
    excludeCardId?: string | null;
  },
): Promise<number> {
  const { targetListId, intent, excludeCardId } = data;
  const prevCardId = data.prevCardId ?? null;
  const nextCardId = data.nextCardId ?? null;
  const notMoved = excludeCardId ? { id: { not: excludeCardId } } : {};

  if (intent === "start") {
    const first = await client.card.findFirst({
      where: { listId: targetListId, ...LIVE_CARD_SCOPE, ...notMoved },
      orderBy: { position: "asc" },
      select: { position: true },
    });
    return first ? first.position - CARD_POSITION_GAP : CARD_POSITION_GAP;
  }

  if (intent === "end") {
    const last = await client.card.findFirst({
      where: { listId: targetListId, ...LIVE_CARD_SCOPE, ...notMoved },
      orderBy: [{ position: "desc" }, { createdAt: "desc" }],
      select: { position: true },
    });
    return last ? last.position + CARD_POSITION_GAP : CARD_POSITION_GAP;
  }

  // between: validate anchors against current live occupants.
  let prev: { position: number } | null = null;
  let next: { position: number } | null = null;
  if (prevCardId) {
    const p = await client.card.findUnique({
      where: { id: prevCardId, ...LIVE_CARD_SCOPE },
      select: { id: true, listId: true, position: true },
    });
    if (p && p.listId === targetListId) {
      prev = p;
    }
  }
  if (nextCardId) {
    const n = await client.card.findUnique({
      where: { id: nextCardId, ...LIVE_CARD_SCOPE },
      select: { id: true, listId: true, position: true },
    });
    if (n && n.listId === targetListId) {
      next = n;
    }
  }

  if (!prev && !next) {
    // Both anchors stale for an explicit between intent → typed conflict, never a silent append.
    throw new OrderConflictError("ANCHORS_STALE");
  }

  if (prev && next && prev.position >= next.position) {
    // Both anchors exist but the client's prev-before-next relation no longer
    // holds in the live order — treat the contradictory snapshot as stale.
    throw new OrderConflictError("ANCHORS_STALE");
  }

  if (prev) {
    const following = await client.card.findFirst({
      where: {
        listId: targetListId,
        ...LIVE_CARD_SCOPE,
        position: { gt: prev.position },
        ...notMoved,
      },
      orderBy: { position: "asc" },
      select: { position: true },
    });

    if (!following) {
      return prev.position + CARD_POSITION_GAP;
    }
    return bisect(prev.position, following.position);
  }

  const nextCard = next as { position: number };
  const preceding = await client.card.findFirst({
    where: {
      listId: targetListId,
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
 * safe under `card_listId_position_live_key`. Runs on the caller's transaction
 * client to share the reorder's transaction. Internal maintenance: preserves
 * sibling relative order and deliberately does not bump sibling `moveRevision`.
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
 * Renumber rows onto a fresh evenly-spaced positive sequence (`gap`, `2*gap`, …)
 * without EVER transiently violating a `(scope, position)` unique index.
 *
 * A naive in-place renumber assigns row A a value row B still holds; under a
 * non-deferrable unique index that aborts mid-transaction even when the final
 * state is unique and the writes are ordered (reproduced on PG17). So: pass 1
 * moves every row into a disjoint negative staging band (below all current
 * positions and below zero — collides with neither current values nor the
 * positive finals), then pass 2 compacts to the final sequence. No intermediate
 * state ever holds a duplicate.
 *
 * Must run inside the caller's transaction (staging values are only safe until
 * commit). `rows` MUST already be in final order, and `updatePosition` MUST be
 * issued sequentially against the same transaction client — do not parallelize.
 */
export async function renumberPositions(
  rows: readonly { id: string; position: number }[],
  gap: number,
  updatePosition: (id: string, position: number) => Promise<unknown>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  // Fold with reduce, not `Math.min(...rows.map(...))`: spreading a very large
  // array overflows the JS argument limit (RangeError), and this recovery path
  // must complete over ANY input size. Seed with 0 so the staging base is
  // always below zero too.
  const minPosition = rows.reduce((min, row) => Math.min(min, row.position), 0);
  // Staging values sit strictly below every current position AND below zero, so
  // pass 1 never collides with a current value and pass 2's finals never
  // collide with a still-staged (negative) row.
  const stagingBase = minPosition - gap;

  for (let i = 0; i < rows.length; i += 1) {
    await updatePosition(rows[i].id, stagingBase - i * gap);
  }

  for (let i = 0; i < rows.length; i += 1) {
    await updatePosition(rows[i].id, gap * (i + 1));
  }
}
