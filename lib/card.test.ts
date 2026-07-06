import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  $transaction: vi.fn(),
  card: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: mockDb,
  db: mockDb,
}));

import {
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
