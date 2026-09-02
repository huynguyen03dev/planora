import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  $transaction: vi.fn(),
  card: {
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

import {
  getArchivedCards,
  getCardWithListAndBoard,
  getCardWithListAndMembers,
  getArchivedCardWithListAndBoard,
  lockCardOrderingScopeForUpdate,
  moveCardInTransaction,
  reorderCardWithinListByNeighbors,
  resolveCompletedAt,
  setCardCompletion,
} from "./card";

const GAP = 16384;
const L = "list-1";

type FakeCard = { id: string; listId: string; position: number };

/** Same in-memory card client shape as ordering.test.ts's harness. */
function makeCardClient(cards: FakeCard[]) {
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
    findUnique: async ({ where }: { where: Record<string, unknown> }) =>
      cards.find((c) => matches(c, where)) ?? null,
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: Record<string, unknown>;
      orderBy?: unknown;
    }) => order(cards.filter((c) => matches(c, where)), orderBy)[0] ?? null,
  };
}

describe("reorderCardWithinListByNeighbors (decision 0032 lock + OCC protocol)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Fakes `$queryRaw` for the workspace, board, live-list, and moved-card
  // FOR UPDATE locks (routed by SQL text).
  function rawLockMock(opts: { liveLists?: string[]; card?: boolean }) {
    const { liveLists = [], card = true } = opts;
    return vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings[0] ?? "";
      const id = String(values[0] ?? "");
      if (sql.includes('FROM "list"')) {
        return liveLists.includes(id)
          ? [{ id, boardId: "b-1", position: GAP, moveRevision: 0 }]
          : [];
      }
      if (sql.includes('FROM "board"')) {
        return [{ id }];
      }
      if (sql.includes('FROM "card"')) {
        return card ? [{ id, listId: L, position: GAP * 5, moveRevision: 0 }] : [];
      }
      return [];
    });
  }

  function baseTx(overrides: Record<string, unknown> = {}) {
    return {
      card: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id === "m") {
            return {
              id: "m",
              listId: L,
              moveRevision: 0,
              list: {
                id: L,
                boardId: "b-1",
                archivedAt: null,
                board: { id: "b-1", workspaceId: "ws-1", archivedAt: null },
              },
            };
          }
          if (where.id === "keep") {
            return { id: "keep", listId: L, position: GAP };
          }
          return null;
        }),
        findFirst: makeCardClient([
          { id: "keep", listId: L, position: GAP },
          { id: "m", listId: L, position: GAP * 5 },
        ]).findFirst,
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: vi.fn(async () => ({
          id: "m",
          listId: L,
          title: "Moved",
          description: null,
          position: GAP * 2,
          moveRevision: 1,
          priority: null,
          dueDate: null,
          estimateHours: null,
          completedAt: null,
          deletedAt: null,
          coverImage: null,
          archivedAt: null,
          createdById: "u",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })),
      },
      list: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === L
            ? {
                id: L,
                boardId: "b-1",
                archivedAt: null,
                board: { id: "b-1", workspaceId: "ws-1", archivedAt: null },
              }
            : null,
        ),
      },
      $queryRaw: rawLockMock({ liveLists: [L] }),
      ...overrides,
    };
  }

  it("end intent with a matching expectedMoveRevision appends and CAS-bumps the revision", async () => {
    const tx = baseTx();
    mockDb.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (cb: any) => cb(tx),
    );

      const result = await reorderCardWithinListByNeighbors({
        cardId: "m",
        workspaceId: "ws-1",
        intent: "end",
      prevCardId: null,
      nextCardId: null,
      expectedMoveRevision: 0,
    });

    // End intent: after the last live card excluding the mover → keep.position + GAP.
    expect(result.position).toBe(GAP + GAP);
    expect(result.moveRevision).toBe(1);
    // Compare-and-set on the revision read under the lock, bumping it atomically.
    expect(tx.card.updateMany).toHaveBeenCalledWith({
      where: { id: "m", archivedAt: null, deletedAt: null, moveRevision: 0 },
      data: { listId: L, position: GAP + GAP, moveRevision: 1 },
    });
  });

  it("rejects a stale expectedMoveRevision with OrderConflictError(MOVE_REVISION) and never writes", async () => {
    const tx = baseTx();
      tx.card.findUnique.mockResolvedValueOnce({
        id: "m",
        listId: L,
        moveRevision: 3,
        list: {
          id: L,
          boardId: "b-1",
          archivedAt: null,
          board: { id: "b-1", workspaceId: "ws-1", archivedAt: null },
        },
      });
      tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings[0] ?? "";
        const id = String(values[0] ?? "");
        if (sql.includes('FROM "board"')) {
          return [{ id }];
        }
        if (sql.includes('FROM "list"')) {
        return [{ id, boardId: "b-1", position: GAP, moveRevision: 0 }];
      }
      if (sql.includes('FROM "card"')) {
        return [{ id, listId: L, position: GAP * 5, moveRevision: 3 }];
      }
      return [];
    });
    mockDb.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (cb: any) => cb(tx),
    );

    await expect(
      reorderCardWithinListByNeighbors({
        cardId: "m",
        workspaceId: "ws-1",
        intent: "end",
        expectedMoveRevision: 2,
      }),
    ).rejects.toMatchObject({ reason: "MOVE_REVISION" });
    expect(tx.card.updateMany).not.toHaveBeenCalled();
    expect(tx.card.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("rebases a between intent on the surviving anchor instead of failing", async () => {
    const tx = baseTx();
    mockDb.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (cb: any) => cb(tx),
    );

    // prev hint is gone (foreign/stale), next hint "keep" survives → bisect
    // before keep against its current preceding card (none, excluding the mover).
    const result = await reorderCardWithinListByNeighbors({
      cardId: "m",
      workspaceId: "ws-1",
      intent: "between",
      prevCardId: "gone",
      nextCardId: "keep",
      expectedMoveRevision: 0,
    });

    // The CAS write carries the rebased position (keep.position - GAP).
    expect(tx.card.updateMany).toHaveBeenCalledWith({
      where: { id: "m", archivedAt: null, deletedAt: null, moveRevision: 0 },
      data: { listId: L, position: GAP - GAP, moveRevision: 1 },
    });
    expect(result.position).toBeDefined();
  });

  it("throws Card not found when the moved card is missing/archived under the lock", async () => {
    const tx = baseTx({
      $queryRaw: rawLockMock({ liveLists: [L], card: false }),
    });
    mockDb.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (cb: any) => cb(tx),
    );

    await expect(
      reorderCardWithinListByNeighbors({
        cardId: "m",
        workspaceId: "ws-1",
        intent: "end",
        expectedMoveRevision: 0,
      }),
    ).rejects.toThrow("Card not found");
      expect(tx.card.updateMany).not.toHaveBeenCalled();
  });

  describe("moveCardInTransaction (same-board invariant + single board lock)", () => {
    /** Extract the board-row lock calls (SQL text + bound id) from a fake tx. */
    function boardLockCalls(tx: ReturnType<typeof baseTx>) {
      const raw = tx.$queryRaw as unknown as ReturnType<typeof vi.fn>;
      return raw.mock.calls
        .map((call: unknown[]) => {
          const strings = call[0] as TemplateStringsArray;
          return { sql: strings?.[0] ?? "", id: String(call[1] ?? "") };
        })
        .filter((c: { sql: string }) => c.sql.includes('FROM "board"'));
    }

    it("same-board cross-list move succeeds and locks the single shared board row", async () => {
      const tx = baseTx({
        list: {
          findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
            where.id === "list-2"
              ? {
                  id: "list-2",
                  boardId: "b-1",
                  archivedAt: null,
                  board: { id: "b-1", workspaceId: "ws-1", archivedAt: null },
                }
              : null,
          ),
        },
        $queryRaw: rawLockMock({ liveLists: [L, "list-2"] }),
      });
      mockDb.$transaction.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (cb: any) => cb(tx),
      );

      const result = await moveCardInTransaction(
        tx as unknown as Parameters<typeof moveCardInTransaction>[0],
        {
          workspaceId: "ws-1",
          cardId: "m",
          targetListId: "list-2",
          intent: "end",
        },
      );

      expect(result.fromListId).toBe(L);
      expect(result.fromBoardId).toBe("b-1");
      expect(result.targetBoardId).toBe("b-1");
      // Source board === target board → ONE board lock for the single shared id
      // (never an array of two identical ids), covering the whole move scope.
      const boardLocks = boardLockCalls(tx);
      expect(boardLocks).toHaveLength(1);
      expect(boardLocks[0].id).toBe("b-1");
      expect(tx.card.updateMany).toHaveBeenCalledWith({
        where: { id: "m", archivedAt: null, deletedAt: null, moveRevision: 0 },
        data: { listId: "list-2", position: GAP, moveRevision: 1 },
      });
    });

    it("cross-board target (forged request): rejects with OrderConflictError(SCOPE_STALE) before any lock or write", async () => {
      const tx = baseTx({
        list: {
          findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
            where.id === "list-2"
              ? {
                  id: "list-2",
                  boardId: "b-2",
                  archivedAt: null,
                  board: { id: "b-2", workspaceId: "ws-1", archivedAt: null },
                }
              : null,
          ),
        },
        $queryRaw: rawLockMock({ liveLists: [L, "list-2"] }),
      });
      mockDb.$transaction.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (cb: any) => cb(tx),
      );

      await expect(
        moveCardInTransaction(
          tx as unknown as Parameters<typeof moveCardInTransaction>[0],
          {
            workspaceId: "ws-1",
            cardId: "m",
            targetListId: "list-2",
            intent: "end",
          },
        ),
      ).rejects.toMatchObject({ reason: "SCOPE_STALE" });
      expect(tx.card.updateMany).not.toHaveBeenCalled();
      expect(tx.card.findUniqueOrThrow).not.toHaveBeenCalled();
      // Rejected on the pre-lock equality predicate → no row lock was taken.
      expect(boardLockCalls(tx)).toHaveLength(0);
    });
  });
});

