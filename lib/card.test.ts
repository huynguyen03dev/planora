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

describe("reorderCardWithinListByNeighbors stale-neighbour recovery (US-062 mn2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops a stale prev hint and appends instead of failing the reorder", async () => {
    // The client's prev hint "gone" no longer names a live card in the list (a
    // rival moved/deleted it). The first attempt throws StaleNeighborError; the
    // loop drops the hint and retries, appending after the last live card.
    const cards: FakeCard[] = [
      { id: "keep", listId: L, position: GAP },
      { id: "m", listId: L, position: GAP * 5 },
    ];
    const clientFns = makeCardClient(cards);

    const tx = {
      card: {
        findUnique: clientFns.findUnique,
        findFirst: clientFns.findFirst,
        update: vi.fn(async ({ data }: { data: { position: number } }) => ({
          id: "m",
          listId: L,
          title: "Moved",
          description: null,
          position: data.position,
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
    };
    mockDb.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (cb: any) => cb(tx),
    );

    const result = await reorderCardWithinListByNeighbors({
      cardId: "m",
      prevCardId: "gone",
    });

    // Appended after the last live card excluding the mover → keep.position + GAP.
    expect(result.position).toBe(GAP + GAP);
    expect(tx.card.update).toHaveBeenCalledTimes(1);
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
