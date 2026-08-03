/**
 * US-067 — loadAutomationView query-shape tests.
 *
 * The board-level automation modal and the workspace automation page share this
 * loader. The load-bearing behavior is the SCOPE: a board view must return the
 * rules that fire on that board (`boardId ∈ {board, null}`) and an execution log
 * scoped to exactly those rules; a workspace view returns everything. These
 * assert the `where` clauses the DB is asked for, with a mocked Prisma client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  board: { findMany: vi.fn() },
  rule: { findMany: vi.fn() },
  ruleExecutionLog: { findMany: vi.fn() },
}));

const mockMembers = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ default: mockDb, db: mockDb }));
vi.mock("@/lib/workspace-members", () => ({
  getWorkspaceMembersForManagement: mockMembers,
}));

const WS = "A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6";
const BOARD = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.board.findMany.mockResolvedValue([]);
  mockMembers.mockResolvedValue([]);
  mockDb.rule.findMany.mockResolvedValue([]);
  mockDb.ruleExecutionLog.findMany.mockResolvedValue([]);
});

describe("loadAutomationView — workspace scope (no boardId)", () => {
  it("queries rules and logs by workspaceId alone", async () => {
    const { loadAutomationView } = await import("./view");
    await loadAutomationView(WS);

    expect(mockDb.rule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS } }),
    );
    for (const call of mockDb.ruleExecutionLog.findMany.mock.calls) {
      expect(call[0].where).toEqual({ workspaceId: WS });
    }
  });
});

describe("loadAutomationView — board scope", () => {
  it("filters rules to boardId ∈ {board, null} (workspace-wide rules fire here too)", async () => {
    const { loadAutomationView } = await import("./view");
    await loadAutomationView(WS, { boardId: BOARD });

    expect(mockDb.rule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: WS, OR: [{ boardId: BOARD }, { boardId: null }] },
      }),
    );
  });

  it("scopes the execution log to exactly the shown rule ids", async () => {
    mockDb.rule.findMany.mockResolvedValue([
      { id: "r1", name: "A", description: null, enabled: true, boardId: BOARD, triggerType: "card-created", triggerConfig: {}, actions: [], board: { title: "B" } },
      { id: "r2", name: "C", description: null, enabled: true, boardId: null, triggerType: "card-created", triggerConfig: {}, actions: [], board: null },
    ]);
    const { loadAutomationView } = await import("./view");
    await loadAutomationView(WS, { boardId: BOARD });

    for (const call of mockDb.ruleExecutionLog.findMany.mock.calls) {
      expect(call[0].where).toEqual({ workspaceId: WS, ruleId: { in: ["r1", "r2"] } });
    }
  });

  it("empty rule set → log query uses an empty id set (returns nothing, excludes orphaned logs)", async () => {
    mockDb.rule.findMany.mockResolvedValue([]);
    const { loadAutomationView } = await import("./view");
    await loadAutomationView(WS, { boardId: BOARD });

    for (const call of mockDb.ruleExecutionLog.findMany.mock.calls) {
      expect(call[0].where).toEqual({ workspaceId: WS, ruleId: { in: [] } });
    }
  });
});
