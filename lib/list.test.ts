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

import { OrderConflictError } from "./ordering";
import {
  archiveList,
  getArchivedListWithBoard,
  getArchivedLists,
  getListsByBoardId,
  getListWithBoard,
  reorderListByNeighbors,
  resolveListPositionIntent,
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
 * `resolveListPositionIntent` touches (`list.findUnique` / `list.findFirst`),
 * honouring the `position` gt/lt filter, the `id: { not }` exclusion, and
 * asc/desc order. Mirrors the card-resolver harness in ordering.test.ts.
 *
 * `makeRawLockMock` additionally fakes `$queryRaw` for the `FOR UPDATE` lock
 * helpers: the board-scope lock, the live-list lock, and the archived-list lock
 * are routed by the SQL text of the raw query (decision 0032).
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

describe("resolveListPositionIntent (decision 0032)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (lists: FakeList[]) => makeListClient(lists) as any;

  it("end intent appends after the last live list (absolute, ignores stale hints)", async () => {
    const lists: FakeList[] = [
      { id: "a", boardId: B, position: GAP },
      { id: "b", boardId: B, position: GAP * 2 },
    ];
    const pos = await resolveListPositionIntent(client(lists), {
      boardId: B,
      intent: "end",
      prevListId: "stale-hint",
      excludeListId: "mover",
    });
    expect(pos).toBe(GAP * 2 + GAP);
  });

  it("between intent bisects against the real follower — the concurrent end-drop the old direct-bisect looped on", async () => {
    // A rival list has just committed immediately after the client's prev hint
    // ("b"). Anchored bisection must land BETWEEN b and the rival, not on the
    // rival's slot (which the old prev.position + GAP would have returned).
    const lists: FakeList[] = [
      { id: "a", boardId: B, position: GAP },
      { id: "b", boardId: B, position: GAP * 2 },
      { id: "rival", boardId: B, position: GAP * 3 },
    ];
    const pos = await resolveListPositionIntent(client(lists), {
      boardId: B,
      intent: "between",
      prevListId: "b",
      nextListId: "rival",
      excludeListId: "mover",
    });
    expect(pos).toBe((GAP * 2 + GAP * 3) / 2);
    expect(pos).not.toBe(GAP * 2 + GAP);
  });

  it("between intent ignores the list being moved when finding the follower", async () => {
    const lists: FakeList[] = [
      { id: "b", boardId: B, position: GAP * 2 },
      { id: "mover", boardId: B, position: GAP * 3 },
    ];
    const pos = await resolveListPositionIntent(client(lists), {
      boardId: B,
      intent: "between",
      prevListId: "b",
      excludeListId: "mover",
    });
    expect(pos).toBe(GAP * 2 + GAP);
  });

    it("between intent rebases on the surviving NEXT anchor when prev is stale", async () => {
    const lists: FakeList[] = [
      { id: "rival", boardId: B, position: GAP },
      { id: "b", boardId: B, position: GAP * 2 },
    ];
    const pos = await resolveListPositionIntent(client(lists), {
      boardId: B,
      intent: "between",
      prevListId: "gone",
      nextListId: "b",
      excludeListId: "mover",
    });
      expect(pos).toBe((GAP + GAP * 2) / 2);
    });

    it("rejects between anchors that are both live but reversed", async () => {
      const lists: FakeList[] = [
        { id: "prev", boardId: B, position: GAP * 3 },
        { id: "next", boardId: B, position: GAP * 2 },
      ];

      const error = await resolveListPositionIntent(client(lists), {
        boardId: B,
        intent: "between",
        prevListId: "prev",
        nextListId: "next",
        excludeListId: "mover",
      }).catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(OrderConflictError);
      expect((error as OrderConflictError).reason).toBe("ANCHORS_STALE");
    });

  it("start intent places before the current first live list (absolute)", async () => {
    const lists: FakeList[] = [
      { id: "first", boardId: B, position: GAP },
      { id: "b", boardId: B, position: GAP * 2 },
    ];
    const pos = await resolveListPositionIntent(client(lists), {
      boardId: B,
      intent: "start",
      nextListId: "stale-hint",
      excludeListId: "mover",
    });
    expect(pos).toBe(GAP - GAP);
  });

  it("end intent appends at GAP into an empty board", async () => {
    const pos = await resolveListPositionIntent(client([]), { boardId: B, intent: "end" });
    expect(pos).toBe(GAP);
  });

  it("throws OrderConflictError(ANCHORS_STALE) when BOTH between anchors are archived/foreign — never a silent append", async () => {
    const lists: FakeList[] = [
      { id: "archived-1", boardId: B, position: GAP, archivedAt: new Date() },
      { id: "archived-2", boardId: B, position: GAP * 2, archivedAt: new Date() },
    ];
    const err = await resolveListPositionIntent(client(lists), {
      boardId: B,
      intent: "between",
      prevListId: "archived-1",
      nextListId: "archived-2",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrderConflictError);
    expect((err as OrderConflictError).reason).toBe("ANCHORS_STALE");
  });

  it("between intent skips archived middle/follower lists during bisection, making archived lists invisible to adjacency search", async () => {
    // Live list A at GAP, archived list M in middle at GAP*2, live list B at GAP*3
    const lists: FakeList[] = [
      { id: "a", boardId: B, position: GAP },
      { id: "m", boardId: B, position: GAP * 2, archivedAt: new Date() },
      { id: "b", boardId: B, position: GAP * 3 },
    ];

    // prevListId = "a": follower search must skip archived "m" and find live "b"
    const posPrev = await resolveListPositionIntent(client(lists), {
      boardId: B,
      intent: "between",
      prevListId: "a",
      excludeListId: "mover",
    });
    expect(posPrev).toBe((GAP + GAP * 3) / 2);

    // nextListId = "b": preceding search must skip archived "m" and find live "a"
    const posNext = await resolveListPositionIntent(client(lists), {
      boardId: B,
      intent: "between",
      nextListId: "b",
      excludeListId: "mover",
    });
    expect(posNext).toBe((GAP + GAP * 3) / 2);

    // Archived list at the end of the board: follower search must return null and append after A
    const listsEndArchived: FakeList[] = [
      { id: "a", boardId: B, position: GAP },
      { id: "m", boardId: B, position: GAP * 2, archivedAt: new Date() },
    ];
    const posEnd = await resolveListPositionIntent(client(listsEndArchived), {
      boardId: B,
      intent: "between",
      prevListId: "a",
      excludeListId: "mover",
    });
    expect(posEnd).toBe(GAP + GAP);
  });
});

describe("reorderListByNeighbors (decision 0032 lock + OCC protocol)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Fakes `$queryRaw` for the two FOR UPDATE lock helpers the reorder uses:
  // the board scope lock and the live-list lock (routed by SQL text).
  function rawLockMock(opts: { boardFound?: boolean; liveLists?: string[] }) {
    const { boardFound = true, liveLists = [] } = opts;
    return vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings[0] ?? "";
      const id = String(values[0] ?? "");
      if (sql.includes('FROM "board"')) {
        return boardFound ? [{ id }] : [];
      }
      if (sql.includes('FROM "list"')) {
        return liveLists.includes(id)
          ? [{ id, boardId: B, position: id === "m" ? GAP * 5 : GAP, moveRevision: 0 }]
          : [];
      }
      return [];
    });
  }

  function baseTx(overrides: Record<string, unknown> = {}) {
    return {
      list: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id === "m") {
            return { id: "m", boardId: B, position: GAP * 5, moveRevision: 0, archivedAt: null };
          }
          if (where.id === "keep") {
            return { id: "keep", boardId: B, position: GAP, moveRevision: 0, archivedAt: null };
          }
          return null;
        }),
        findFirst: makeListClient([
          { id: "keep", boardId: B, position: GAP },
          { id: "m", boardId: B, position: GAP * 5 },
        ]).list.findFirst,
        findMany: vi.fn(
          async (): Promise<Array<{ id: string; position: number }>> => [],
        ),
        update: vi.fn(async () => ({})),
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: vi.fn(async () => ({
          id: "m",
          boardId: B,
          title: "Mover",
          position: GAP * 2,
          moveRevision: 1,
          archivedAt: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })),
      },
      $queryRaw: rawLockMock({ liveLists: ["m"] }),
      ...overrides,
    };
  }

  it("end intent with a matching expectedMoveRevision appends and CAS-bumps the revision", async () => {
    const tx = baseTx();
    mockDb.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (cb: any) => cb(tx),
    );

    const result = await reorderListByNeighbors({
      listId: "m",
      workspaceId: "ws-1",
      intent: "end",
      prevListId: null,
      nextListId: null,
      expectedMoveRevision: 0,
    });

    // End intent: after the last live list excluding the mover → keep.position + GAP.
    expect(result.position).toBe(GAP + GAP);
    // Compare-and-set on the revision read under the lock, bumping it atomically.
    expect(tx.list.updateMany).toHaveBeenCalledWith({
      where: { id: "m", moveRevision: 0 },
      data: { position: GAP + GAP, moveRevision: 1 },
    });
  });

  it("rejects a stale expectedMoveRevision with OrderConflictError(MOVE_REVISION) and never writes", async () => {
    const tx = baseTx();
    tx.list.findUnique.mockResolvedValueOnce({
      id: "m",
      boardId: B,
      position: GAP * 5,
      moveRevision: 3, // client saw an older revision
      archivedAt: null,
    });
    tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings[0] ?? "";
      const id = String(values[0] ?? "");
      if (sql.includes('FROM "board"')) {
        return [{ id }];
      }
      if (sql.includes('FROM "list"')) {
        return [{ id, boardId: B, position: GAP * 5, moveRevision: 3 }];
      }
      return [];
    });
    mockDb.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (cb: any) => cb(tx),
    );

    await expect(
      reorderListByNeighbors({
        listId: "m",
        workspaceId: "ws-1",
        intent: "end",
        expectedMoveRevision: 2,
      }),
    ).rejects.toMatchObject({ reason: "MOVE_REVISION" });
    expect(tx.list.updateMany).not.toHaveBeenCalled();
    expect(tx.list.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("rebases a between intent on the surviving anchor instead of failing", async () => {
    const tx = baseTx();
    mockDb.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (cb: any) => cb(tx),
    );

    // prev hint is gone (foreign/stale), next hint "keep" survives → bisect
    // before keep against its current preceding card (none, excluding the mover).
    const result = await reorderListByNeighbors({
      listId: "m",
      workspaceId: "ws-1",
      intent: "between",
      prevListId: "gone",
      nextListId: "keep",
      expectedMoveRevision: 0,
    });

    // The CAS write carries the rebased position (keep.position - GAP).
    expect(tx.list.updateMany).toHaveBeenCalledWith({
      where: { id: "m", moveRevision: 0 },
      data: { position: GAP - GAP, moveRevision: 1 },
    });
    expect(result.position).toBeDefined();
  });

  it("renumbers IN THE SAME transaction on PositionSpaceExhaustedError (lock still held), then re-resolves", async () => {
    const tx = baseTx();
    const findManyCalls: Array<Record<string, unknown>> = [];
    tx.list.findMany = vi.fn(
      async ({ where }: { where: Record<string, unknown> }): Promise<
        Array<{ id: string; position: number }>
      > => {
        findManyCalls.push(where);
        return [
          { id: "m", position: GAP * 5 },
          { id: "keep", position: GAP },
        ];
      },
    );

    let resolveCalls = 0;
    const realClient = makeListClient([
      { id: "keep", boardId: B, position: GAP },
      { id: "m", boardId: B, position: GAP * 5 },
    ]).list;
    tx.list.findFirst = vi.fn(
      async (args: { where: Record<string, unknown>; orderBy?: unknown }) => {
        resolveCalls += 1;
        if (resolveCalls === 1) {
          // First resolve: neighbours too close to split.
          const { PositionSpaceExhaustedError } = await import("./ordering");
          throw new PositionSpaceExhaustedError();
        }
        return realClient.findFirst(args);
      },
    );

    mockDb.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (cb: any) => cb(tx),
    );

    const result = await reorderListByNeighbors({
      listId: "m",
      workspaceId: "ws-1",
      intent: "between",
      prevListId: "keep",
      expectedMoveRevision: 0,
    });

    expect(result.position).toBeDefined();
    // Normalization ran inside the SAME transaction (single $transaction call),
    // querying live lists with the archivedAt: null filter.
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(findManyCalls).toHaveLength(1);
    expect(findManyCalls[0]).toEqual({ boardId: B, archivedAt: null });
    expect(tx.list.update).toHaveBeenCalled(); // renumber writes
    const normalizationUpdates = (tx.list.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      normalizationUpdates.every((call) => {
        const args = call[0] as { data?: Record<string, unknown> } | undefined;
        if (!args?.data) {
          return false;
        }
        return Object.keys(args.data).every((key) => key === "position");
      }),
    ).toBe(true);
  });

  it("throws List not found when the board scope vanished under the lock", async () => {
    const tx = baseTx({ $queryRaw: rawLockMock({ boardFound: false, liveLists: ["m"] }) });
    mockDb.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (cb: any) => cb(tx),
    );

    await expect(
        reorderListByNeighbors({
          listId: "m",
          workspaceId: "ws-1",
          intent: "end",
          expectedMoveRevision: 0,
        }),
    ).rejects.toThrow("List not found");
    expect(tx.list.updateMany).not.toHaveBeenCalled();
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
    mockDb.list.findMany.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }): Promise<ReturnType<typeof row>[]> =>
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

  describe("restoreList (decision 0032 lock + revision protocol)", () => {
    function makeRawLockMock(opts: { boardFound?: boolean; archivedListFound?: boolean }) {
      const { boardFound = true, archivedListFound = true } = opts;
      return vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings[0] ?? "";
        const id = String(values[0] ?? "");
        if (sql.includes('FROM "board"')) {
          return boardFound ? [{ id }] : [];
        }
        if (sql.includes('FROM "list"')) {
          return archivedListFound
            ? [{ id, boardId: B, position: 16384 }]
            : [];
        }
        return [];
      });
    }

    function baseTx(overrides: Record<string, unknown> = {}) {
      const now = new Date();
      return {
        list: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: "l-1", boardId: B, position: 16384 })
            .mockResolvedValueOnce(null), // occupied → free
          updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValueOnce({
            id: "l-1",
            boardId: B,
            title: "List 1",
            position: 16384,
            moveRevision: 1,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        },
        $queryRaw: makeRawLockMock({}),
        ...overrides,
      };
    }

    it("preserves original position if free, under the board + archived-list locks, bumping the revision", async () => {
      const tx = baseTx();
      mockDb.$transaction.mockImplementationOnce(async (cb: (t: typeof tx) => unknown) => cb(tx));

      const res = await restoreList("l-1", "ws-1");
      expect(res.position).toBe(16384);
      expect(res.moveRevision).toBe(1);
      expect(tx.list.updateMany).toHaveBeenCalledWith({
        where: { id: "l-1", archivedAt: { not: null } },
        data: { archivedAt: null, position: 16384, moveRevision: { increment: 1 } },
      });
      // Workspace, board, and archived-list FOR UPDATE locks are acquired in
      // the global hierarchy.
      expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    });

    it("appends after last active list if original position is occupied", async () => {
      const tx = baseTx();
      tx.list.findFirst
        .mockReset()
        // 1. targetList lookup inside tx
        .mockResolvedValueOnce({ id: "l-1", boardId: B, position: 16384 })
        // 2. occupied lookup -> occupied by active list!
        .mockResolvedValueOnce({ id: "l-active-1" })
        // 3. lastActive lookup -> max position is 32768
        .mockResolvedValueOnce({ position: 32768 });
      tx.list.updateMany.mockReset().mockResolvedValueOnce({ count: 1 });
      tx.list.findUniqueOrThrow.mockReset().mockResolvedValueOnce({
        id: "l-1",
        boardId: B,
        title: "List 1",
        position: 32768 + GAP,
        moveRevision: 1,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockDb.$transaction.mockImplementationOnce(async (cb: (t: typeof tx) => unknown) => cb(tx));

      const res = await restoreList("l-1", "ws-1");
      expect(res.position).toBe(32768 + GAP);
      expect(tx.list.updateMany).toHaveBeenCalledWith({
        where: { id: "l-1", archivedAt: { not: null } },
        data: { archivedAt: null, position: 49152, moveRevision: { increment: 1 } },
      });
    });

    it("guards active/missing list inside transaction with LIST_NOT_FOUND error", async () => {
      const tx = {
        list: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
        $queryRaw: makeRawLockMock({}),
      };
      mockDb.$transaction.mockImplementationOnce(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await expect(restoreList("l-active", "ws-1")).rejects.toThrow("LIST_NOT_FOUND");
    });

    it("throws LIST_NOT_FOUND when a concurrent restore/purge beat us to the archived-list lock", async () => {
      const tx = baseTx({ $queryRaw: makeRawLockMock({ archivedListFound: false }) });
      mockDb.$transaction.mockImplementationOnce(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await expect(restoreList("l-1", "ws-1")).rejects.toThrow("LIST_NOT_FOUND");
      expect(tx.list.updateMany).not.toHaveBeenCalled();
    });

    it("throws LIST_NOT_FOUND when the board is archived/missing under the scope lock", async () => {
      const tx = baseTx({ $queryRaw: makeRawLockMock({ boardFound: false }) });
      mockDb.$transaction.mockImplementationOnce(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await expect(restoreList("l-1", "ws-1")).rejects.toThrow("LIST_NOT_FOUND");
      expect(tx.list.updateMany).not.toHaveBeenCalled();
    });

    it("throws LIST_NOT_FOUND when the updateMany CAS matches zero rows (concurrent restore won)", async () => {
      const tx = baseTx();
      tx.list.updateMany.mockReset().mockResolvedValueOnce({ count: 0 });
      mockDb.$transaction.mockImplementationOnce(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await expect(restoreList("l-1", "ws-1")).rejects.toThrow("LIST_NOT_FOUND");
      expect(tx.list.findUniqueOrThrow).not.toHaveBeenCalled();
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
