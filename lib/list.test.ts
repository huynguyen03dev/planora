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
import {
  archiveList,
  getArchivedListWithBoard,
  getArchivedLists,
  getListsByBoardId,
  getListWithBoard,
  reorderListByNeighbors,
  resolveListPosition,
  restoreList,
  updateListTitle,
} from "./list";

const GAP = 16384;
const B = "board-1";

type FakeList = {
  id: string;
  boardId: string;
  position: number;
  archivedAt?: Date | null;
};

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
    if ("archivedAt" in where && where.archivedAt === null && Boolean(list.archivedAt)) {
      return false;
    }
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

  it("throws a retryable StaleNeighborError when a prev hint is an archived list", async () => {
    const lists: FakeList[] = [{ id: "archived-1", boardId: B, position: GAP, archivedAt: new Date() }];
    const err = await resolveListPosition(client(lists), {
      boardId: B,
      prevListId: "archived-1",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(StaleNeighborError);
    expect((err as StaleNeighborError).side).toBe("prev");
  });

  it("skips archived middle/follower lists during bisection, making archived lists invisible to adjacency search", async () => {
    // Live list A at GAP, archived list M in middle at GAP*2, live list B at GAP*3
    const lists: FakeList[] = [
      { id: "a", boardId: B, position: GAP },
      { id: "m", boardId: B, position: GAP * 2, archivedAt: new Date() },
      { id: "b", boardId: B, position: GAP * 3 },
    ];

    // prevListId = "a": follower search must skip archived "m" and find live "b"
    const posPrev = await resolveListPosition(client(lists), {
      boardId: B,
      prevListId: "a",
      excludeListId: "mover",
    });
    expect(posPrev).toBe((GAP + GAP * 3) / 2);

    // nextListId = "b": preceding search must skip archived "m" and find live "a"
    const posNext = await resolveListPosition(client(lists), {
      boardId: B,
      nextListId: "b",
      excludeListId: "mover",
    });
    expect(posNext).toBe((GAP + GAP * 3) / 2);

    // Archived list at the end of the board: follower search must return null and append after A
    const listsEndArchived: FakeList[] = [
      { id: "a", boardId: B, position: GAP },
      { id: "m", boardId: B, position: GAP * 2, archivedAt: new Date() },
    ];
    const posEnd = await resolveListPosition(client(listsEndArchived), {
      boardId: B,
      prevListId: "a",
      excludeListId: "mover",
    });
    expect(posEnd).toBe(GAP + GAP);
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

  it("triggers normalizeListPositions on PositionSpaceExhaustedError, filtering archivedAt:null, and succeeds on retry", async () => {
    // Setup board with mover list 'm' and another list 'keep'
    const moverList = { id: "m", boardId: B, title: "Mover", position: GAP, archivedAt: null, createdAt: new Date(0), updatedAt: new Date(0) };
    const keepList = { id: "keep", boardId: B, title: "Keep", position: GAP, archivedAt: null, createdAt: new Date(0), updatedAt: new Date(0) };
    let attempt = 0;
    const findManyCalls: Array<Record<string, unknown>> = [];

    // First attempt: resolveListPosition in reorderListByNeighbors is called.
    // findUnique finds "m" and "keep", but finding following list throws PositionSpaceExhaustedError.
    const txAttempt1 = {
      list: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id === "m") return moverList;
          if (where.id === "keep") return keepList;
          return null;
        }),
        findFirst: vi.fn(async () => {
          const { PositionSpaceExhaustedError } = await import("./ordering");
          throw new PositionSpaceExhaustedError();
        }),
        update: vi.fn(),
      },
    };

    // Normalization transaction: db.$transaction calls normalizeListPositions callback
    const txNormalize = {
      list: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          findManyCalls.push(where);
          return [moverList, keepList];
        }),
        update: vi.fn(async () => moverList),
      },
    };

    // Second attempt after normalization: succeeds
    const txAttempt2 = {
      list: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id === "m") return moverList;
          if (where.id === "keep") return keepList;
          return null;
        }),
        findFirst: vi.fn(async () => null), // no following list after keep -> appends
        update: vi.fn(async ({ data }: { data: { position: number } }) => ({
          ...moverList,
          position: data.position,
        })),
      },
    };

    mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      attempt += 1;
      if (attempt === 1) {
        return cb(txAttempt1);
      }
      if (attempt === 2) {
        // This is normalizeListPositions transaction
        return cb(txNormalize);
      }
      if (attempt === 3) {
        // This is retry attempt in reorderListByNeighbors
        return cb(txAttempt2);
      }
      throw new Error(`Unexpected transaction attempt ${attempt}`);
    });

    const result = await reorderListByNeighbors({
      listId: "m",
      prevListId: "keep",
    });

    expect(result.position).toBeDefined();
    // Verify normalizeListPositions ran tx.list.findMany with archivedAt: null
    expect(findManyCalls).toHaveLength(1);
    expect(findManyCalls[0]).toEqual({ boardId: B, archivedAt: null });
    expect(txAttempt2.list.update).toHaveBeenCalledTimes(1);
  });
});

