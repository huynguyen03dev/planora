/**
 * US-063 — Server Action security tests: workspace member management
 * (`[slug]/members/actions.ts`). All four actions route through Better Auth's
 * `auth.api.*`; the tests assert on those mocks (never on raw db writes) and on
 * the R2 last-admin guard.
 *
 * Boundary claims (sabotage-verified — remove a guard and a test goes red):
 *   - auth: signed out → throws, no BA mutation.
 *   - permission: a non-admin is denied before any BA mutation.
 *   - isolation: a target/invitation outside the caller's workspace is denied.
 *   - R2: the sole admin cannot be removed/demoted/leave — BA is never called.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoWrites, roleGrants, type Role } from "./_harness";

const WS_A = "A".repeat(31) + "1";
const WS_B = "B".repeat(31) + "2";

const h = vi.hoisted(() => {
  const state = {
    callerId: null as string | null,
    authed: true,
    membership: new Map<string, "admin" | "editor" | "viewer">(),
    adminCount: 2,
  };
  const checkRef = {
    fn: null as null | ((ws: string, perms: Record<string, string[]>) => boolean),
  };
  const count = vi.fn(async () => state.adminCount);
  return {
    state,
    checkRef,
    count,
    verifySession: vi.fn(async () => {
      if (!state.authed || !state.callerId) throw new Error("NEXT_REDIRECT");
      return { userId: state.callerId };
    }),
    hasPermission: vi.fn(
      async ({ body }: { body: { organizationId: string; permissions: Record<string, string[]> } }) => ({
        success: checkRef.fn ? checkRef.fn(body.organizationId, body.permissions) : false,
      }),
    ),
    removeMember: vi.fn(),
    updateMemberRole: vi.fn(),
    leaveOrganization: vi.fn(),
    cancelInvitation: vi.fn(),
    listMemberships: vi.fn(async () => [] as { workspaceId: string }[]),
    setActive: vi.fn(),
    kickUserSockets: vi.fn(),
    db: {
      workspaceMember: { findFirst: vi.fn() },
      invitation: { findFirst: vi.fn() },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({ $executeRaw: vi.fn(), workspaceMember: { count } }),
      ),
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      hasPermission: h.hasPermission,
      removeMember: h.removeMember,
      updateMemberRole: h.updateMemberRole,
      leaveOrganization: h.leaveOrganization,
      cancelInvitation: h.cancelInvitation,
    },
  },
}));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/workspace", () => ({
  listWorkspaceMembershipsByUserId: h.listMemberships,
  setActiveWorkspaceForCurrentUser: h.setActive,
}));
vi.mock("@/lib/realtime/server", () => ({ kickUserSockets: h.kickUserSockets }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

h.checkRef.fn = (ws, perms) => {
  const role = h.state.membership.get(`${h.state.callerId}:${ws}`);
  return roleGrants(role, perms);
};

import {
  cancelInvitationAction,
  leaveWorkspaceAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "@/app/(authenticated)/(dashboard)/workspace/[slug]/members/actions";

const baWrites = [h.removeMember, h.updateMemberRole, h.leaveOrganization, h.cancelInvitation];

function signInAs(userId: string, ws: string, role: Role) {
  h.state.authed = true;
  h.state.callerId = userId;
  h.state.membership.set(`${userId}:${ws}`, role);
}
function signOut() {
  h.state.authed = false;
  h.state.callerId = null;
}

/** Make resolveWorkspaceMember(workspaceId, userId) return this member row. */
function targetMember(row: { id: string; role: string } | null) {
  h.db.workspaceMember.findFirst.mockResolvedValue(row);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.callerId = null;
  h.state.authed = true;
  h.state.membership.clear();
  h.state.adminCount = 2;
  h.db.workspaceMember.findFirst.mockResolvedValue({ id: "member-t", role: "editor" });
  h.db.invitation.findFirst.mockResolvedValue({ id: "inv-1" });
  h.listMemberships.mockResolvedValue([]);
});

