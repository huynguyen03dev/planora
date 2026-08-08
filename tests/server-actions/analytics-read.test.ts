/**
 * US-006 — Read-path isolation for the analytics actions
 * (`workspace/[slug]/dashboard/actions.ts`).
 *
 * These are reads, not mutations, so there is no role gate — the boundary that
 * matters is workspace isolation: a non-member must not read another
 * workspace's analytics. We keep the real `isWorkspaceMember` in the loop and
 * drive the decision via the mocked `db.workspaceMember.findFirst`, then assert
 * the analytics engine (`getWorkspaceAnalytics`) is NOT invoked on denial — i.e.
 * no cross-tenant data is computed or returned.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const WS_A_ID = "A".repeat(31) + "1";

const h = vi.hoisted(() => {
  const state = { callerId: null as string | null, authed: true };
  return {
    state,
    verifySession: vi.fn(async () => {
      if (!state.authed || !state.callerId) throw new Error("NEXT_REDIRECT");
      return { userId: state.callerId };
    }),
    getWorkspaceAnalytics: vi.fn(),
    getLeadTimeRows: vi.fn(),
    db: {
      workspace: { findUnique: vi.fn() },
      workspaceMember: { findFirst: vi.fn() },
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({ auth: { api: {} } }));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/analytics/engine", () => ({
  getWorkspaceAnalytics: h.getWorkspaceAnalytics,
  getLeadTimeRows: h.getLeadTimeRows,
}));

import {
  getWorkspaceAnalyticsAction,
  exportWorkspaceAnalyticsAction,
  loadMoreLeadTimeRowsAction,
} from "@/app/(authenticated)/(dashboard)/workspace/[slug]/dashboard/actions";
import { formData } from "./_harness";

type Filters = Parameters<typeof getWorkspaceAnalyticsAction>[1];
const FILTERS = {} as Filters;

function signIn(userId: string) {
  h.state.authed = true;
  h.state.callerId = userId;
}
function signOut() {
  h.state.authed = false;
  h.state.callerId = null;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.callerId = null;
  h.state.authed = true;
  // The export allow-case stubs the engine, so its downstream CSV shaping throws
  // and is caught+logged by the action. That log is expected — keep it quiet.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each([
  ["getWorkspaceAnalyticsAction", getWorkspaceAnalyticsAction],
  ["exportWorkspaceAnalyticsAction", exportWorkspaceAnalyticsAction],
])("%s — read isolation", (_name, action) => {
  it("A1 auth: signed out → throws, analytics never computed", async () => {
    signOut();
    await expect(action("ws-a", FILTERS)).rejects.toThrow();
    expect(h.getWorkspaceAnalytics).not.toHaveBeenCalled();
  });

  it("A3 isolation: a non-member cannot read the workspace's analytics", async () => {
    signIn("outsider");
    h.db.workspace.findUnique.mockResolvedValue({ id: WS_A_ID, name: "A", timezone: "UTC", analyticsLaunchAt: null });
    h.db.workspaceMember.findFirst.mockResolvedValue(null); // not a member of WS_A
    expect(await action("ws-a", FILTERS)).toEqual({ success: false, error: "Access denied" });
    expect(h.getWorkspaceAnalytics).not.toHaveBeenCalled();
  });

  it("allow: a member reaches the analytics engine for their workspace", async () => {
    // Asserts isolation passed: the engine runs, scoped to the member's
    // workspace. (Export does further post-processing on the result; the read
    // boundary is what this story owns.)
    signIn("member");
    h.db.workspace.findUnique.mockResolvedValue({ id: WS_A_ID, name: "A", timezone: "UTC", analyticsLaunchAt: null });
    h.db.workspaceMember.findFirst.mockResolvedValue({ id: "m" });
    h.getWorkspaceAnalytics.mockResolvedValue({ marker: true });
    await action("ws-a", FILTERS);
    expect(h.getWorkspaceAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_A_ID }),
    );
  });
});

describe("loadMoreLeadTimeRowsAction — read isolation + filter parity", () => {
  // The shared WS_A_ID above is slug-shaped (not a UUID) because the original
  // actions resolve by slug. This action takes a validated UUID workspace id.
  const WS_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const FROM = "2026-02-01T00:00:00.000Z";
  const TO = "2026-02-28T00:00:00.000Z";

  function validFormData(overrides: Record<string, string> = {}) {
    return formData({
      workspaceId: WS_UUID,
      from: FROM,
      to: TO,
      offset: "100",
      limit: "100",
      ...overrides,
    });
  }

  beforeEach(() => {
    h.getLeadTimeRows.mockReset();
  });

  it("A1 auth: signed out → throws, rows never computed", async () => {
    signOut();
    await expect(loadMoreLeadTimeRowsAction(validFormData())).rejects.toThrow();
    expect(h.getLeadTimeRows).not.toHaveBeenCalled();
  });

  it("rejects malformed input before any DB read (validation gate)", async () => {
    signIn("member");

    const badWorkspaceId = await loadMoreLeadTimeRowsAction(
      validFormData({ workspaceId: "not-a-uuid" }),
    );
    expect(badWorkspaceId).toEqual({ success: false, error: "Invalid workspace ID" });

    const badOffset = await loadMoreLeadTimeRowsAction(
      validFormData({ offset: "-5" }),
    );
    expect(badOffset).toEqual({ success: false, error: "Invalid offset" });

    const missingRange = await loadMoreLeadTimeRowsAction(
      validFormData({ from: "", to: "" }),
    );
    expect(missingRange.success).toBe(false);

    expect(h.db.workspace.findUnique).not.toHaveBeenCalled();
    expect(h.getLeadTimeRows).not.toHaveBeenCalled();
  });

  it("allow: a real 32-char Better Auth nanoid workspace id passes the gate (production regression)", async () => {
    signIn("member");
    // Workspaces created through the app carry Better Auth nanoid ids (no
    // dashes) — a z.string().uuid() gate used to reject them with "Invalid
    // workspace ID" before any DB read. The 32-char id must now flow through
    // to the workspace lookup and the analytics engine.
    const NANO_ID = "n".repeat(31) + "1";
    h.db.workspace.findUnique.mockResolvedValue({ id: NANO_ID });
    h.db.workspaceMember.findFirst.mockResolvedValue({ id: "m" });
    h.getLeadTimeRows.mockResolvedValue({
      rows: [],
      hasMore: false,
      totalCompleted: 0,
    });

    const result = await loadMoreLeadTimeRowsAction(
      validFormData({ workspaceId: NANO_ID, offset: "0", limit: "100" }),
    );

    expect(result.success).toBe(true);
    expect(h.db.workspace.findUnique).toHaveBeenCalledWith({
      where: { id: NANO_ID },
      select: { id: true },
    });
    expect(h.getLeadTimeRows).toHaveBeenCalledWith(
      NANO_ID,
      { from: new Date(FROM), to: new Date(TO), includeArchivedBoards: false },
      { offset: 0, limit: 100 },
    );
  });

  it("isolation: a non-member cannot load rows for the workspace", async () => {
    signIn("outsider");
    h.db.workspace.findUnique.mockResolvedValue({ id: WS_UUID });
    h.db.workspaceMember.findFirst.mockResolvedValue(null); // not a member

    const result = await loadMoreLeadTimeRowsAction(validFormData());

    expect(result).toEqual({ success: false, error: "Access denied" });
    expect(h.getLeadTimeRows).not.toHaveBeenCalled();
  });

  it("reports a missing workspace before any row fetch", async () => {
    signIn("member");
    h.db.workspace.findUnique.mockResolvedValue(null);

    const result = await loadMoreLeadTimeRowsAction(validFormData());

    expect(result).toEqual({ success: false, error: "Workspace not found" });
    expect(h.getLeadTimeRows).not.toHaveBeenCalled();
  });

  it("allow: a member gets the next window with the RESOLVED range + filters (parity)", async () => {
    signIn("member");
    h.db.workspace.findUnique.mockResolvedValue({ id: WS_UUID });
    h.db.workspaceMember.findFirst.mockResolvedValue({ id: "m" });
    h.getLeadTimeRows.mockResolvedValue({
      rows: [{ cardId: "c1" }],
      hasMore: false,
      totalCompleted: 101,
    });

    const result = await loadMoreLeadTimeRowsAction(
      validFormData({
        boardId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        memberId: "user-1",
        includeArchivedBoards: "1",
        offset: "100",
      }),
    );

    expect(result).toEqual({
      success: true,
      rows: [{ cardId: "c1" }],
      hasMore: false,
      totalCompleted: 101,
    });
    // The action forwards exactly the range the dashboard rendered (resolved
    // from/to, not a re-derived "now") plus the same board/member/archived
    // filters and the requested window.
    expect(h.getLeadTimeRows).toHaveBeenCalledWith(
      WS_UUID,
      {
        from: new Date(FROM),
        to: new Date(TO),
        boardId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        memberId: "user-1",
        includeArchivedBoards: true,
      },
      { offset: 100, limit: 100 },
    );
  });

  it("allow without optional filters: empty board/member/archived normalize to the default scope", async () => {
    signIn("member");
    h.db.workspace.findUnique.mockResolvedValue({ id: WS_UUID });
    h.db.workspaceMember.findFirst.mockResolvedValue({ id: "m" });
    h.getLeadTimeRows.mockResolvedValue({ rows: [], hasMore: false, totalCompleted: 0 });

    const result = await loadMoreLeadTimeRowsAction(
      validFormData({ offset: "0", limit: "100" }),
    );

    expect(result.success).toBe(true);
    expect(h.getLeadTimeRows).toHaveBeenCalledWith(
      WS_UUID,
      { from: new Date(FROM), to: new Date(TO), includeArchivedBoards: false },
      { offset: 0, limit: 100 },
    );
  });
});
