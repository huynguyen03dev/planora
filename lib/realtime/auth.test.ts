/**
 * US-062 tg1 — unit tests for the socket room-authorization boundary.
 *
 * lib/realtime/auth.ts decides who may join a board's live stream and resolve a
 * workspace room. A regression here leaks a workspace's real-time board updates
 * to non-members, so these functions are the realtime analogue of the Server
 * Action RBAC matrix and were previously untested (referenced only by server.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    board: { findUnique: vi.fn() },
    workspaceMember: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: mocks.db, db: mocks.db }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));

import {
  authenticateSocket,
  canUserJoinWorkspace,
  getBoardMembershipRole,
  getUserProfile,
} from "./auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getBoardMembershipRole", () => {
  it("denies (null) when the board does not exist", async () => {
    mocks.db.board.findUnique.mockResolvedValue(null);
    expect(await getBoardMembershipRole("u1", "board-x")).toBeNull();
    expect(mocks.db.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it("denies (null) when the board is archived", async () => {
    mocks.db.board.findUnique.mockResolvedValue({
      workspaceId: "ws1",
      archivedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(await getBoardMembershipRole("u1", "board-1")).toBeNull();
    expect(mocks.db.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it("denies (null) when the user is not a member of the board's workspace", async () => {
    mocks.db.board.findUnique.mockResolvedValue({ workspaceId: "ws1", archivedAt: null });
    mocks.db.workspaceMember.findFirst.mockResolvedValue(null);
    expect(await getBoardMembershipRole("outsider", "board-1")).toBeNull();
  });

  it("scopes the membership lookup to the board's workspace and the given user", async () => {
    mocks.db.board.findUnique.mockResolvedValue({ workspaceId: "ws1", archivedAt: null });
    mocks.db.workspaceMember.findFirst.mockResolvedValue({ role: "admin" });
    await getBoardMembershipRole("u1", "board-1");
    expect(mocks.db.workspaceMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", workspace: { id: "ws1" } },
      }),
    );
  });

  it.each(["admin", "editor", "viewer"] as const)(
    "returns the member's role verbatim for a known role (%s)",
    async (role) => {
      mocks.db.board.findUnique.mockResolvedValue({ workspaceId: "ws1", archivedAt: null });
      mocks.db.workspaceMember.findFirst.mockResolvedValue({ role });
      expect(await getBoardMembershipRole("u1", "board-1")).toBe(role);
    },
  );

  it("normalizes an unknown role down to viewer (least privilege)", async () => {
    mocks.db.board.findUnique.mockResolvedValue({ workspaceId: "ws1", archivedAt: null });
    mocks.db.workspaceMember.findFirst.mockResolvedValue({ role: "owner" });
    expect(await getBoardMembershipRole("u1", "board-1")).toBe("viewer");
  });

  it("fails closed (null) when the query throws", async () => {
    mocks.db.board.findUnique.mockRejectedValue(new Error("db down"));
    expect(await getBoardMembershipRole("u1", "board-1")).toBeNull();
  });
});

describe("canUserJoinWorkspace", () => {
  it("allows a member", async () => {
    mocks.db.workspaceMember.findFirst.mockResolvedValue({ id: "m1" });
    expect(await canUserJoinWorkspace("u1", "ws1")).toBe(true);
    expect(mocks.db.workspaceMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", organizationId: "ws1" } }),
    );
  });

  it("denies a non-member", async () => {
    mocks.db.workspaceMember.findFirst.mockResolvedValue(null);
    expect(await canUserJoinWorkspace("outsider", "ws1")).toBe(false);
  });

  it("fails closed (false) when the query throws", async () => {
    mocks.db.workspaceMember.findFirst.mockRejectedValue(new Error("db down"));
    expect(await canUserJoinWorkspace("u1", "ws1")).toBe(false);
  });
});

describe("authenticateSocket", () => {
  it("returns null when no cookie header is present", async () => {
    expect(await authenticateSocket({ headers: {} })).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("returns null when there is no valid session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await authenticateSocket({ headers: { cookie: "session=abc" } })).toBeNull();
  });

  it("returns the user id for a valid session, forwarding the cookie header", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1" } });
    expect(await authenticateSocket({ headers: { cookie: "session=abc" } })).toBe("u1");
    const passedHeaders = mocks.getSession.mock.calls[0][0].headers as Headers;
    expect(passedHeaders.get("cookie")).toBe("session=abc");
  });

  it("is case-insensitive about the Cookie header name", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u2" } });
    expect(await authenticateSocket({ headers: { Cookie: "session=xyz" } })).toBe("u2");
  });

  it("fails closed (null) when session resolution throws", async () => {
    mocks.getSession.mockRejectedValue(new Error("boom"));
    expect(await authenticateSocket({ headers: { cookie: "session=abc" } })).toBeNull();
  });
});

describe("getUserProfile", () => {
  it("returns the display fields for a known user", async () => {
    mocks.db.user.findUnique.mockResolvedValue({ id: "u1", name: "Ada", image: null });
    expect(await getUserProfile("u1")).toEqual({ id: "u1", name: "Ada", image: null });
  });

  it("fails closed (null) when the query throws", async () => {
    mocks.db.user.findUnique.mockRejectedValue(new Error("db down"));
    expect(await getUserProfile("u1")).toBeNull();
  });
});