describe("lockCardOrderingScopeForUpdate (completion + automation lock order)", () => {
  it("locks workspace, parent board/list, then card", async () => {
    const events: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings[0] ?? "";
        const id = String(values[0] ?? "");
        if (sql.includes('FROM "workspace"')) {
          events.push("workspace");
          return [{ id }];
        }
        if (sql.includes('FROM "board"')) {
          events.push("board");
          return [{ id }];
        }
        if (sql.includes('FROM "list"')) {
          events.push("list");
          return [{ id, boardId: "board-1", position: GAP, moveRevision: 0 }];
        }
        if (sql.includes('FROM "card"')) {
          events.push("card");
          return [{ id, listId: L, position: GAP, moveRevision: 0 }];
        }
        return [];
      }),
      card: {
        findUnique: vi.fn(async () => {
          events.push("parent-read");
          return {
            id: "card-1",
            listId: L,
            list: {
              id: L,
              boardId: "board-1",
              archivedAt: null,
              board: { workspaceId: "ws-1", archivedAt: null },
            },
          };
        }),
      },
    } as unknown as Parameters<typeof lockCardOrderingScopeForUpdate>[0];

    await expect(
      lockCardOrderingScopeForUpdate(tx, "ws-1", "card-1"),
    ).resolves.toEqual({ boardId: "board-1", listId: L });

    // The parent lookup is non-locking; every actual row lock follows the
    // workspace → board → list → card hierarchy used by moveCardInTransaction.
    expect(events).toEqual(["workspace", "parent-read", "board", "list", "card"]);
  });
});

