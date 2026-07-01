import { describe, expect, it } from "vitest";

import {
  CARD_POSITION_GAP,
  PositionSpaceExhaustedError,
  renumberPositions,
  resolveCardPosition,
} from "./ordering";

const GAP = 16384;

type FakeCard = { id: string; listId: string; position: number };

/**
 * A minimal in-memory stand-in for the subset of `Prisma.TransactionClient`
 * that `resolveCardPosition` touches (`card.findUnique` / `card.findFirst`).
 * It honours the `position` gt/lt filter, the `id: { not }` exclusion, and
 * asc/desc ordering so we can reproduce the concurrent-drop scenarios.
 */
function makeClient(cards: FakeCard[]) {
  const matches = (card: FakeCard, where: Record<string, unknown>): boolean => {
    if (where.id) {
      if (typeof where.id === "object" && where.id !== null && "not" in where.id) {
        if (card.id === (where.id as { not: string }).not) return false;
      } else if (card.id !== where.id) {
        return false;
      }
    }
    if (where.listId && card.listId !== where.listId) return false;
    if (where.position && typeof where.position === "object") {
      const pos = where.position as { gt?: number; lt?: number };
      if (pos.gt !== undefined && !(card.position > pos.gt)) return false;
      if (pos.lt !== undefined && !(card.position < pos.lt)) return false;
    }
    return true;
  };

  const order = (rows: FakeCard[], orderBy: unknown): FakeCard[] => {
    const first = Array.isArray(orderBy) ? orderBy[0] : orderBy;
    const dir = (first as { position?: "asc" | "desc" })?.position ?? "asc";
    return [...rows].sort((a, b) =>
      dir === "asc" ? a.position - b.position : b.position - a.position,
    );
  };

  return {
    card: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        cards.find((c) => matches(c, where)) ?? null,
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: unknown;
      }) => order(cards.filter((c) => matches(c, where)), orderBy)[0] ?? null,
    },
  };
}

/**
 * Simulate a non-deferrable `(scope, position)` unique index over a single
 * scope: each write rejects (like Postgres P2002) if another row already holds
 * the target position at the moment of the write. `renumberPositions` must
 * complete over ANY input without ever tripping this.
 */
function runUnderUniqueIndex(
  rows: { id: string; position: number }[],
): Promise<Map<string, number>> {
  const state = new Map(rows.map((r) => [r.id, r.position]));

  const updatePosition = async (id: string, position: number): Promise<void> => {
    for (const [otherId, otherPos] of state) {
      if (otherId !== id && otherPos === position) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
    }
    state.set(id, position);
  };

  return renumberPositions(rows, GAP, updatePosition).then(() => state);
}

describe("renumberPositions", () => {
  it("is a no-op for an empty list", async () => {
    const state = await runUnderUniqueIndex([]);
    expect(state.size).toBe(0);
  });

  it("compacts to an evenly-spaced positive sequence in the given order", async () => {
    const rows = [
      { id: "a", position: 100 },
      { id: "b", position: 250 },
      { id: "c", position: 999 },
    ];
    const state = await runUnderUniqueIndex(rows);
    expect(state.get("a")).toBe(GAP * 1);
    expect(state.get("b")).toBe(GAP * 2);
    expect(state.get("c")).toBe(GAP * 3);
  });

  it("never trips the unique index even when every input position collides", async () => {
    // All four rows share the same starting position — the exact duplicate
    // state the dedupe pass repairs, and the worst case for an in-place renumber.
    const rows = [
      { id: "a", position: 16384 },
      { id: "b", position: 16384 },
      { id: "c", position: 16384 },
      { id: "d", position: 16384 },
    ];
    // Would throw P2002 mid-run under a naive in-place renumber.
    const state = await runUnderUniqueIndex(rows);
    expect([...state.values()].sort((x, y) => x - y)).toEqual([
      GAP * 1,
      GAP * 2,
      GAP * 3,
      GAP * 4,
    ]);
  });

  it("is safe when a final target equals a current position (in-place overlap)", async () => {
    // b already sits on its future slot (GAP*2); a naive pass that moves a→GAP*1
    // then b→GAP*2 is fine, but c→GAP*3 over b's old GAP*2 etc. can collide.
    const rows = [
      { id: "a", position: 5 },
      { id: "b", position: GAP * 2 },
      { id: "c", position: GAP * 1 },
    ];
    const state = await runUnderUniqueIndex(rows);
    expect(state.get("a")).toBe(GAP * 1);
    expect(state.get("b")).toBe(GAP * 2);
    expect(state.get("c")).toBe(GAP * 3);
  });

  it("stages below zero, so negative/zero current positions do not collide", async () => {
    // Repeated 'insert before first' can drive positions to 0 and below.
    const rows = [
      { id: "a", position: -GAP },
      { id: "b", position: 0 },
      { id: "c", position: GAP },
    ];
    const state = await runUnderUniqueIndex(rows);
    expect(state.get("a")).toBe(GAP * 1);
    expect(state.get("b")).toBe(GAP * 2);
    expect(state.get("c")).toBe(GAP * 3);
  });

  it("completes over a very large list without a RangeError from argument spread", async () => {
    // A pathologically large list would overflow the JS call-argument limit if
    // the min were computed via `Math.min(...rows.map(...))`. The reduce-based
    // fold must handle it — this is the integrity-recovery path.
    const N = 200_000;
    const rows = Array.from({ length: N }, (_, i) => ({ id: `r${i}`, position: 1 }));
    const writes: number[] = [];
    await renumberPositions(rows, GAP, async (_id, position) => {
      writes.push(position);
    });
    expect(writes).toHaveLength(N * 2);
    // Last write is the final slot of the last row.
    expect(writes[writes.length - 1]).toBe(GAP * N);
  });

  it("performs a full two-pass renumber (2N writes) that stages before compacting", async () => {
    const writes: Array<{ id: string; position: number }> = [];
    const rows = [
      { id: "a", position: 10 },
      { id: "b", position: 20 },
    ];
    await renumberPositions(rows, GAP, async (id, position) => {
      writes.push({ id, position });
    });
    expect(writes).toHaveLength(rows.length * 2);
    // Pass 1: every row parked in the disjoint negative staging band.
    expect(writes.slice(0, 2).every((w) => w.position < 0)).toBe(true);
    // Pass 2: compacted to the final positive sequence.
    expect(writes.slice(2)).toEqual([
      { id: "a", position: GAP * 1 },
      { id: "b", position: GAP * 2 },
    ]);
  });
});

