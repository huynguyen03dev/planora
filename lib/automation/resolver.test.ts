import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  cardMember: { findMany: vi.fn() },
  card: { findUnique: vi.fn() },
  workspaceMember: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: mockDb, db: mockDb }));

import {
  CrossWorkspaceTargetError,
  resolveRecipient,
  resolveRemoveScope,
} from "./resolver";

// ── Helpers ──────────────────────────────────────────────────────────────────

const ctx = { cardId: "card-1", workspaceId: "ws-1" };

// ── Tests ────────────────────────────────────────────────────────────────────

describe("resolveRecipient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("card-assignees", () => {
    it("returns members who are current workspace members", async () => {
      mockDb.cardMember.findMany.mockResolvedValue([
        { userId: "user-1" },
        { userId: "user-2" },
      ]);
      // user-1 is a member, user-2 is a member
      mockDb.workspaceMember.findFirst
        .mockResolvedValueOnce({ id: "wm-1" })
        .mockResolvedValueOnce({ id: "wm-2" });

      const result = await resolveRecipient(
        mockDb as never,
        "card-assignees",
        ctx,
      );
      expect(result).toEqual(["user-1", "user-2"]);
    });

    it("drops non-members silently", async () => {
      mockDb.cardMember.findMany.mockResolvedValue([
        { userId: "user-1" },
        { userId: "user-2" },
      ]);
      // user-1 is a member, user-2 is NOT a member
      mockDb.workspaceMember.findFirst
        .mockResolvedValueOnce({ id: "wm-1" })
        .mockResolvedValueOnce(null);

      const result = await resolveRecipient(
        mockDb as never,
        "card-assignees",
        ctx,
      );
      expect(result).toEqual(["user-1"]);
    });

    it("returns empty when no card members exist", async () => {
      mockDb.cardMember.findMany.mockResolvedValue([]);

      const result = await resolveRecipient(
        mockDb as never,
        "card-assignees",
        ctx,
      );
      expect(result).toEqual([]);
    });
  });

  describe("card-creator", () => {
    it("returns the creator when they are a workspace member", async () => {
      mockDb.card.findUnique.mockResolvedValue({ createdById: "creator-1" });
      mockDb.workspaceMember.findFirst.mockResolvedValue({ id: "wm-1" });

      const result = await resolveRecipient(
        mockDb as never,
        "card-creator",
        ctx,
      );
      expect(result).toEqual(["creator-1"]);
    });

    it("returns [] when the creator is not a workspace member", async () => {
      mockDb.card.findUnique.mockResolvedValue({ createdById: "creator-1" });
      mockDb.workspaceMember.findFirst.mockResolvedValue(null);

      const result = await resolveRecipient(
        mockDb as never,
        "card-creator",
        ctx,
      );
      expect(result).toEqual([]);
    });

    it("returns [] when card has no createdById", async () => {
      mockDb.card.findUnique.mockResolvedValue({ createdById: null });

      const result = await resolveRecipient(
        mockDb as never,
        "card-creator",
        ctx,
      );
      expect(result).toEqual([]);
    });
  });

  describe("uuid literal", () => {
    it("returns [uuid] when user is a workspace member", async () => {
      mockDb.workspaceMember.findFirst.mockResolvedValue({ id: "wm-1" });

      const result = await resolveRecipient(
        mockDb as never,
        "550e8400-e29b-41d4-a716-446655440000",
        ctx,
      );
      expect(result).toEqual(["550e8400-e29b-41d4-a716-446655440000"]);
    });

    it("throws CrossWorkspaceTargetError when user is not a workspace member", async () => {
      mockDb.workspaceMember.findFirst.mockResolvedValue(null);

      await expect(
        resolveRecipient(
          mockDb as never,
          "550e8400-e29b-41d4-a716-446655440000",
          ctx,
        ),
      ).rejects.toThrow(CrossWorkspaceTargetError);
    });

    it("CrossWorkspaceTargetError has the correct name", async () => {
      mockDb.workspaceMember.findFirst.mockResolvedValue(null);

      try {
        await resolveRecipient(
          mockDb as never,
          "550e8400-e29b-41d4-a716-446655440000",
          ctx,
        );
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(CrossWorkspaceTargetError);
        expect((err as Error).name).toBe("CrossWorkspaceTargetError");
      }
    });
  });
});

describe("resolveRemoveScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("all", () => {
    it("returns all current card assignees", async () => {
      mockDb.cardMember.findMany.mockResolvedValue([
        { userId: "user-1" },
        { userId: "user-2" },
        { userId: "user-3" },
      ]);

      const result = await resolveRemoveScope(mockDb as never, "all", ctx);
      expect(result).toEqual(["user-1", "user-2", "user-3"]);
    });

    it("returns empty when no card members exist", async () => {
      mockDb.cardMember.findMany.mockResolvedValue([]);

      const result = await resolveRemoveScope(mockDb as never, "all", ctx);
      expect(result).toEqual([]);
    });
  });

  describe("uuid literal", () => {
    it("returns [uuid] without querying workspace membership", async () => {
      const result = await resolveRemoveScope(
        mockDb as never,
        "550e8400-e29b-41d4-a716-446655440000",
        ctx,
      );
      expect(result).toEqual(["550e8400-e29b-41d4-a716-446655440000"]);
      // No membership query should have been made.
      expect(mockDb.workspaceMember.findFirst).not.toHaveBeenCalled();
    });

    it("does not throw even if user is not a workspace member", async () => {
      // No membership check — should not throw regardless.
      const result = await resolveRemoveScope(
        mockDb as never,
        "nonexistent-uuid",
        ctx,
      );
      expect(result).toEqual(["nonexistent-uuid"]);
    });
  });
});