describe("resolveCompletedAt (card-owned completion semantics — US-045)", () => {
  const NOW = new Date("2026-07-03T12:00:00.000Z");
  const EARLIER = new Date("2026-06-01T00:00:00.000Z");

  it("complete from incomplete → a fresh timestamp", () => {
    expect(resolveCompletedAt(true, null, NOW)).toEqual(NOW);
  });

  it("reopen → null", () => {
    expect(resolveCompletedAt(false, EARLIER, NOW)).toBeNull();
  });

  it("re-complete an already-complete card → preserves the existing timestamp (streak-stable)", () => {
    // A no-op re-complete must not slide the anchor forward (US-064 relies on it).
    expect(resolveCompletedAt(true, EARLIER, NOW)).toEqual(EARLIER);
  });

  it("complete after a reopen → a fresh timestamp (reopen already cleared it)", () => {
    // The reopen set completedAt to null, so the next complete starts a new streak.
    expect(resolveCompletedAt(true, null, NOW)).toEqual(NOW);
  });
});

describe("setCardCompletion (US-045)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes only a still-incomplete card (compare-and-set) and reports the transition", async () => {
    const NOW = new Date("2026-07-03T12:00:00.000Z");
    const row = { id: "card-1", completedAt: NOW };
    const client = {
      card: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: vi.fn(async () => row),
      },
    } as unknown as Parameters<typeof setCardCompletion>[0];

    const result = await setCardCompletion(client, "card-1", true, null, NOW);

    const call = (client.card.updateMany as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // The WHERE gates on the pre-toggle state, so a concurrent completer matches
    // zero rows instead of double-writing.
    expect(call.where).toEqual({ id: "card-1", archivedAt: null, completedAt: null });
    expect(call.data).toEqual({ completedAt: NOW });
    expect(result.transitioned).toBe(true);
    expect(result.card).toBe(row);
  });

  it("clears completedAt on reopen, scoped to a currently-complete card", async () => {
    const client = {
      card: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: vi.fn(async () => ({ id: "card-1", completedAt: null })),
      },
    } as unknown as Parameters<typeof setCardCompletion>[0];

    const result = await setCardCompletion(
      client,
      "card-1",
      false,
      new Date("2026-06-01T00:00:00.000Z"),
    );

    const call = (client.card.updateMany as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toEqual({ id: "card-1", archivedAt: null, completedAt: { not: null } });
    expect(call.data).toEqual({ completedAt: null });
    expect(result.transitioned).toBe(true);
  });

  it("re-completing an already-complete card is a no-op: no transition, timestamp preserved", async () => {
    const EARLIER = new Date("2026-06-01T00:00:00.000Z");
    const row = { id: "card-1", completedAt: EARLIER };
    const client = {
      card: {
        // The compare-and-set matched no row (already complete).
        updateMany: vi.fn(async () => ({ count: 0 })),
        findUniqueOrThrow: vi.fn(async () => row),
      },
    } as unknown as Parameters<typeof setCardCompletion>[0];

    const result = await setCardCompletion(
      client,
      "card-1",
      true,
      EARLIER,
      new Date("2026-07-03T12:00:00.000Z"),
    );

    expect(result.transitioned).toBe(false);
    expect(result.card.completedAt).toBe(EARLIER);
  });
});

