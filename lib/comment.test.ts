import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  comment: { findMany: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: mockDb, db: mockDb }));

import { COMMENT_PAGE_SIZE, getCommentsByCardId } from "./comment";

const CARD_ID = "card-1";

function row(id: string, createdAt: Date) {
  return {
    id,
    cardId: CARD_ID,
    userId: "u1",
    content: `Comment ${id}`,
    createdAt,
    updatedAt: createdAt,
    user: { id: "u1", name: "Alice", image: null },
  };
}

function rows(count: number, startMs = 0): ReturnType<typeof row>[] {
  return Array.from({ length: count }, (_, i) =>
    row(`c${i}`, new Date(1_700_000_000_000 + startMs + i * 1000)),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCommentsByCardId — backward compat (no options)", () => {
  it("returns ALL rows with the legacy query when called without options", async () => {
    const all = rows(3);
    mockDb.comment.findMany.mockResolvedValue(all);

    const result = await getCommentsByCardId(CARD_ID);

    // Legacy contract: a bare array (not a page), unbounded, created-asc.
    expect(result).toEqual(all);
    expect(mockDb.comment.findMany).toHaveBeenCalledWith({
      where: { cardId: CARD_ID },
      orderBy: { createdAt: "asc" },
      select: expect.anything(),
    });
    const call = mockDb.comment.findMany.mock.calls[0][0];
    expect(call).not.toHaveProperty("take");
    expect(call).not.toHaveProperty("skip");
  });
});

describe("getCommentsByCardId — pagination (options)", () => {
  it("caps at the default limit (50) and reports hasMore when a full extra row exists", async () => {
    mockDb.comment.findMany.mockResolvedValue(rows(COMMENT_PAGE_SIZE + 1));

    const page = await getCommentsByCardId(CARD_ID, {});

    expect(page.hasMore).toBe(true);
    expect(page.items).toHaveLength(COMMENT_PAGE_SIZE);
    expect(page.items[0].id).toBe("c0");
    // limit + 1 is fetched so hasMore is exact without a count query.
    expect(mockDb.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cardId: CARD_ID },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: COMMENT_PAGE_SIZE + 1,
      }),
    );
  });

  it("reports hasMore false when the page is exactly full", async () => {
    mockDb.comment.findMany.mockResolvedValue(rows(COMMENT_PAGE_SIZE));

    const page = await getCommentsByCardId(CARD_ID, {});

    expect(page.hasMore).toBe(false);
    expect(page.items).toHaveLength(COMMENT_PAGE_SIZE);
  });

  it("reports hasMore false and returns all rows when fewer than the limit exist", async () => {
    const few = rows(3);
    mockDb.comment.findMany.mockResolvedValue(few);

    const page = await getCommentsByCardId(CARD_ID, { limit: 50 });

    expect(page.hasMore).toBe(false);
    expect(page.items).toEqual(few);
  });

  it("honours an explicit limit override", async () => {
    mockDb.comment.findMany.mockResolvedValue(rows(4));

    const page = await getCommentsByCardId(CARD_ID, { limit: 3 });

    expect(page.hasMore).toBe(true);
    expect(page.items).toHaveLength(3);
    expect(mockDb.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 4 }),
    );
  });

  it("passes the after cursor through as a compound (createdAt, id) boundary", async () => {
    mockDb.comment.findMany.mockResolvedValue([row("c9", new Date(1_700_000_000_000))]);

    const cursor = { createdAt: new Date(1_700_001_000_000), id: "c5" };
    await getCommentsByCardId(CARD_ID, { after: cursor, limit: 3 });

    expect(mockDb.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cardId: CARD_ID,
          AND: [
            {
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    );
  });

  it("accepts an ISO-string cursor timestamp", async () => {
    mockDb.comment.findMany.mockResolvedValue([]);

    await getCommentsByCardId(CARD_ID, {
      after: { createdAt: "2026-01-01T00:00:00.000Z", id: "c5" },
    });

    const where = mockDb.comment.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR[0]).toEqual({
      createdAt: { gt: "2026-01-01T00:00:00.000Z" },
    });
  });

  it("omits the cursor filter on the first page", async () => {
    mockDb.comment.findMany.mockResolvedValue(rows(1));

    await getCommentsByCardId(CARD_ID, { limit: 50 });

    const call = mockDb.comment.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ cardId: CARD_ID });
  });
});