describe("archiveList (US-074 Slice A)", () => {
  it("soft-deletes list by setting archivedAt", async () => {
    mockDb.list.update.mockResolvedValueOnce({
      id: "l-1",
      boardId: B,
      title: "List 1",
      position: GAP,
      archivedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await archiveList("l-1");
    expect(mockDb.list.update).toHaveBeenCalledWith({
      where: { id: "l-1" },
      data: { archivedAt: expect.any(Date) },
      select: expect.objectContaining({ archivedAt: true }),
    });
    expect(res.archivedAt).toBeInstanceOf(Date);
  });
});

describe("getListsByBoardId — active-board visibility (US-074 Slice A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries with boardId + archivedAt: null so archived lists never enter the board result set", async () => {
    mockDb.list.findMany.mockResolvedValueOnce([]);

    const res = await getListsByBoardId(B);

    // Pins the exact where-shape: both the board scope AND the archivedAt: null
    // filter. Dropping either from getListsByBoardId fails this assertion.
    expect(mockDb.list.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { boardId: B, archivedAt: null },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      }),
    );
    expect(res).toEqual([]);
  });

  it("returns only live lists of the passed board, dropping archived and foreign-board rows", async () => {
    const now = new Date();
    const row = (id: string, boardId: string, position: number, archivedAt: Date | null) => ({
      id,
      boardId,
      title: id,
      position,
      archivedAt,
      createdAt: now,
      updatedAt: now,
      cards: [],
    });

    // Where-aware fake: honours the where clause exactly like Prisma would, so
    // archived rows are dropped ONLY when the query itself asks for live lists.
    // Removing `archivedAt: null` from getListsByBoardId therefore leaks
    // "l-archived" into the returned set and fails the assertion below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.list.findMany.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }): Promise<any[]> =>
        [
          row("l-1", B, GAP, null),
          row("l-archived", B, GAP * 2, new Date()),
          row("l-other-board", "board-2", GAP, null),
        ].filter((r) => {
          if (where.boardId && r.boardId !== where.boardId) return false;
          if ("archivedAt" in where && where.archivedAt === null && Boolean(r.archivedAt)) {
            return false;
          }
          return true;
        }),
    );

    const res = await getListsByBoardId(B);

    expect(res.map((l) => l.id)).toEqual(["l-1"]);
  });
});