describe("getArchivedCards parent list filter (US-074 Slice B)", () => {
  it("filters out cards whose parent list is archived", async () => {
    const now = new Date();
    mockDb.card.findMany.mockResolvedValueOnce([
      {
        id: "c-1",
        title: "Card 1",
        listId: "l-1",
        archivedAt: now,
        list: { title: "List 1" },
      },
    ]);

    const res = await getArchivedCards("b-1");

    expect(mockDb.card.findMany).toHaveBeenCalledWith({
      where: {
        archivedAt: { not: null },
        list: {
          boardId: "b-1",
          archivedAt: null,
          board: { archivedAt: null },
        },
      },
      orderBy: { archivedAt: "desc" },
      select: {
        id: true,
        title: true,
        listId: true,
        archivedAt: true,
        list: {
          select: { title: true },
        },
      },
    });

    expect(res).toEqual([
      {
        id: "c-1",
        title: "Card 1",
        listId: "l-1",
        listTitle: "List 1",
        archivedAt: now,
      },
    ]);
  });
});

describe("US-074 Slice B2 — resolver-level parent-list archive hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCardWithListAndBoard", () => {
    it("queries with archivedAt:null and returns row when parent list is active", async () => {
      const now = new Date();
      mockDb.card.findUnique.mockResolvedValueOnce({
        id: "c-1",
        listId: "l-1",
        title: "Card",
        description: null,
        position: 16384,
        priority: null,
        dueDate: null,
        estimateHours: null,
        completedAt: null,
        deletedAt: null,
        coverImage: null,
        archivedAt: null,
        createdById: "u-1",
        createdAt: now,
        updatedAt: now,
        list: {
          id: "l-1",
          boardId: "b-1",
          archivedAt: null,
          board: { id: "b-1", workspaceId: "ws-1", archivedAt: null },
        },
      });

      const res = await getCardWithListAndBoard("c-1");
      expect(res).not.toBeNull();
      expect(res!.card.id).toBe("c-1");
      expect(mockDb.card.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "c-1", archivedAt: null },
        }),
      );
    });

    it("returns null when parent list is archived (archivedAt !== null)", async () => {
      mockDb.card.findUnique.mockResolvedValueOnce({
        id: "c-1",
        listId: "l-1",
        title: "Card",
        description: null,
        position: 16384,
        priority: null,
        dueDate: null,
        estimateHours: null,
        completedAt: null,
        deletedAt: null,
        coverImage: null,
        archivedAt: null,
        createdById: "u-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        list: {
          id: "l-1",
          boardId: "b-1",
          archivedAt: new Date(), // parent list IS archived
          board: { id: "b-1", workspaceId: "ws-1", archivedAt: null },
        },
      });

      const res = await getCardWithListAndBoard("c-1");
      expect(res).toBeNull();
    });

    it("returns null when card is not found", async () => {
      mockDb.card.findUnique.mockResolvedValueOnce(null);
      const res = await getCardWithListAndBoard("c-missing");
      expect(res).toBeNull();
    });
  });

  describe("getCardWithListAndMembers", () => {
    it("queries with archivedAt:null and returns row with memberIds when parent list is active", async () => {
      const now = new Date();
      mockDb.card.findUnique.mockResolvedValueOnce({
        id: "c-1",
        listId: "l-1",
        title: "Card",
        description: null,
        position: 16384,
        priority: null,
        dueDate: null,
        estimateHours: null,
        completedAt: null,
        deletedAt: null,
        coverImage: null,
        archivedAt: null,
        createdById: "u-1",
        createdAt: now,
        updatedAt: now,
        list: {
          id: "l-1",
          boardId: "b-1",
          archivedAt: null,
          board: { id: "b-1", workspaceId: "ws-1" },
        },
        members: [{ userId: "m-1" }, { userId: "m-2" }],
      });

      const res = await getCardWithListAndMembers("c-1");
      expect(res).not.toBeNull();
      expect(res!.card.id).toBe("c-1");
      expect(res!.memberIds).toEqual(["m-1", "m-2"]);
      expect(mockDb.card.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "c-1", archivedAt: null },
        }),
      );
    });

    it("returns null when parent list is archived", async () => {
      mockDb.card.findUnique.mockResolvedValueOnce({
        id: "c-1",
        listId: "l-1",
        title: "Card",
        description: null,
        position: 16384,
        priority: null,
        dueDate: null,
        estimateHours: null,
        completedAt: null,
        deletedAt: null,
        coverImage: null,
        archivedAt: null,
        createdById: "u-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        list: {
          id: "l-1",
          boardId: "b-1",
          archivedAt: new Date(), // parent list IS archived
          board: { id: "b-1", workspaceId: "ws-1" },
        },
        members: [],
      });

      const res = await getCardWithListAndMembers("c-1");
      expect(res).toBeNull();
    });

    it("returns null when card is not found", async () => {
      mockDb.card.findUnique.mockResolvedValueOnce(null);
      const res = await getCardWithListAndMembers("c-missing");
      expect(res).toBeNull();
    });
  });

  describe("getArchivedCardWithListAndBoard", () => {
    it("flags parentListArchived when the parent list is archived (W8 discrimination)", async () => {
      mockDb.card.findFirst.mockResolvedValueOnce({
        id: "c-1",
        listId: "l-1",
        title: "Card",
        description: null,
        position: 16384,
        priority: null,
        dueDate: null,
        estimateHours: null,
        completedAt: null,
        deletedAt: null,
        coverImage: null,
        archivedAt: new Date(), // card IS archived
        createdById: "u-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        list: {
          id: "l-1",
          boardId: "b-1",
          archivedAt: new Date(), // parent list IS archived
          board: { id: "b-1", workspaceId: "ws-1", archivedAt: null },
        },
      });

      const res = await getArchivedCardWithListAndBoard("c-1");
      // Not null: the record (with its workspace/board scope) is needed to run
      // the permission gate before the dedicated message can be surfaced.
      expect(res).not.toBeNull();
      expect(res!.parentListArchived).toBe(true);
      expect(res!.card.id).toBe("c-1");
      expect(res!.board.workspaceId).toBe("ws-1");
    });

    it("returns row with parentListArchived false when card is archived but parent list is active", async () => {
      const now = new Date();
      mockDb.card.findFirst.mockResolvedValueOnce({
        id: "c-1",
        listId: "l-1",
        title: "Card",
        description: null,
        position: 16384,
        priority: null,
        dueDate: null,
        estimateHours: null,
        completedAt: null,
        deletedAt: null,
        coverImage: null,
        archivedAt: now, // card IS archived
        createdById: "u-1",
        createdAt: now,
        updatedAt: now,
        list: {
          id: "l-1",
          boardId: "b-1",
          archivedAt: null, // parent list is ACTIVE
          board: { id: "b-1", workspaceId: "ws-1", archivedAt: null },
        },
      });

      const res = await getArchivedCardWithListAndBoard("c-1");
      expect(res).not.toBeNull();
      expect(res!.card.id).toBe("c-1");
      expect(res!.parentListArchived).toBe(false);
      expect(mockDb.card.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "c-1", archivedAt: { not: null } },
        }),
      );
    });

    it("returns null when card is not found", async () => {
      mockDb.card.findFirst.mockResolvedValueOnce(null);
      const res = await getArchivedCardWithListAndBoard("c-missing");
      expect(res).toBeNull();
    });
  });
});
