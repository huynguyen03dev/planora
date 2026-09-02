/**
 * US-006 — Server Action security tests (worked example: board actions).
 *
 * Proves, per the IN-01 / E03 contract, that each mutating board action enforces
 * the boundary in order — authenticated caller, then a permission check against
 * the *resource-derived* workspace — before any Prisma write. Three canonical
 * assertions per action: A1 (auth), A2 (permission), A3 (workspace isolation),
 * plus a positive control so denial assertions aren't vacuously green.
 *
 * Design rule (see ../../docs/stories/.../US-006.../design.md): we mock
 * `auth.api.hasPermission` — one layer BELOW `hasWorkspacePermission` — so the
 * real workspace-scoping logic runs. Mocking `hasWorkspacePermission` directly
 * would make the isolation assertion a tautology.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth";

import { boardFixture, expectNoWrites, formData, roleGrants, type Role } from "./_harness";

// 32-char alphanumeric workspace IDs (Better Auth shape); UUID board IDs.
const WS_A = "A".repeat(31) + "1";
const WS_B = "B".repeat(31) + "2";
const BOARD_UUID = "11111111-1111-4111-8111-111111111111";

const h = vi.hoisted(() => {
  const state = {
    callerId: null as string | null,
    authed: true,
    // key: `${userId}:${workspaceId}` -> role
    membership: new Map<string, "admin" | "editor" | "viewer">(),
  };
  // delegate the permission decision to a fn assigned after imports resolve
  const checkRef = { fn: null as null | ((ws: string, perms: Record<string, string[]>) => boolean) };
  return {
    state,
    checkRef,
    board: {
      getBoardById: vi.fn(),
      createBoard: vi.fn(),
      updateBoard: vi.fn(),
      deleteBoard: vi.fn(),
      toggleBoardStar: vi.fn(),
    },
    emitBoardArchived: vi.fn(),
    db: {
      // `isWorkspaceMember` (the gate for toggleBoardStarAction) queries the
      // DB membership row directly — there is no better-auth seam to mock.
      workspaceMember: { findFirst: vi.fn() },
    },
    workspace: {
      createWorkspaceForCurrentUser: vi.fn(),
    },
    verifySession: vi.fn(async () => {
      if (!state.authed || !state.callerId) {
        // mirrors dal.verifySession redirecting an unauthenticated caller
        throw new Error("NEXT_REDIRECT");
      }
      return { userId: state.callerId };
    }),
    hasPermission: vi.fn(async ({ body }: { body: { organizationId: string; permissions: Record<string, string[]> } }) => ({
      success: checkRef.fn ? checkRef.fn(body.organizationId, body.permissions) : false,
    })),
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({ auth: { api: { hasPermission: h.hasPermission } } }));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/board", () => ({
  getBoardById: h.board.getBoardById,
  createBoard: h.board.createBoard,
  updateBoard: h.board.updateBoard,
  deleteBoard: h.board.deleteBoard,
  toggleBoardStar: h.board.toggleBoardStar,
}));
vi.mock("@/lib/workspace", () => ({
  createWorkspaceForCurrentUser: h.workspace.createWorkspaceForCurrentUser,
}));
vi.mock("@/lib/realtime/server", () => ({ emitBoardArchived: h.emitBoardArchived }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

// Resolve the real permission decision now that imports are available.
// This keeps the REAL hasWorkspacePermission in the loop — the auth seam below
// it answers from the membership map using the faithful capability matrix.
h.checkRef.fn = (ws, perms) => {
  const role = h.state.membership.get(`${h.state.callerId}:${ws}`);
  return roleGrants(role, perms);
};

import {
  createBoardAction,
  updateBoardAction,
  deleteBoardAction,
  toggleBoardStarAction,
  createWorkspaceAction,
} from "@/app/(authenticated)/(dashboard)/boards/actions";

/** Put a caller on the board: authenticated, member of `ws` with `role`. */
function signInAs(userId: string, ws: string, role: Role) {
  h.state.authed = true;
  h.state.callerId = userId;
  h.state.membership.set(`${userId}:${ws}`, role);
}

function signOut() {
  h.state.authed = false;
  h.state.callerId = null;
}

const writeSpies = [h.board.createBoard, h.board.updateBoard, h.board.deleteBoard];

beforeEach(() => {
  vi.clearAllMocks();
  h.state.callerId = null;
  h.state.authed = true;
  h.state.membership.clear();
  h.db.workspaceMember.findFirst.mockResolvedValue(null);
});

