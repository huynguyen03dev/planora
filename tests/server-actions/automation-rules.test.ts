/**
 * US-066 Phase 8 — Rule CRUD Server Action security suite (US-006 pattern).
 *
 * Same contract as list-card.test.ts: A1 (auth) / A2 (permission) / A3
 * (isolation) + positive controls. The auth seam (`auth.api.hasPermission`) and
 * membership lookup (`workspaceMember.findFirst`) are mocked; the REAL
 * `hasWorkspacePermission` and `isWorkspaceMember` run.
 *
 * Rule MUTATIONS are admin-only (gate: `organization:update`, granted to admin
 * exclusively) — so both viewer AND editor must be denied. Rule READS
 * (list / execution-log / dry-run) are open to any workspace member, so a
 * viewer must be ALLOWED to read but a non-member denied.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleGrants, expectNoWrites, type Role } from "./_harness";

// Workspace ids are Better Auth organization ids: 32-char alphanumeric
// nanoids, NOT UUIDs. Using realistic ids here guards the schema against the
// real ID shape (UUID fixtures previously masked a uuid()-only validator bug).
const WS_A = "A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6";
const WS_B = "Z9Y8X7W6V5U4T3S2R1Q0P9O8N7M6L5K4";
const RULE_A = "33333333-3333-4333-8333-333333333333";
const BOARD_A = "44444444-4444-4444-8444-444444444444";
const BOARD_B = "55555555-5555-4555-8555-555555555555";
const LIST_ID = "66666666-6666-4666-8666-666666666666";

const h = vi.hoisted(() => {
  const state = {
    callerId: null as string | null,
    authed: true,
    membership: new Map<string, "admin" | "editor" | "viewer">(),
  };
  const checkRef = {
    fn: null as null | ((ws: string, perms: Record<string, string[]>) => boolean),
  };
  return {
    state,
    checkRef,
    verifySession: vi.fn(async () => {
      if (!state.authed || !state.callerId) throw new Error("NEXT_REDIRECT");
      return { userId: state.callerId };
    }),
    hasPermission: vi.fn(
      async ({ body }: { body: { organizationId: string; permissions: Record<string, string[]> } }) => ({
        success: checkRef.fn ? checkRef.fn(body.organizationId, body.permissions) : false,
      }),
    ),
    getBoardById: vi.fn(),
    loadAutomationView: vi.fn(async () => ({
      options: { boards: [], lists: [], labels: [], members: [] },
      rules: [],
      logs: [],
      lastRunByRule: {},
    })),
    db: {
      rule: {
        findUnique: vi.fn(async () => null as unknown),
        findMany: vi.fn(async () => [] as unknown[]),
        aggregate: vi.fn(async () => ({ _max: { position: null as number | null } })),
        create: vi.fn(async () => ({ id: RULE_A })),
        update: vi.fn(async () => ({ id: RULE_A })),
        delete: vi.fn(async () => ({ id: RULE_A })),
      },
      ruleExecutionLog: {
        findMany: vi.fn(async () => [] as unknown[]),
      },
      list: {
        findMany: vi.fn(async () => [] as unknown[]),
      },
      label: {
        findMany: vi.fn(async () => [] as unknown[]),
      },
      workspaceMember: {
        findFirst: vi.fn(async ({ where }: { where: { organizationId: string; userId: string } }) => {
          const role = state.membership.get(`${where.userId}:${where.organizationId}`);
          return role ? { id: "m", role } : null;
        }),
      },
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({ auth: { api: { hasPermission: h.hasPermission } } }));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/board", () => ({ getBoardById: h.getBoardById }));
vi.mock("@/lib/automation/view", () => ({ loadAutomationView: h.loadAutomationView }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

h.checkRef.fn = (ws, perms) => {
  const role = h.state.membership.get(`${h.state.callerId}:${ws}`);
  return roleGrants(role, perms);
};

import {
  createRuleAction,
  updateRuleAction,
  deleteRuleAction,
  toggleRuleEnabledAction,
  listRulesAction,
  getRuleExecutionLogAction,
  getBoardAutomationDataAction,
  dryRunRulesAction,
} from "@/app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions";

const writeSeams = [h.db.rule.create, h.db.rule.update, h.db.rule.delete];

function signInAs(userId: string, ws: string, role: Role) {
  h.state.authed = true;
  h.state.callerId = userId;
  h.state.membership.set(`${userId}:${ws}`, role);
}
function signInBare(userId: string) {
  h.state.authed = true;
  h.state.callerId = userId;
}
function signOut() {
  h.state.authed = false;
  h.state.callerId = null;
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: WS_A,
    name: "My Rule",
    triggerType: "card-created",
    triggerConfig: {},
    actions: [{ type: "set-priority", priority: "HIGH" }],
    ...overrides,
  };
}

function updateInput(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_A,
    name: "Renamed",
    triggerType: "card-created",
    triggerConfig: {},
    actions: [{ type: "set-priority", priority: "HIGH" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.callerId = null;
  h.state.authed = true;
  h.state.membership.clear();
});

/* ─── createRuleAction (admin-only) ─────────────────────────────────── */

