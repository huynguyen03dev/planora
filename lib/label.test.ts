import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  label: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  },
  cardLabel: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: mockDb,
  db: mockDb,
}));

import {
  addCardLabel,
  removeCardLabel,
  getCardLabels,
  getBoardLabels,
} from "./label";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("label data layer", () => {
  describe("getBoardLabels", () => {
    it("queries the board's labels ordered oldest-first", async () => {
      mockDb.label.findMany.mockResolvedValue([
        { id: "l1", boardId: "b1", name: "Bug", color: "#B04632" },
      ]);

      const result = await getBoardLabels("b1");

      expect(mockDb.label.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { boardId: "b1" },
          orderBy: { createdAt: "asc" },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("getCardLabels", () => {
    it("unwraps the join rows into label records", async () => {
      mockDb.cardLabel.findMany.mockResolvedValue([
        { label: { id: "l1", boardId: "b1", name: "Bug", color: "#B04632" } },
        { label: { id: "l2", boardId: "b1", name: "UX", color: "#89609E" } },
      ]);

      const result = await getCardLabels("c1");

      expect(result).toEqual([
        { id: "l1", boardId: "b1", name: "Bug", color: "#B04632" },
        { id: "l2", boardId: "b1", name: "UX", color: "#89609E" },
      ]);
    });
  });

  describe("addCardLabel", () => {
    it("is a no-op when the pair already exists", async () => {
      mockDb.cardLabel.findUnique.mockResolvedValue({ cardId: "c1" });

      const result = await addCardLabel("c1", "l1");

      expect(result).toEqual({ changed: false });
      expect(mockDb.cardLabel.create).not.toHaveBeenCalled();
    });

    it("creates the pair when it does not yet exist", async () => {
      mockDb.cardLabel.findUnique.mockResolvedValue(null);
      mockDb.cardLabel.create.mockResolvedValue({});

      const result = await addCardLabel("c1", "l1");

      expect(result).toEqual({ changed: true });
      expect(mockDb.cardLabel.create).toHaveBeenCalledWith({
        data: { cardId: "c1", labelId: "l1" },
      });
    });
  });

  describe("removeCardLabel", () => {
    it("reports changed=true when a row was deleted", async () => {
      mockDb.cardLabel.deleteMany.mockResolvedValue({ count: 1 });
      expect(await removeCardLabel("c1", "l1")).toEqual({ changed: true });
    });

    it("reports changed=false when nothing matched", async () => {
      mockDb.cardLabel.deleteMany.mockResolvedValue({ count: 0 });
      expect(await removeCardLabel("c1", "l1")).toEqual({ changed: false });
    });
  });
});