describe("US-074 Slice B — getArchivedLists / getArchivedListWithBoard / restoreList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getArchivedLists", () => {
    it("returns archived lists with non-deleted card counts", async () => {
      const now = new Date();
      mockDb.list.findMany.mockResolvedValueOnce([
        {
          id: "l-arch-1",
          boardId: B,
          title: "Archived List 1",
          position: 16384,
          archivedAt: now,
          _count: { cards: 3 },
        },
      ]);

      const res = await getArchivedLists(B);

      expect(mockDb.list.findMany).toHaveBeenCalledWith({
        where: {
          boardId: B,
          archivedAt: { not: null },
          board: { archivedAt: null },
        },
        orderBy: { archivedAt: "desc" },
        select: {
          id: true,
          boardId: true,
          title: true,
          position: true,
          archivedAt: true,
          _count: {
            select: {
              cards: {
                where: { deletedAt: null },
              },
            },
          },
        },
      });

      expect(res).toEqual([
        {
          id: "l-arch-1",
          boardId: B,
          title: "Archived List 1",
          position: 16384,
          archivedAt: now,
          cardCount: 3,
        },
      ]);
    });
  });

  describe("getArchivedListWithBoard", () => {
    it("returns null if list is not found or list is active (not archived)", async () => {
      mockDb.list.findFirst.mockResolvedValueOnce(null);
      const res = await getArchivedListWithBoard("l-active");
      expect(res).toBeNull();
      expect(mockDb.list.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "l-active",
            archivedAt: { not: null },
            board: { archivedAt: null },
          },
        }),
      );
    });

    it("returns null when board is archived (rejects archived board at resolver level)", async () => {
      // The query has board: { archivedAt: null } so an archived board makes the
      // entire row filtered out — same as if the list didn't exist.
      mockDb.list.findFirst.mockResolvedValueOnce(null);
      const res = await getArchivedListWithBoard("l-board-archived");
      expect(res).toBeNull();
      expect(mockDb.list.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            board: { archivedAt: null },
          }),
        }),
      );
    });
  });

  describe("restoreList", () => {
    it("preserves original position if position is free", async () => {
      const now = new Date();
      const tx = {
        list: {
          findFirst: vi
            .fn()
            // 1. targetList lookup inside tx
            .mockResolvedValueOnce({ id: "l-1", boardId: B, position: 16384 })
            // 2. occupied lookup -> free
            .mockResolvedValueOnce(null),
          updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValueOnce({
            id: "l-1",
            boardId: B,
            title: "List 1",
            position: 16384,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        },
      };

      mockDb.$transaction.mockImplementationOnce(async (cb: (t: typeof tx) => unknown) => cb(tx));

      const res = await restoreList("l-1");
      expect(res.position).toBe(16384);
      expect(tx.list.updateMany).toHaveBeenCalledWith({
        where: { id: "l-1", archivedAt: { not: null } },
        data: { archivedAt: null, position: 16384 },
      });
    });

    it("appends after last active list if original position is occupied", async () => {
      const now = new Date();
      const tx = {
        list: {
          findFirst: vi
            .fn()
            // 1. targetList lookup inside tx
            .mockResolvedValueOnce({ id: "l-1", boardId: B, position: 16384 })
            // 2. occupied lookup -> occupied by active list!
            .mockResolvedValueOnce({ id: "l-active-1" })
            // 3. lastActive lookup -> max position is 32768
            .mockResolvedValueOnce({ position: 32768 }),
          updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValueOnce({
            id: "l-1",
            boardId: B,
            title: "List 1",
            position: 32768 + GAP,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        },
      };

      mockDb.$transaction.mockImplementationOnce(async (cb: (t: typeof tx) => unknown) => cb(tx));

      const res = await restoreList("l-1");
      expect(res.position).toBe(32768 + GAP);
      expect(tx.list.updateMany).toHaveBeenCalledWith({
        where: { id: "l-1", archivedAt: { not: null } },
        data: { archivedAt: null, position: 49152 },
      });
    });

    it("guards active/missing list inside transaction with LIST_NOT_FOUND error", async () => {
      const tx = {
        list: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
      };
      mockDb.$transaction.mockImplementationOnce(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await expect(restoreList("l-active")).rejects.toThrow("LIST_NOT_FOUND");
    });

    it("retries on P2002 collision by opening a fresh transaction and recomputing target", async () => {
      const now = new Date();
      const p2002Err = new Error("Unique constraint failed");
      (p2002Err as { code?: string }).code = "P2002";

      // Attempt 1: target position occupied, computes 49152, updateMany throws P2002
      const tx1 = {
        list: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: "l-1", boardId: B, position: 16384 })
            .mockResolvedValueOnce({ id: "l-active-1" })
            .mockResolvedValueOnce({ position: 32768 }),
          updateMany: vi.fn().mockRejectedValueOnce(p2002Err),
        },
      };

      // Attempt 2: fresh tx, lastActive is now 49152, computes 65536, updateMany succeeds!
      const tx2 = {
        list: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: "l-1", boardId: B, position: 16384 })
            .mockResolvedValueOnce({ id: "l-active-1" })
            .mockResolvedValueOnce({ position: 49152 }),
          updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValueOnce({
            id: "l-1",
            boardId: B,
            title: "List 1",
            position: 65536,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        },
      };

      mockDb.$transaction
        .mockImplementationOnce(async (cb: (t: typeof tx1) => unknown) => cb(tx1))
        .mockImplementationOnce(async (cb: (t: typeof tx2) => unknown) => cb(tx2));

      const res = await restoreList("l-1");
      expect(res.position).toBe(65536);
      expect(tx2.list.updateMany).toHaveBeenCalledWith({
        where: { id: "l-1", archivedAt: { not: null } },
        data: { archivedAt: null, position: 65536 },
      });
    });

    it("throws retry exhaustion error when all retries hit P2002", async () => {
      const p2002Err = new Error("Unique constraint failed");
      (p2002Err as { code?: string }).code = "P2002";

      mockDb.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) =>
        cb({
          list: {
            findFirst: vi
              .fn()
              .mockResolvedValueOnce({ id: "l-1", boardId: B, position: 16384 })
              .mockResolvedValueOnce(null),
            updateMany: vi.fn().mockRejectedValue(p2002Err),
          },
        }),
      );

      await expect(restoreList("l-1")).rejects.toThrow("Failed to restore list after retrying position conflicts");
    });
  });

  describe("getListWithBoard — resolver-level filters (US-074 Slice B2)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns null when list is not found (archivedAt: null filter excludes archived lists)", async () => {
      mockDb.list.findUnique.mockResolvedValueOnce(null);
      const res = await getListWithBoard("l-archived");
      expect(res).toBeNull();
      expect(mockDb.list.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "l-archived", archivedAt: null },
        }),
      );
    });

    it("includes board.archivedAt in the select for action-level board-archive check", async () => {
      const now = new Date();
      mockDb.list.findUnique.mockResolvedValueOnce({
        id: "l-1",
        boardId: "b-1",
        title: "Active List",
        position: 16384,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        board: {
          id: "b-1",
          workspaceId: "ws-1",
          archivedAt: null,
        },
      });

      const res = await getListWithBoard("l-1");
      expect(res).not.toBeNull();
      expect(res!.board.archivedAt).toBeNull();
      expect(res!.list.archivedAt).toBeNull();
    });

    it("returns live row with board workspaceId when both list and board are active", async () => {
      const now = new Date();
      mockDb.list.findUnique.mockResolvedValueOnce({
        id: "l-1",
        boardId: "b-1",
        title: "Active List",
        position: 16384,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        board: {
          id: "b-1",
          workspaceId: "ws-1",
          archivedAt: null,
        },
      });

      const res = await getListWithBoard("l-1");
      expect(res).not.toBeNull();
      expect(res!.list.id).toBe("l-1");
      expect(res!.board.workspaceId).toBe("ws-1");
    });
  });

  describe("updateListTitle — archivedAt:null defense-in-depth filter (US-074 Slice B2)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("queries with archivedAt:null so archived lists cannot be renamed", async () => {
      const now = new Date();
      mockDb.list.update.mockResolvedValueOnce({
        id: "l-1",
        boardId: "b-1",
        title: "New Title",
        position: 16384,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const res = await updateListTitle("l-1", "New Title");
      expect(res.title).toBe("New Title");
      expect(mockDb.list.update).toHaveBeenCalledWith({
        where: { id: "l-1", archivedAt: null },
        data: { title: "New Title" },
        select: expect.objectContaining({
          archivedAt: true,
        }),
      });
    });
  });
});