describe("updateBoardAction — security boundary", () => {
  const validForm = () => formData({ boardId: BOARD_UUID, title: "Renamed" });

  it("A1 auth: unauthenticated caller never reaches a write", async () => {
    signOut();
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));

    await expect(updateBoardAction(validForm())).rejects.toThrow();

    expect(h.board.getBoardById).not.toHaveBeenCalled();
    expectNoWrites(...writeSpies);
  });

  it("A2 permission: a viewer is denied and nothing is written", async () => {
    signInAs("viewer-user", WS_A, "viewer");
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));

    const result = await updateBoardAction(validForm());

    expect(result).toEqual({ success: false, error: "Board not found" });
    expectNoWrites(...writeSpies);
  });

  it("A3 isolation: a WS-B editor cannot update a board in WS-A", async () => {
    // The board resolves to WS_A; the caller is only a member of WS_B.
    signInAs("cross-tenant-user", WS_B, "editor");
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));

    const result = await updateBoardAction(validForm());

    expect(result).toEqual({ success: false, error: "Board not found" });
    // The gate was asked about WS_A (resource-derived), not WS_B (caller's own).
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSpies);
  });

  it("allow (positive control): a WS-A editor updates the board", async () => {
    signInAs("editor-user", WS_A, "editor");
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));
    h.board.updateBoard.mockResolvedValue(undefined);

    const result = await updateBoardAction(validForm());

    expect(result).toEqual({ success: true });
    expect(h.board.updateBoard).toHaveBeenCalledWith(BOARD_UUID, { title: "Renamed" });
  });

  it("US-059: a non-member (auth.api.hasPermission throws UNAUTHORIZED) gets a clean deny, not a 500", async () => {
    signInAs("outsider-user", WS_B, "admin"); // real member of WS_B only
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));
    // Mirrors Better Auth's organization.mjs:75 throw for a non-member caller,
    // instead of the mocked-decision resolve the other cases use.
    h.hasPermission.mockRejectedValueOnce(
      APIError.from("UNAUTHORIZED", {
        message: "You are not a member of this organization.",
        code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
      }),
    );

    const result = await updateBoardAction(validForm());

    expect(result).toEqual({ success: false, error: "Board not found" });
    expectNoWrites(...writeSpies);
  });
});

describe("deleteBoardAction — security boundary", () => {
  it("A1 auth: unauthenticated caller never reaches a write", async () => {
    signOut();
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));

    await expect(deleteBoardAction(BOARD_UUID)).rejects.toThrow();

    expectNoWrites(...writeSpies);
  });

  it("A2 permission: an editor cannot delete a board (delete is admin-only)", async () => {
    signInAs("editor-user", WS_A, "editor");
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));

    const result = await deleteBoardAction(BOARD_UUID);

    expect(result).toEqual({ success: false, error: "Board not found" });
    expectNoWrites(...writeSpies);
  });

  it("A3 isolation: a WS-B admin cannot delete a board in WS-A", async () => {
    signInAs("cross-tenant-admin", WS_B, "admin");
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));

    const result = await deleteBoardAction(BOARD_UUID);

    expect(result).toEqual({ success: false, error: "Board not found" });
    expectNoWrites(...writeSpies);
  });

  it("allow (positive control): a WS-A admin deletes the board", async () => {
    signInAs("admin-user", WS_A, "admin");
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));
    h.board.deleteBoard.mockResolvedValue(undefined);

    const result = await deleteBoardAction(BOARD_UUID);

    expect(result).toEqual({ success: true });
    expect(h.board.deleteBoard).toHaveBeenCalledWith(BOARD_UUID);
    // F10: the board room must be signalled so open clients leave + re-render.
    expect(h.emitBoardArchived).toHaveBeenCalledWith(BOARD_UUID, expect.any(String));
    const archivedAt = h.emitBoardArchived.mock.calls[0][1] as string;
    expect(Number.isNaN(Date.parse(archivedAt))).toBe(false);
  });

  it("F10: a denied delete never signals the board room", async () => {
    signInAs("editor-user", WS_A, "editor");
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));

    const result = await deleteBoardAction(BOARD_UUID);

    expect(result).toEqual({ success: false, error: "Board not found" });
    expect(h.emitBoardArchived).not.toHaveBeenCalled();
  });
});

describe("createBoardAction — security boundary (workspaceId from input)", () => {
  const formFor = (ws: string) => formData({ workspaceId: ws, title: "New board" });

  it("A1 auth: unauthenticated caller never reaches a write", async () => {
    signOut();

    await expect(createBoardAction(formFor(WS_A))).rejects.toThrow();

    expectNoWrites(...writeSpies);
  });

  it("A2 permission: an editor cannot create a board (create is admin-only)", async () => {
    signInAs("editor-user", WS_A, "editor");

    const result = await createBoardAction(formFor(WS_A));

    expect(result).toEqual({ success: false, error: "Board not found" });
    expectNoWrites(...writeSpies);
  });

  it("A3 isolation: a WS-B admin cannot create a board in WS-A", async () => {
    // workspaceId is caller-supplied here; isolation = non-membership of WS_A.
    signInAs("cross-tenant-admin", WS_B, "admin");

    const result = await createBoardAction(formFor(WS_A));

    expect(result).toEqual({ success: false, error: "Board not found" });
    expectNoWrites(...writeSpies);
  });

  it("allow (positive control): a WS-A admin creates the board", async () => {
    signInAs("admin-user", WS_A, "admin");
    h.board.createBoard.mockResolvedValue({ id: "new-board" });

    const result = await createBoardAction(formFor(WS_A));

    expect(result).toEqual({ success: true, boardId: "new-board" });
    expect(h.board.createBoard).toHaveBeenCalled();
  });
});

