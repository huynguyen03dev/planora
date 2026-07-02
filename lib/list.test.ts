import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  $transaction: vi.fn(),
  list: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: mockDb,
  db: mockDb,
}));

import { StaleNeighborError } from "./ordering";
import { reorderListByNeighbors, resolveListPosition } from "./list";

const GAP = 16384;
const B = "board-1";

type FakeList = { id: string; boardId: string; position: number };

/**
 * In-memory stand-in for the subset of `Prisma.TransactionClient` that
 * `resolveListPosition` touches (`list.findUnique` / `list.findFirst`), honouring
 * the `position` gt/lt filter, the `id: { not }` exclusion, and asc/desc order.
 * Mirrors the card-resolver harness in ordering.test.ts.
 */
function makeListClient(lists: FakeList[]) {
  const matches = (list: FakeList, where: Record<string, unknown>): boolean => {
    if (where.id) {
      if (typeof where.id === "object" && where.id !== null && "not" in where.id) {
        if (list.id === (where.id as { not: string }).not) return false;
      } else if (list.id !== where.id) {
        return false;
      }
    }
    if (where.boardId && list.boardId !== where.boardId) return false;
    if (where.position && typeof where.position === "object") {
      const pos = where.position as { gt?: number; lt?: number };
      if (pos.gt !== undefined && !(list.position > pos.gt)) return false;
      if (pos.lt !== undefined && !(list.position < pos.lt)) return false;
    }
    return true;
  };

  const order = (rows: FakeList[], orderBy: unknown): FakeList[] => {
    const first = Array.isArray(orderBy) ? orderBy[0] : orderBy;
    const dir = (first as { position?: "asc" | "desc" })?.position ?? "asc";
    return [...rows].sort((a, b) =>
      dir === "asc" ? a.position - b.position : b.position - a.position,
    );
  };

  return {
    list: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        lists.find((l) => matches(l, where)) ?? null,
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: unknown;
      }) => order(lists.filter((l) => matches(l, where)), orderBy)[0] ?? null,
    },
  };
}

describe("resolveListPosition (US-062 MJ3)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (lists: FakeList[]) => makeListClient(lists) as any;

  it("appends after the last live list when only prev is given and prev is truly last", async () => {
    const lists: FakeList[] = [
      { id: "a", boardId: B, position: GAP },
      { id: "b", boardId: B, position: GAP * 2 },
    ];
    const pos = await resolveListPosition(client(lists), {
      boardId: B,
      prevListId: "b",
      excludeListId: "mover",
    });
    expect(pos).toBe(GAP * 2 + GAP);
  });

  it("bisects against the real follower — the concurrent end-drop the old direct-bisect looped on", async () => {
    // A rival list has just committed immediately after the client's prev hint
    // ("b"). Anchored bisection must land BETWEEN b and the rival, not on the
    // rival's slot (which the old prev.position + GAP would have returned).
    const lists: FakeList[] = [
      { id: "a", boardId: B, position: GAP },
      { id: "b", boardId: B, position: GAP * 2 },
      { id: "rival", boardId: B, position: GAP * 3 },
    ];
    const pos = await resolveListPosition(client(lists), {
      boardId: B,
      prevListId: "b",
      excludeListId: "mover",
    });
    expect(pos).toBe((GAP * 2 + GAP * 3) / 2);
    expect(pos).not.toBe(GAP * 2 + GAP);
  });

  it("ignores the list being moved when finding the follower", async () => {
    const lists: FakeList[] = [
      { id: "b", boardId: B, position: GAP * 2 },
      { id: "mover", boardId: B, position: GAP * 3 },
    ];
    const pos = await resolveListPosition(client(lists), {
      boardId: B,
      prevListId: "b",
      excludeListId: "mover",
    });
    expect(pos).toBe(GAP * 2 + GAP);
  });

  it("bisects before the real preceder for a start-drop (only next given)", async () => {
    const lists: FakeList[] = [
      { id: "rival", boardId: B, position: GAP },
      { id: "b", boardId: B, position: GAP * 2 },
    ];
    const pos = await resolveListPosition(client(lists), {
      boardId: B,
      nextListId: "b",
      excludeListId: "mover",
    });
    expect(pos).toBe((GAP + GAP * 2) / 2);
  });

  it("places before first when next is truly first", async () => {
    const lists: FakeList[] = [{ id: "b", boardId: B, position: GAP * 2 }];
    const pos = await resolveListPosition(client(lists), {
      boardId: B,
      nextListId: "b",
      excludeListId: "mover",
    });
    expect(pos).toBe(GAP * 2 - GAP);
  });

  it("appends at GAP into an empty board", async () => {
    const pos = await resolveListPosition(client([]), { boardId: B });
    expect(pos).toBe(GAP);
  });

  it("throws a retryable StaleNeighborError when a prev hint is not a live list on the board", async () => {
    const lists: FakeList[] = [{ id: "x", boardId: "other-board", position: GAP }];
    const err = await resolveListPosition(client(lists), {
      boardId: B,
      prevListId: "x",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(StaleNeighborError);
    expect((err as StaleNeighborError).side).toBe("prev");
  });
});

describe("reorderListByNeighbors stale-neighbour recovery (US-062 mn2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops a stale prev hint and appends instead of failing the reorder", async () => {
    // Board has one other live list "keep"; the mover is "m". The client's prev
    // hint "gone" no longer exists (a rival removed/moved it). First attempt
    // throws StaleNeighborError; the loop drops the hint and retries, appending
    // after the last live list.
    const lists: FakeList[] = [
      { id: "keep", boardId: B, position: GAP },
      { id: "m", boardId: B, position: GAP * 5 },
    ];
    const clientFns = makeListClient(lists).list;

    const tx = {
      list: {
        findUnique: clientFns.findUnique,
        findFirst: clientFns.findFirst,
        update: vi.fn(async ({ data }: { data: { position: number } }) => ({
          id: "m",
          boardId: B,
          title: "Moved",
          position: data.position,
          isDone: false,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })),
      },
    };
    // reorderListByNeighbors reads the mover via tx.list.findUnique({id:"m"}) —
    // handled by the fake client — then resolves position, then updates.
    mockDb.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (cb: any) => cb(tx),
    );

    const result = await reorderListByNeighbors({
      listId: "m",
      prevListId: "gone",
    });

    // Appended after the last live list (excluding the mover) → keep.position + GAP.
    expect(result.position).toBe(GAP + GAP);
    expect(tx.list.update).toHaveBeenCalledTimes(1);
  });
});