describe("removeMemberAction (member:delete — admin only)", () => {
  const input = (ws: string) => ({ workspaceId: ws, targetUserId: "victim" });

  it("A1 auth: signed out → throws, no BA call", async () => {
    signOut();
    await expect(removeMemberAction(input(WS_A))).rejects.toThrow();
    expectNoWrites(...baWrites);
  });

  it("A2 permission: an editor cannot remove", async () => {
    signInAs("u", WS_A, "editor");
    expect(await removeMemberAction(input(WS_A))).toEqual({ success: false, error: "Workspace not found" });
    expectNoWrites(...baWrites);
  });

  it("A3 isolation: a WS-B admin cannot remove in WS-A", async () => {
    signInAs("u", WS_B, "admin");
    expect(await removeMemberAction(input(WS_A))).toEqual({ success: false, error: "Workspace not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...baWrites);
  });

  it("isolation: target not a member of the workspace → denied, no BA call", async () => {
    signInAs("u", WS_A, "admin");
    targetMember(null);
    expect(await removeMemberAction(input(WS_A))).toEqual({ success: false, error: "Member not found" });
    expectNoWrites(...baWrites);
  });

  it("allow: an admin removes an editor via auth.api.removeMember (by memberId)", async () => {
    signInAs("u", WS_A, "admin");
    targetMember({ id: "member-t", role: "editor" });
    expect(await removeMemberAction(input(WS_A))).toEqual({ success: true });
    expect(h.removeMember).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { memberIdOrEmail: "member-t", organizationId: WS_A },
      }),
    );
    // F2: the removed member's sockets are kicked so they stop receiving
    // board/workspace broadcasts immediately.
    expect(h.kickUserSockets).toHaveBeenCalledWith("victim");
  });

  it("F2: a denied removal never kicks the target's sockets", async () => {
    signInAs("u", WS_A, "editor");
    expect(await removeMemberAction(input(WS_A))).toEqual({ success: false, error: "Workspace not found" });
    expect(h.kickUserSockets).not.toHaveBeenCalled();
  });

  it("R2: removing the sole admin is blocked, BA never called", async () => {
    signInAs("u", WS_A, "admin");
    targetMember({ id: "member-admin", role: "admin" });
    h.state.adminCount = 1;
    expect(await removeMemberAction(input(WS_A))).toEqual({
      success: false,
      error: "A workspace must keep at least one admin.",
    });
    expectNoWrites(...baWrites);
  });

  it("R2: removing an admin is allowed when another admin remains", async () => {
    signInAs("u", WS_A, "admin");
    targetMember({ id: "member-admin", role: "admin" });
    h.state.adminCount = 2;
    expect(await removeMemberAction(input(WS_A))).toEqual({ success: true });
    expect(h.removeMember).toHaveBeenCalled();
  });
});

describe("updateMemberRoleAction (member:update — admin only)", () => {
  const input = (ws: string, role = "editor") => ({ workspaceId: ws, targetUserId: "t", role });

  it("A1 auth: signed out → throws, no BA call", async () => {
    signOut();
    await expect(updateMemberRoleAction(input(WS_A))).rejects.toThrow();
    expectNoWrites(...baWrites);
  });

  it("A2 permission: an editor cannot change roles", async () => {
    signInAs("u", WS_A, "editor");
    expect(await updateMemberRoleAction(input(WS_A))).toEqual({ success: false, error: "Workspace not found" });
    expectNoWrites(...baWrites);
  });

  it("A3 isolation: a WS-B admin cannot change roles in WS-A", async () => {
    signInAs("u", WS_B, "admin");
    expect(await updateMemberRoleAction(input(WS_A))).toEqual({ success: false, error: "Workspace not found" });
    expectNoWrites(...baWrites);
  });

  it("allow: an admin promotes an editor to admin", async () => {
    signInAs("u", WS_A, "admin");
    targetMember({ id: "member-t", role: "editor" });
    expect(await updateMemberRoleAction(input(WS_A, "admin"))).toEqual({ success: true });
    expect(h.updateMemberRole).toHaveBeenCalledWith(
      expect.objectContaining({ body: { memberId: "member-t", role: "admin", organizationId: WS_A } }),
    );
    // F2: any successful role change kicks the target's sockets so their
    // presence badge and room memberships re-resolve under the new role.
    expect(h.kickUserSockets).toHaveBeenCalledWith("t");
  });

  it("R2: demoting the sole admin is blocked, BA never called", async () => {
    signInAs("u", WS_A, "admin");
    targetMember({ id: "member-admin", role: "admin" });
    h.state.adminCount = 1;
    expect(await updateMemberRoleAction(input(WS_A, "editor"))).toEqual({
      success: false,
      error: "A workspace must keep at least one admin.",
    });
    expectNoWrites(...baWrites);
  });

  it("no-op: setting the role a member already has does not call BA", async () => {
    signInAs("u", WS_A, "admin");
    targetMember({ id: "member-t", role: "editor" });
    expect(await updateMemberRoleAction(input(WS_A, "editor"))).toEqual({ success: true });
    expectNoWrites(...baWrites);
    // F2: no role actually changed → no kick.
    expect(h.kickUserSockets).not.toHaveBeenCalled();
  });
});