describe("createRuleAction (admin-only)", () => {
  it("A1 auth: signed out → throws, no write", async () => {
    signOut();
    await expect(createRuleAction(createInput())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    const r = await createRuleAction(createInput());
    expect(r).toEqual({ success: false, error: "Workspace not found" });
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: EDITOR denied (rule mutation is admin-only)", async () => {
    signInAs("u", WS_A, "editor");
    const r = await createRuleAction(createInput());
    expect(r).toEqual({ success: false, error: "Workspace not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: WS-B admin cannot create a rule in WS-A", async () => {
    signInAs("u", WS_B, "admin");
    const r = await createRuleAction(createInput({ workspaceId: WS_A }));
    expect(r).toEqual({ success: false, error: "Workspace not found" });
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: admin cannot scope a rule to a board in another workspace", async () => {
    signInAs("u", WS_A, "admin");
    h.getBoardById.mockResolvedValue({ id: BOARD_B, workspaceId: WS_B, archivedAt: null });
    const r = await createRuleAction(createInput({ boardId: BOARD_B }));
    expect(r).toEqual({ success: false, error: "Board not found" });
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A admin creates a rule → success", async () => {
    signInAs("u", WS_A, "admin");
    const r = await createRuleAction(createInput());
    expect(r).toMatchObject({ success: true, ruleId: RULE_A, warnings: [] });
    expect(h.db.rule.create).toHaveBeenCalledOnce();
  });

  it("allow + advisory: self-cycle rule still saves but returns a warning", async () => {
    signInAs("u", WS_A, "admin");
    // The move target is a WS-A list → passes the action-target isolation check.
    h.db.list.findMany.mockResolvedValue([
      { id: LIST_ID, board: { workspaceId: WS_A }, archivedAt: null },
    ]);
    const r = await createRuleAction(
      createInput({
        triggerType: "card-moved-to-list",
        actions: [{ type: "move-card-to-list", targetListId: LIST_ID }],
      }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain("its own trigger");
    }
    expect(h.db.rule.create).toHaveBeenCalledOnce();
  });

  it("A3 isolation: admin cannot target a move to a list in another workspace", async () => {
    signInAs("u", WS_A, "admin");
    // The list resolves, but its board is in WS-B → cross-workspace write blocked.
    h.db.list.findMany.mockResolvedValue([{ id: LIST_ID, board: { workspaceId: WS_B } }]);
    const r = await createRuleAction(
      createInput({ actions: [{ type: "move-card-to-list", targetListId: LIST_ID }] }),
    );
    expect(r).toEqual({ success: false, error: "Invalid action target" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: admin cannot add a label from another workspace", async () => {
    signInAs("u", WS_A, "admin");
    const LABEL = "77777777-7777-4777-8777-777777777777";
    h.db.label.findMany.mockResolvedValue([{ id: LABEL, board: { workspaceId: WS_B } }]);
    const r = await createRuleAction(
      createInput({ actions: [{ type: "add-label", labelId: LABEL }] }),
    );
    expect(r).toEqual({ success: false, error: "Invalid action target" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: a nonexistent list target is rejected (not silently allowed)", async () => {
    signInAs("u", WS_A, "admin");
    h.db.list.findMany.mockResolvedValue([]); // target does not resolve at all
    const r = await createRuleAction(
      createInput({ actions: [{ type: "move-card-to-list", targetListId: LIST_ID }] }),
    );
    expect(r).toEqual({ success: false, error: "Invalid action target" });
    expectNoWrites(...writeSeams);
  });

  it("allow: same-workspace board scope + list target → success", async () => {
    signInAs("u", WS_A, "admin");
    h.getBoardById.mockResolvedValue({ id: BOARD_A, workspaceId: WS_A, archivedAt: null });
    h.db.list.findMany.mockResolvedValue([
      { id: LIST_ID, board: { workspaceId: WS_A }, archivedAt: null },
    ]);
    const r = await createRuleAction(
      createInput({
        boardId: BOARD_A,
        triggerType: "card-created",
        actions: [{ type: "move-card-to-list", targetListId: LIST_ID }],
      }),
    );
    expect(r).toMatchObject({ success: true, ruleId: RULE_A });
    expect(h.db.rule.create).toHaveBeenCalledOnce();
  });

  it("US-074 minor: an ARCHIVED list target is rejected at save time (UX guard)", async () => {
    signInAs("u", WS_A, "admin");
    h.db.list.findMany.mockResolvedValue([
      { id: LIST_ID, board: { workspaceId: WS_A }, archivedAt: new Date("2026-07-01") },
    ]);
    const r = await createRuleAction(
      createInput({ actions: [{ type: "move-card-to-list", targetListId: LIST_ID }] }),
    );
    expect(r).toEqual({ success: false, error: "Cannot target an archived list" });
    expectNoWrites(...writeSeams);
  });

  it("validation: rejects an empty action list", async () => {
    signInAs("u", WS_A, "admin");
    const r = await createRuleAction(createInput({ actions: [] }));
    expect(r.success).toBe(false);
    expectNoWrites(...writeSeams);
  });
});

/* ─── updateRuleAction (admin-only, workspace derived from rule) ─────── */

describe("updateRuleAction (admin-only)", () => {
  it("A1 auth: signed out → throws, no write", async () => {
    signOut();
    await expect(updateRuleAction(updateInput())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("not found: unknown rule → RULE_NOT_FOUND, permission never checked, no write", async () => {
    signInAs("u", WS_A, "admin");
    h.db.rule.findUnique.mockResolvedValue(null);
    const r = await updateRuleAction(updateInput());
    expect(r).toEqual({ success: false, error: "Rule not found" });
    expect(h.hasPermission).not.toHaveBeenCalled();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.db.rule.findUnique.mockResolvedValue({ workspaceId: WS_A });
    const r = await updateRuleAction(updateInput());
    expect(r).toEqual({ success: false, error: "Rule not found" });
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: EDITOR denied", async () => {
    signInAs("u", WS_A, "editor");
    h.db.rule.findUnique.mockResolvedValue({ workspaceId: WS_A });
    const r = await updateRuleAction(updateInput());
    expect(r).toEqual({ success: false, error: "Rule not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: WS-B admin cannot update a WS-A rule", async () => {
    signInAs("u", WS_B, "admin");
    h.db.rule.findUnique.mockResolvedValue({ workspaceId: WS_A });
    const r = await updateRuleAction(updateInput());
    expect(r).toEqual({ success: false, error: "Rule not found" });
    // The permission was checked against the RULE's workspace, not the caller's.
    expect(h.hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: WS_A }) }),
    );
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: cannot swap in a cross-workspace list target on update", async () => {
    signInAs("u", WS_A, "admin");
    h.db.rule.findUnique.mockResolvedValue({ workspaceId: WS_A });
    h.db.list.findMany.mockResolvedValue([{ id: LIST_ID, board: { workspaceId: WS_B } }]);
    const r = await updateRuleAction(
      updateInput({ actions: [{ type: "move-card-to-list", targetListId: LIST_ID }] }),
    );
    expect(r).toEqual({ success: false, error: "Invalid action target" });
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A admin updates → success", async () => {
    signInAs("u", WS_A, "admin");
    h.db.rule.findUnique.mockResolvedValue({ workspaceId: WS_A });
    const r = await updateRuleAction(updateInput());
    expect(r).toMatchObject({ success: true, warnings: [] });
    expect(h.db.rule.update).toHaveBeenCalledOnce();
  });
});

/* ─── deleteRuleAction (admin-only) ─────────────────────────────────── */

describe("deleteRuleAction (admin-only)", () => {
  it("not found: unknown rule → RULE_NOT_FOUND, permission never checked", async () => {
    signInAs("u", WS_A, "admin");
    h.db.rule.findUnique.mockResolvedValue(null);
    const r = await deleteRuleAction({ id: RULE_A });
    expect(r).toEqual({ success: false, error: "Rule not found" });
    expect(h.hasPermission).not.toHaveBeenCalled();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: viewer denied", async () => {
    signInAs("u", WS_A, "viewer");
    h.db.rule.findUnique.mockResolvedValue({ workspaceId: WS_A });
    const r = await deleteRuleAction({ id: RULE_A });
    expect(r).toEqual({ success: false, error: "Rule not found" });
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: EDITOR denied", async () => {
    signInAs("u", WS_A, "editor");
    h.db.rule.findUnique.mockResolvedValue({ workspaceId: WS_A });
    const r = await deleteRuleAction({ id: RULE_A });
    expect(r).toEqual({ success: false, error: "Rule not found" });
    expectNoWrites(...writeSeams);
  });

  it("A3 isolation: WS-B admin cannot delete a WS-A rule", async () => {
    signInAs("u", WS_B, "admin");
    h.db.rule.findUnique.mockResolvedValue({ workspaceId: WS_A });
    const r = await deleteRuleAction({ id: RULE_A });
    expect(r).toEqual({ success: false, error: "Rule not found" });
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A admin deletes → success", async () => {
    signInAs("u", WS_A, "admin");
    h.db.rule.findUnique.mockResolvedValue({ workspaceId: WS_A });
    const r = await deleteRuleAction({ id: RULE_A });
    expect(r).toEqual({ success: true });
    expect(h.db.rule.delete).toHaveBeenCalledOnce();
  });
});

/* ─── toggleRuleEnabledAction (admin-only) ──────────────────────────── */

describe("toggleRuleEnabledAction (admin-only)", () => {
  it("not found: unknown rule → RULE_NOT_FOUND, permission never checked", async () => {
    signInAs("u", WS_A, "admin");
    h.db.rule.findUnique.mockResolvedValue(null);
    const r = await toggleRuleEnabledAction({ id: RULE_A, enabled: false });
    expect(r).toEqual({ success: false, error: "Rule not found" });
    expect(h.hasPermission).not.toHaveBeenCalled();
    expectNoWrites(...writeSeams);
  });

  it("A2 permission: editor denied", async () => {
    signInAs("u", WS_A, "editor");
    h.db.rule.findUnique.mockResolvedValue({ workspaceId: WS_A });
    const r = await toggleRuleEnabledAction({ id: RULE_A, enabled: false });
    expect(r).toEqual({ success: false, error: "Rule not found" });
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A admin toggles → success reflects new state", async () => {
    signInAs("u", WS_A, "admin");
    h.db.rule.findUnique.mockResolvedValue({ workspaceId: WS_A });
    const r = await toggleRuleEnabledAction({ id: RULE_A, enabled: false });
    expect(r).toEqual({ success: true, enabled: false });
    expect(h.db.rule.update).toHaveBeenCalledWith({
      where: { id: RULE_A },
      data: { enabled: false },
    });
  });
});

/* ─── listRulesAction (any member) ──────────────────────────────────── */

describe("listRulesAction (any workspace member)", () => {
  it("A1 auth: signed out → throws", async () => {
    signOut();
    await expect(listRulesAction({ workspaceId: WS_A })).rejects.toThrow();
  });

  it("non-member denied", async () => {
    signInBare("u"); // authed but no membership anywhere
    const r = await listRulesAction({ workspaceId: WS_A });
    expect(r).toEqual({ success: false, error: "Workspace not found" });
  });

  it("VIEWER allowed to read (reads are member-gated, not admin-gated)", async () => {
    signInAs("u", WS_A, "viewer");
    const now = new Date("2026-07-06T00:00:00Z");
    h.db.rule.findMany.mockResolvedValue([
      {
        id: RULE_A,
        workspaceId: WS_A,
        boardId: null,
        name: "R",
        description: null,
        enabled: true,
        triggerType: "card-created",
        triggerConfig: {},
        actions: [{ type: "set-priority", priority: "HIGH" }],
        position: 1024,
        createdBy: "u",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const r = await listRulesAction({ workspaceId: WS_A });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.rules).toHaveLength(1);
      expect(r.rules[0].createdAt).toBe(now.toISOString());
    }
    // Isolation: query scoped to the requested workspace.
    expect(h.db.rule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS_A } }),
    );
  });
});

/* ─── getRuleExecutionLogAction (any member) ────────────────────────── */

describe("getRuleExecutionLogAction (any workspace member)", () => {
  it("non-member denied", async () => {
    signInBare("u");
    const r = await getRuleExecutionLogAction({ workspaceId: WS_A });
    expect(r).toEqual({ success: false, error: "Workspace not found" });
  });

  it("member allowed; logs scoped to the workspace by denormalized workspaceId", async () => {
    signInAs("u", WS_A, "viewer");
    const at = new Date("2026-07-06T01:00:00Z");
    h.db.ruleExecutionLog.findMany.mockResolvedValue([
      {
        id: "log-1",
        ruleId: RULE_A,
        ruleName: "R",
        chainId: null,
        chainDepth: 0,
        cardId: null,
        actionType: "set-priority",
        triggerType: "card-created",
        status: "success",
        error: null,
        executedAt: at,
      },
    ]);
    const r = await getRuleExecutionLogAction({ workspaceId: WS_A });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.logs[0]).toMatchObject({ id: "log-1", ruleName: "R", executedAt: at.toISOString() });
    }
    expect(h.db.ruleExecutionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_A }) }),
    );
  });

  it("orphaned log (rule deleted → ruleId null) still returns with its denormalized ruleName", async () => {
    signInAs("u", WS_A, "viewer");
    const at = new Date("2026-07-06T01:00:00Z");
    h.db.ruleExecutionLog.findMany.mockResolvedValue([
      {
        id: "log-orphan",
        ruleId: null,
        ruleName: "Deleted but remembered",
        chainId: null,
        chainDepth: 0,
        cardId: null,
        actionType: "sequence",
        triggerType: "card-created",
        status: "success",
        error: null,
        executedAt: at,
      },
    ]);
    const r = await getRuleExecutionLogAction({ workspaceId: WS_A });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.logs[0]).toMatchObject({
        id: "log-orphan",
        ruleId: null,
        ruleName: "Deleted but remembered",
      });
    }
  });
});

/* ─── getBoardAutomationDataAction (any member; US-067) ─────────────── */

describe("getBoardAutomationDataAction (board-level modal read)", () => {
  it("A1 auth: signed out → throws, view never loaded", async () => {
    signOut();
    await expect(getBoardAutomationDataAction({ boardId: BOARD_A })).rejects.toThrow();
    expect(h.loadAutomationView).not.toHaveBeenCalled();
  });

  it("validation: a malformed board id → Board not found, board never resolved", async () => {
    signInAs("u", WS_A, "admin");
    const r = await getBoardAutomationDataAction({ boardId: "not-a-uuid" });
    expect(r).toEqual({ success: false, error: "Board not found" });
    expect(h.getBoardById).not.toHaveBeenCalled();
    expect(h.loadAutomationView).not.toHaveBeenCalled();
  });

  it("not found: unknown board → Board not found, membership never checked", async () => {
    signInAs("u", WS_A, "admin");
    h.getBoardById.mockResolvedValue(null);
    const r = await getBoardAutomationDataAction({ boardId: BOARD_A });
    expect(r).toEqual({ success: false, error: "Board not found" });
    expect(h.loadAutomationView).not.toHaveBeenCalled();
  });

  it("A3 isolation: a non-member of the board's workspace is denied (not-found posture)", async () => {
    signInBare("u"); // authed, but member of no workspace
    h.getBoardById.mockResolvedValue({ id: BOARD_A, workspaceId: WS_A, archivedAt: null });
    const r = await getBoardAutomationDataAction({ boardId: BOARD_A });
    expect(r).toEqual({ success: false, error: "Board not found" });
    expect(h.loadAutomationView).not.toHaveBeenCalled();
  });

  it("member (viewer): allowed to read, canManage=false, view scoped to the board", async () => {
    signInAs("u", WS_A, "viewer");
    h.getBoardById.mockResolvedValue({ id: BOARD_A, workspaceId: WS_A, archivedAt: null });
    const r = await getBoardAutomationDataAction({ boardId: BOARD_A });
    expect(r).toMatchObject({ success: true, workspaceId: WS_A, canManage: false });
    // Workspace derived from the board (never trusted from the client), and the
    // view is board-scoped so it returns board-applicable rules only.
    expect(h.loadAutomationView).toHaveBeenCalledWith(WS_A, { boardId: BOARD_A });
  });

  it("admin: canManage=true (mutation affordances enabled)", async () => {
    signInAs("u", WS_A, "admin");
    h.getBoardById.mockResolvedValue({ id: BOARD_A, workspaceId: WS_A, archivedAt: null });
    const r = await getBoardAutomationDataAction({ boardId: BOARD_A });
    expect(r).toMatchObject({ success: true, canManage: true });
  });
});

/* ─── dryRunRulesAction (any member, no mutation) ───────────────────── */

describe("dryRunRulesAction (any workspace member; no mutation)", () => {
  it("non-member denied", async () => {
    signInBare("u");
    const r = await dryRunRulesAction({ workspaceId: WS_A, triggerType: "card-created", event: {} });
    expect(r).toEqual({ success: false, error: "Workspace not found" });
  });

  it("member sees which enabled rules would fire (pure matcher, no writes)", async () => {
    signInAs("u", WS_A, "viewer");
    h.db.rule.findMany.mockResolvedValue([
      { id: RULE_A, name: "Match", triggerType: "card-created", triggerConfig: {} },
      { id: "r2", name: "NoMatch", triggerType: "card-created", triggerConfig: { boardId: BOARD_B } },
    ]);
    const r = await dryRunRulesAction({
      workspaceId: WS_A,
      triggerType: "card-created",
      event: { boardId: BOARD_A },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.matches).toEqual([{ ruleId: RULE_A, name: "Match" }]);
    }
    // Isolation: the rule query is scoped to the requested workspace + trigger.
    expect(h.db.rule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_A, triggerType: "card-created", enabled: true }),
      }),
    );
    expectNoWrites(...writeSeams);
  });
});
