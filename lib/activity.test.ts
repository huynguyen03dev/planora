import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  activity: { findMany: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: mockDb, db: mockDb }));

import { ACTIVITY_PAGE_SIZE, getActivityByCardId } from "./activity";

const CARD_ID = "card-1";

function row(id: string, createdAt: Date) {
  return {
    id,
    workspaceId: "ws-1",
    boardId: "board-1",
    cardId: CARD_ID,
    userId: "u1",
    action: "CREATED",
    entityType: "CARD",
    metadata: null,
    createdAt,
    user: { id: "u1", name: "Alice", image: null },
  };
}

function rows(count: number, startMs = 0): ReturnType<typeof row>[] {
  return Array.from({ length: count }, (_, i) =>
    row(`a${i}`, new Date(1_700_000_000_000 + startMs + i * 1000)),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getActivityByCardId — backward compat (no options)", () => {
  it("returns ALL rows with the legacy query when called without options", async () => {
    const all = rows(3);
    mockDb.activity.findMany.mockResolvedValue(all);

    const result = await getActivityByCardId(CARD_ID);

    // Legacy contract: a bare array (not a page), unbounded, created-desc.
    expect(result).toEqual(all);
    expect(mockDb.activity.findMany).toHaveBeenCalledWith({
      where: { cardId: CARD_ID },
      orderBy: { createdAt: "desc" },
      select: expect.anything(),
    });
    const call = mockDb.activity.findMany.mock.calls[0][0];
    expect(call).not.toHaveProperty("take");
    expect(call).not.toHaveProperty("skip");
  });
});

describe("getActivityByCardId — pagination (options)", () => {
  it("caps at the default limit (50) and reports hasMore when a full extra row exists", async () => {
    mockDb.activity.findMany.mockResolvedValue(rows(ACTIVITY_PAGE_SIZE + 1));

    const page = await getActivityByCardId(CARD_ID, {});

    expect(page.hasMore).toBe(true);
    expect(page.items).toHaveLength(ACTIVITY_PAGE_SIZE);
    expect(page.items[0].id).toBe("a0");
    // limit + 1 is fetched so hasMore is exact without a count query.
    expect(mockDb.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cardId: CARD_ID },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: ACTIVITY_PAGE_SIZE + 1,
      }),
    );
  });

  it("reports hasMore false when the page is exactly full", async () => {
    mockDb.activity.findMany.mockResolvedValue(rows(ACTIVITY_PAGE_SIZE));

    const page = await getActivityByCardId(CARD_ID, {});

    expect(page.hasMore).toBe(false);
    expect(page.items).toHaveLength(ACTIVITY_PAGE_SIZE);
  });

  it("reports hasMore false and returns all rows when fewer than the limit exist", async () => {
    const few = rows(3);
    mockDb.activity.findMany.mockResolvedValue(few);

    const page = await getActivityByCardId(CARD_ID, { limit: 50 });

    expect(page.hasMore).toBe(false);
    expect(page.items).toEqual(few);
  });

  it("honours an explicit limit override", async () => {
    mockDb.activity.findMany.mockResolvedValue(rows(4));

    const page = await getActivityByCardId(CARD_ID, { limit: 3 });

    expect(page.hasMore).toBe(true);
    expect(page.items).toHaveLength(3);
    expect(mockDb.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 4 }),
    );
  });

  it("passes the before cursor through as a compound (createdAt, id) boundary", async () => {
    mockDb.activity.findMany.mockResolvedValue([row("a9", new Date(1_700_000_000_000))]);

    const cursor = { createdAt: new Date(1_700_001_000_000), id: "a5" };
    await getActivityByCardId(CARD_ID, { before: cursor, limit: 3 });

    expect(mockDb.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cardId: CARD_ID,
          AND: [
            {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("accepts an ISO-string cursor timestamp", async () => {
    mockDb.activity.findMany.mockResolvedValue([]);

    await getActivityByCardId(CARD_ID, {
      before: { createdAt: "2026-01-01T00:00:00.000Z", id: "a5" },
    });

    const where = mockDb.activity.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR[0]).toEqual({
      createdAt: { lt: "2026-01-01T00:00:00.000Z" },
    });
  });

  it("omits the cursor filter on the first page", async () => {
    mockDb.activity.findMany.mockResolvedValue(rows(1));

    await getActivityByCardId(CARD_ID, { limit: 50 });

    const call = mockDb.activity.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ cardId: CARD_ID });
  });
});
