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
    db: {
      workspace: { findUnique: vi.fn() },
      workspaceMember: { findFirst: vi.fn() },
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({ auth: { api: {} } }));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/analytics/engine", () => ({ getWorkspaceAnalytics: h.getWorkspaceAnalytics }));

import {
  getWorkspaceAnalyticsAction,
  exportWorkspaceAnalyticsAction,
} from "@/app/(authenticated)/(dashboard)/workspace/[slug]/dashboard/actions";

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
