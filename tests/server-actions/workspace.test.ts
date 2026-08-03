/**
 * US-006 — Server Action security tests: workspace settings & invitations
 * (`workspace/actions.ts`). workspaceId is caller-supplied here, so isolation =
 * non-membership of the targeted workspace. Verbs: `invitation:create` (invite)
 * and `organization:update` (settings) — both admin-only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoWrites, formData, roleGrants, type Role } from "./_harness";

const WS_A = "A".repeat(31) + "1";
const WS_B = "B".repeat(31) + "2";

const h = vi.hoisted(() => {
  const state = {
    callerId: null as string | null,
    authed: true,
    membership: new Map<string, "admin" | "editor" | "viewer">(),
  };
  const checkRef = { fn: null as null | ((ws: string, perms: Record<string, string[]>) => boolean) };
  const fn = () => vi.fn();
  return {
    state,
    checkRef,
    verifySession: vi.fn(async () => {
      if (!state.authed || !state.callerId) throw new Error("NEXT_REDIRECT");
      return { userId: state.callerId };
    }),
    hasPermission: vi.fn(async ({ body }: { body: { organizationId: string; permissions: Record<string, string[]> } }) => ({
      success: checkRef.fn ? checkRef.fn(body.organizationId, body.permissions) : false,
    })),
    createInvitation: fn(),
    notifyInvited: fn(),
    emitAnalyticsRefresh: fn(),
    emitInvitationNew: fn(),
    db: {
      workspace: { update: vi.fn(), findUnique: vi.fn() },
      workspaceMember: { findFirst: vi.fn() },
      invitation: { findFirst: vi.fn() },
      user: { findUnique: vi.fn(), findFirst: vi.fn() },
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { hasPermission: h.hasPermission, createInvitation: h.createInvitation } },
}));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/notification", () => ({ notifyInvited: h.notifyInvited }));
vi.mock("@/lib/realtime/server", () => ({ emitAnalyticsRefresh: h.emitAnalyticsRefresh, emitInvitationNew: h.emitInvitationNew }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

h.checkRef.fn = (ws, perms) => {
  const role = h.state.membership.get(`${h.state.callerId}:${ws}`);
  return roleGrants(role, perms);
};

import {
  inviteMemberAction,
  updateWorkspaceTimezoneAction,
  updateWorkspaceRequireEstimateAction,
  updateWorkspaceAnalyticsLaunchAction,
} from "@/app/(authenticated)/(dashboard)/workspace/actions";

const writeSeams = [
  h.db.workspace.update, h.createInvitation, h.notifyInvited, h.emitAnalyticsRefresh,
];

function signInAs(userId: string, ws: string, role: Role) {
  h.state.authed = true;
  h.state.callerId = userId;
  h.state.membership.set(`${userId}:${ws}`, role);
}
function signOut() {
  h.state.authed = false;
  h.state.callerId = null;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.callerId = null;
  h.state.authed = true;
  h.state.membership.clear();
  h.db.workspaceMember.findFirst.mockResolvedValue(null);
  h.db.invitation.findFirst.mockResolvedValue(null);
  h.db.user.findUnique.mockReset();
  h.db.user.findFirst.mockReset();
  h.db.user.findFirst.mockResolvedValue(null);
  h.emitInvitationNew.mockReset();
});

describe("inviteMemberAction (invitation:create — admin only)", () => {
  const form = (ws: string) => formData({ workspaceId: ws, email: "new@user.com", role: "editor" });

  it("A1 auth: signed out → throws, no invite", async () => {
    signOut();
    await expect(inviteMemberAction(form(WS_A))).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: an editor cannot invite", async () => {
    signInAs("u", WS_A, "editor");
    expect(await inviteMemberAction(form(WS_A))).toEqual({ success: false, error: "Workspace not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: a WS-B admin cannot invite into WS-A", async () => {
    signInAs("u", WS_B, "admin");
    expect(await inviteMemberAction(form(WS_A))).toEqual({ success: false, error: "Workspace not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("allow: a WS-A admin invites", async () => {
    signInAs("u", WS_A, "admin");
    h.createInvitation.mockResolvedValue({ id: "inv" });
    h.db.user.findUnique.mockResolvedValue({ name: "U" });
    h.db.workspace.findUnique.mockResolvedValue({ name: "W" });
    expect(await inviteMemberAction(form(WS_A))).toEqual({ success: true, invitationId: "inv" });
    expect(h.createInvitation).toHaveBeenCalled();
  });

  it("W2: a registered invitee gets the live arrival emit (case-insensitive email)", async () => {
    signInAs("u", WS_A, "admin");
    h.createInvitation.mockResolvedValue({ id: "inv" });
    h.db.user.findUnique.mockResolvedValue({ name: "U" });
    h.db.workspace.findUnique.mockResolvedValue({ name: "W" });
    // Better Auth lowercases user emails at sign-up (verified: sign-up.mjs
    // normalizes) and invitation emails on create, so the insensitive lookup
    // is a defensive superset — the resolution must not depend on exact-case
    // matches for mixed-case input at the invite boundary.
    h.db.user.findFirst.mockResolvedValue({ id: "invitee-user-id" });

    expect(await inviteMemberAction(form(WS_A))).toEqual({ success: true, invitationId: "inv" });

    expect(h.db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "new@user.com", mode: "insensitive" } },
      }),
    );
    expect(h.emitInvitationNew).toHaveBeenCalledWith("invitee-user-id", {
      invitationId: "inv",
    });
  });

  it("W2: an unregistered email invites successfully with no realtime signal", async () => {
    signInAs("u", WS_A, "admin");
    h.createInvitation.mockResolvedValue({ id: "inv" });
    h.db.user.findUnique.mockResolvedValue({ name: "U" });
    h.db.workspace.findUnique.mockResolvedValue({ name: "W" });
    h.db.user.findFirst.mockResolvedValue(null);

    expect(await inviteMemberAction(form(WS_A))).toEqual({ success: true, invitationId: "inv" });
    expect(h.emitInvitationNew).not.toHaveBeenCalled();
  });

  it("W2: a user-lookup failure never fails the invite (best-effort emit)", async () => {
    signInAs("u", WS_A, "admin");
    h.createInvitation.mockResolvedValue({ id: "inv" });
    h.db.user.findUnique.mockResolvedValue({ name: "U" });
    h.db.workspace.findUnique.mockResolvedValue({ name: "W" });
    h.db.user.findFirst.mockRejectedValue(new Error("db hiccup"));

    expect(await inviteMemberAction(form(WS_A))).toEqual({ success: true, invitationId: "inv" });
  });
});

describe.each([
  ["updateWorkspaceTimezoneAction", (ws: string) => updateWorkspaceTimezoneAction(ws, "America/New_York")],
  ["updateWorkspaceRequireEstimateAction", (ws: string) => updateWorkspaceRequireEstimateAction(ws, true)],
  ["updateWorkspaceAnalyticsLaunchAction", (ws: string) => updateWorkspaceAnalyticsLaunchAction(ws, new Date("2026-01-01"))],
])("%s (organization:update — admin only)", (_name, call) => {
  it("A1 auth: signed out → throws, no write", async () => {
    signOut();
    await expect(call(WS_A)).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: an editor is denied", async () => {
    signInAs("u", WS_A, "editor");
    expect(await call(WS_A)).toEqual({ success: false, error: "Workspace not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: a WS-B admin cannot change WS-A settings", async () => {
    signInAs("u", WS_B, "admin");
    expect(await call(WS_A)).toEqual({ success: false, error: "Workspace not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("allow: a WS-A admin updates the setting", async () => {
    signInAs("u", WS_A, "admin");
    h.db.workspace.update.mockResolvedValue({});
    expect(await call(WS_A)).toEqual({ success: true });
    expect(h.db.workspace.update).toHaveBeenCalled();
  });
});