describe("resolveCardPosition", () => {
  const L = "list-1";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (cards: FakeCard[]) => makeClient(cards) as any;

  it("appends after the last live card when only prev is given and prev is truly last", async () => {
    const cards: FakeCard[] = [
      { id: "a", listId: L, position: GAP },
      { id: "b", listId: L, position: GAP * 2 },
    ];
    const pos = await resolveCardPosition(client(cards), {
      targetListId: L,
      prevCardId: "b",
      excludeCardId: "mover",
    });
    expect(pos).toBe(GAP * 2 + CARD_POSITION_GAP);
  });

  it("bisects against the real follower — the concurrent end-drop that used to loop forever (US-056 #10)", async () => {
    // A rival's card ("rival") has just committed immediately after the client's
    // prev hint ("b"). The old code returned b.position + GAP = rival's slot and
    // re-collided every retry. Anchored bisection must instead land BETWEEN b and
    // the rival, i.e. a distinct, collision-free position.
    const cards: FakeCard[] = [
      { id: "a", listId: L, position: GAP },
      { id: "b", listId: L, position: GAP * 2 },
      { id: "rival", listId: L, position: GAP * 3 },
    ];
    const pos = await resolveCardPosition(client(cards), {
      targetListId: L,
      prevCardId: "b",
      excludeCardId: "mover",
    });
    expect(pos).toBe((GAP * 2 + GAP * 3) / 2);
    expect(pos).not.toBe(GAP * 2 + CARD_POSITION_GAP); // not the rival's slot
  });

  it("ignores the card being moved when finding the follower", async () => {
    // The mover currently sits right after prev; excluding it means prev is
    // treated as last, so we append rather than bisect against ourselves.
    const cards: FakeCard[] = [
      { id: "b", listId: L, position: GAP * 2 },
      { id: "mover", listId: L, position: GAP * 3 },
    ];
    const pos = await resolveCardPosition(client(cards), {
      targetListId: L,
      prevCardId: "b",
      excludeCardId: "mover",
    });
    expect(pos).toBe(GAP * 2 + CARD_POSITION_GAP);
  });

  it("bisects before the real preceder for a start-drop (only next given)", async () => {
    const cards: FakeCard[] = [
      { id: "rival", listId: L, position: GAP },
      { id: "b", listId: L, position: GAP * 2 },
    ];
    const pos = await resolveCardPosition(client(cards), {
      targetListId: L,
      nextCardId: "b",
      excludeCardId: "mover",
    });
    expect(pos).toBe((GAP + GAP * 2) / 2);
  });

  it("places before first when next is truly first", async () => {
    const cards: FakeCard[] = [{ id: "b", listId: L, position: GAP * 2 }];
    const pos = await resolveCardPosition(client(cards), {
      targetListId: L,
      nextCardId: "b",
      excludeCardId: "mover",
    });
    expect(pos).toBe(GAP * 2 - CARD_POSITION_GAP);
  });

  it("throws PositionSpaceExhaustedError when neighbours are too close to split", async () => {
    const cards: FakeCard[] = [
      { id: "b", listId: L, position: 1000 },
      { id: "rival", listId: L, position: 1000.00005 }, // gap < MIN_POSITION_GAP
    ];
    await expect(
      resolveCardPosition(client(cards), {
        targetListId: L,
        prevCardId: "b",
        excludeCardId: "mover",
      }),
    ).rejects.toBeInstanceOf(PositionSpaceExhaustedError);
  });

  it("appends at CARD_POSITION_GAP into an empty list", async () => {
    const pos = await resolveCardPosition(client([]), { targetListId: L });
    expect(pos).toBe(CARD_POSITION_GAP);
  });

  it("rejects a prev hint that points outside the target list", async () => {
    const cards: FakeCard[] = [{ id: "x", listId: "other-list", position: GAP }];
    await expect(
      resolveCardPosition(client(cards), { targetListId: L, prevCardId: "x" }),
    ).rejects.toThrow("Invalid prevCardId");
  });
});