describe("leaveWorkspaceAction (self-removal + R2)", () => {
  const input = (ws: string) => ({ workspaceId: ws });

  it("A1 auth: signed out → throws, no BA call", async () => {
    signOut();
    await expect(leaveWorkspaceAction(input(WS_A))).rejects.toThrow();
    expectNoWrites(...baWrites);
  });

  it("isolation: a non-member cannot leave", async () => {
    signInAs("u", WS_A, "editor");
    targetMember(null);
    expect(await leaveWorkspaceAction(input(WS_A))).toEqual({ success: false, error: "Workspace not found" });
    expectNoWrites(...baWrites);
  });

  it("allow: an editor leaves and is redirected to the chooser", async () => {
    signInAs("u", WS_A, "editor");
    targetMember({ id: "member-self", role: "editor" });
    h.listMemberships.mockResolvedValue([{ workspaceId: WS_B }]);
    expect(await leaveWorkspaceAction(input(WS_A))).toEqual({ success: true, redirectTo: "/workspace" });
    expect(h.leaveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: WS_A } }),
    );
    // Reselects a remaining workspace as active (decision 0019, R3).
    expect(h.setActive).toHaveBeenCalledWith(WS_B);
  });

  it("R2: the sole admin cannot leave, BA never called", async () => {
    signInAs("u", WS_A, "admin");
    targetMember({ id: "member-self", role: "admin" });
    h.state.adminCount = 1;
    expect(await leaveWorkspaceAction(input(WS_A))).toEqual({
      success: false,
      error: "A workspace must keep at least one admin.",
    });
    expectNoWrites(...baWrites);
  });
});

describe("cancelInvitationAction (invitation:cancel — admin only)", () => {
  const input = (ws: string) => ({ workspaceId: ws, invitationId: "inv-1" });

  it("A1 auth: signed out → throws, no BA call", async () => {
    signOut();
    await expect(cancelInvitationAction(input(WS_A))).rejects.toThrow();
    expectNoWrites(...baWrites);
  });

  it("A2 permission: an editor cannot revoke", async () => {
    signInAs("u", WS_A, "editor");
    expect(await cancelInvitationAction(input(WS_A))).toEqual({ success: false, error: "Workspace not found" });
    expectNoWrites(...baWrites);
  });

  it("isolation: an invitation not in the caller's workspace → denied, no BA call", async () => {
    signInAs("u", WS_A, "admin");
    h.db.invitation.findFirst.mockResolvedValue(null);
    expect(await cancelInvitationAction(input(WS_A))).toEqual({ success: false, error: "Invitation not found" });
    expect(h.db.invitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-1", organizationId: WS_A } }),
    );
    expectNoWrites(...baWrites);
  });

  it("allow: an admin revokes a pending invitation", async () => {
    signInAs("u", WS_A, "admin");
    h.db.invitation.findFirst.mockResolvedValue({ id: "inv-1" });
    expect(await cancelInvitationAction(input(WS_A))).toEqual({ success: true });
    expect(h.cancelInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ body: { invitationId: "inv-1" } }),
    );
  });
});