describe("toggleBoardStarAction — security boundary (member-any via isWorkspaceMember)", () => {
  it("A1 auth: unauthenticated caller never reaches a write", async () => {
    signOut();
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));

    await expect(toggleBoardStarAction(BOARD_UUID)).rejects.toThrow();

    expect(h.board.getBoardById).not.toHaveBeenCalled();
    expectNoWrites(h.board.toggleBoardStar);
  });

  it("A2 access: a non-member of the board's workspace is denied (member-any gate)", async () => {
    // Starring gates on `isWorkspaceMember` — any role passes, so the deny
    // dimension is non/foreign membership rather than role.
    signInAs("outsider-user", WS_B, "admin"); // real member of WS_B only
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));

    const result = await toggleBoardStarAction(BOARD_UUID);

    expect(result).toEqual({ success: false, error: "Board not found" });
    expectNoWrites(h.board.toggleBoardStar);
  });

  it("A3 isolation: the gate is consulted about the resource's workspace (WS_A), not the caller's own", async () => {
    signInAs("cross-tenant-user", WS_B, "admin");
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));

    const result = await toggleBoardStarAction(BOARD_UUID);

    expect(result).toEqual({ success: false, error: "Board not found" });
    // The board resolves to WS_A; the membership check must be scoped to that
    // resource-derived workspace and the session user — never caller-supplied.
    expect(h.db.workspaceMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: WS_A,
          userId: "cross-tenant-user",
        }),
      }),
    );
    expectNoWrites(h.board.toggleBoardStar);
  });

  it("unknown board: a nonexistent board is denied before any membership query or write", async () => {
    signInAs("member-user", WS_A, "admin");
    h.board.getBoardById.mockResolvedValue(null);

    const result = await toggleBoardStarAction(BOARD_UUID);

    expect(result).toEqual({ success: false, error: "Board not found" });
    expect(h.db.workspaceMember.findFirst).not.toHaveBeenCalled();
    expectNoWrites(h.board.toggleBoardStar);
  });

  it("allow (positive control): a WS-A member of ANY role stars the board", async () => {
    // viewer is sufficient — the gate is membership, not role.
    signInAs("viewer-user", WS_A, "viewer");
    h.board.getBoardById.mockResolvedValue(boardFixture(WS_A));
    h.db.workspaceMember.findFirst.mockResolvedValue({ id: "membership-1" });
    h.board.toggleBoardStar.mockResolvedValue(true);

    const result = await toggleBoardStarAction(BOARD_UUID);

    expect(result).toEqual({ success: true, starred: true });
    expect(h.board.toggleBoardStar).toHaveBeenCalledWith("viewer-user", BOARD_UUID);
  });
});

describe("createWorkspaceAction — security boundary (session-only gate; no workspace to scope)", () => {
  // NOTE: production enforces ONLY verifySession() + Zod here — the action
  // creates a brand-new workspace FOR the current user, so there is no target
  // workspace to scope and no role to check. A2/A3 have no production
  // counterpart, so the deny dimension is authentication only; the action is
  // tested exactly as it gates, with no invented permission check.
  it("A1 auth: unauthenticated caller never reaches a write", async () => {
    signOut();

    await expect(createWorkspaceAction(formData({ workspaceName: "New Workspace" }))).rejects.toThrow();

    expectNoWrites(h.workspace.createWorkspaceForCurrentUser);
  });

  it("validation: a too-short workspace name is rejected before any write", async () => {
    signInAs("user", WS_A, "viewer");

    const result = await createWorkspaceAction(formData({ workspaceName: "X" }));

    expect(result).toEqual({
      success: false,
      error: "Workspace name must be at least 2 characters",
    });
    expectNoWrites(h.workspace.createWorkspaceForCurrentUser);
  });

  it("allow (positive control): an authenticated caller creates a workspace (trimmed name hits the seam)", async () => {
    signInAs("user", WS_A, "viewer");
    h.workspace.createWorkspaceForCurrentUser.mockResolvedValue({
      id: "ws-new",
      name: "Team",
      slug: "team",
    });

    const result = await createWorkspaceAction(formData({ workspaceName: " Team " }));

    expect(result).toEqual({ success: true, workspaceId: "ws-new" });
    // The Zod schema trims before the write seam sees the name.
    expect(h.workspace.createWorkspaceForCurrentUser).toHaveBeenCalledWith("Team");
  });
});
