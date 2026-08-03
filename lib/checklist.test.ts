/**
 * Resolver-level tests for checklist scope queries.
 *
 * Tests the real production functions (getChecklistWithCard,
 * getChecklistItemWithCard) with mocked DB rows, asserting correct query
 * shape and listArchived mapping (US-074 Slice B2).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  checklist: {
    findUnique: vi.fn(),
  },
  checklistItem: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: mockDb,
  db: mockDb,
}));

import { getChecklistWithCard, getChecklistItemWithCard } from "./checklist";

const NOW = new Date("2026-06-01T12:00:00Z");

function makeChecklistRow(overrides: {
  listArchived?: boolean;
  boardArchived?: boolean;
  cardArchived?: boolean;
} = {}) {
  const { listArchived = false, boardArchived = false, cardArchived = false } = overrides;
  return {
    id: "cl-1",
    cardId: "c-1",
    card: {
      archivedAt: cardArchived ? NOW : null,
      list: {
        archivedAt: listArchived ? NOW : null,
        boardId: "b-1",
        board: {
          id: "b-1",
          workspaceId: "ws-1",
          archivedAt: boardArchived ? NOW : null,
        },
      },
    },
  };
}

describe("getChecklistWithCard (US-074 Slice B2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries checklist by id with card scope select and returns scope when all active", async () => {
    mockDb.checklist.findUnique.mockResolvedValueOnce(makeChecklistRow());

    const res = await getChecklistWithCard("cl-1");
    expect(res).not.toBeNull();
    expect(res!.id).toBe("cl-1");
    expect(res!.cardId).toBe("c-1");
    expect(res!.boardId).toBe("b-1");
    expect(res!.cardArchived).toBe(false);
    expect(res!.listArchived).toBe(false);
    expect(res!.board.archivedAt).toBeNull();
    expect(mockDb.checklist.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cl-1" } }),
    );
  });

  it("maps parent list archivedAt to listArchived: true", async () => {
    mockDb.checklist.findUnique.mockResolvedValueOnce(
      makeChecklistRow({ listArchived: true }),
    );

    const res = await getChecklistWithCard("cl-1");
    expect(res).not.toBeNull();
    expect(res!.listArchived).toBe(true);
    expect(res!.cardArchived).toBe(false);
  });

  it("maps card archivedAt to cardArchived: true", async () => {
    mockDb.checklist.findUnique.mockResolvedValueOnce(
      makeChecklistRow({ cardArchived: true }),
    );

    const res = await getChecklistWithCard("cl-1");
    expect(res).not.toBeNull();
    expect(res!.cardArchived).toBe(true);
    expect(res!.listArchived).toBe(false);
  });

  it("returns null when checklist is not found", async () => {
    mockDb.checklist.findUnique.mockResolvedValueOnce(null);
    const res = await getChecklistWithCard("cl-missing");
    expect(res).toBeNull();
  });
});

describe("getChecklistItemWithCard (US-074 Slice B2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns scope with listArchived: true when parent list is archived", async () => {
    mockDb.checklistItem.findUnique.mockResolvedValueOnce({
      id: "item-1",
      checklistId: "cl-1",
      checklist: {
        id: "cl-1",
        cardId: "c-1",
        card: {
          archivedAt: null,
          list: {
            archivedAt: NOW, // parent list archived
            boardId: "b-1",
            board: { id: "b-1", workspaceId: "ws-1", archivedAt: null },
          },
        },
      },
    });

    const res = await getChecklistItemWithCard("item-1");
    expect(res).not.toBeNull();
    expect(res!.listArchived).toBe(true);
    expect(res!.cardArchived).toBe(false);
    expect(res!.itemId).toBe("item-1");
    expect(res!.checklistId).toBe("cl-1");
  });

  it("returns scope with listArchived: false when all active", async () => {
    mockDb.checklistItem.findUnique.mockResolvedValueOnce({
      id: "item-1",
      checklistId: "cl-1",
      checklist: {
        id: "cl-1",
        cardId: "c-1",
        card: {
          archivedAt: null,
          list: {
            archivedAt: null,
            boardId: "b-1",
            board: { id: "b-1", workspaceId: "ws-1", archivedAt: null },
          },
        },
      },
    });

    const res = await getChecklistItemWithCard("item-1");
    expect(res).not.toBeNull();
    expect(res!.listArchived).toBe(false);
    expect(res!.cardArchived).toBe(false);
  });

  it("returns null when item is not found", async () => {
    mockDb.checklistItem.findUnique.mockResolvedValueOnce(null);
    const res = await getChecklistItemWithCard("item-missing");
    expect(res).toBeNull();
  });
});
