import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    workspace: {
      findUnique: vi.fn(),
    },
  },
  getWorkspaceAnalytics: vi.fn(),
  isWorkspaceMember: vi.fn(),
  verifySession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: mocks.db,
  db: mocks.db,
}));

vi.mock("@/lib/analytics/engine", () => ({
  getWorkspaceAnalytics: mocks.getWorkspaceAnalytics,
}));

vi.mock("@/lib/authorization", () => ({
  isWorkspaceMember: mocks.isWorkspaceMember,
}));

vi.mock("@/lib/dal", () => ({
  verifySession: mocks.verifySession,
}));

import {
  exportWorkspaceAnalyticsAction,
  generateAnalyticsCSV,
} from "@/app/(authenticated)/(dashboard)/workspace/[slug]/dashboard/actions";

describe("analytics export actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySession.mockResolvedValue({ userId: "user-1" });
    mocks.isWorkspaceMember.mockResolvedValue(true);
    mocks.db.workspace.findUnique.mockResolvedValue({
      id: "workspace-1",
      name: "Workspace",
      timezone: "UTC",
      analyticsLaunchAt: new Date("2025-12-01T00:00:00.000Z"),
    });
  });

  it("serializes export payloads from the same analytics engine output", async () => {
    mocks.getWorkspaceAnalytics.mockResolvedValue({
      filters: {
        workspaceId: "workspace-1",
        workspaceTimezone: "UTC",
        boardId: "board-1",
        memberId: "user-2",
        includeArchivedBoards: true,
        from: new Date("2026-01-01T00:00:00.000Z"),
        to: new Date("2026-01-05T23:59:59.999Z"),
      },
      burndown: [
        { date: "2026-01-01", remainingHours: 8, idealHours: 8 },
        { date: "2026-01-02", remainingHours: 4, idealHours: 6 },
      ],
      leadTime: {
        median: { current: 72, previous: 24, change: 200, lowConfidence: false },
        average: { current: 72, previous: 24, change: 200, lowConfidence: false },
        rows: [
          {
            cardId: "card-1",
            cardTitle: "Ship analytics, phase \"one\"",
            createdAt: new Date("2026-01-01T09:00:00.000Z"),
            completedAt: new Date("2026-01-04T09:00:00.000Z"),
            leadTimeHours: 72,
            wasLate: true,
          },
        ],
      },
      remainingHours: { current: 4, previous: 8, change: -50, lowConfidence: false },
      overdue: { current: 1, previous: 0, change: 100, lowConfidence: false },
      completedLate: { current: 1, previous: 0, change: 100, lowConfidence: false },
      reopenRate: { current: 25, previous: 0, change: 100, lowConfidence: false },
      estimationCoverage: {
        current: 50,
        estimatedCount: 1,
        unestimatedCount: 1,
        previous: 100,
        change: -50,
        lowConfidence: false,
      },
      launchBoundary: {
        analyticsLaunchAt: new Date("2025-12-01T00:00:00.000Z"),
        selectedRangeCrossesBoundary: false,
      },
      comparisonPeriod: {
        from: new Date("2025-12-27T00:00:00.000Z"),
        to: new Date("2025-12-31T23:59:59.999Z"),
      },
    });

    const result = await exportWorkspaceAnalyticsAction("workspace", {
      boardId: "board-1",
      memberId: "user-2",
      includeArchivedBoards: true,
    });

    expect(mocks.getWorkspaceAnalytics).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      filters: {
        boardId: "board-1",
        memberId: "user-2",
        includeArchivedBoards: true,
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error);
    }
    expect(result.data.burndown).toEqual([
      { date: "2026-01-01", remainingHours: 8, idealHours: 8 },
      { date: "2026-01-02", remainingHours: 4, idealHours: 6 },
    ]);
    expect(result.data.kpis.remainingHours).toEqual({
      current: 4,
      previous: 8,
      change: -50,
    });
    expect(result.data.kpis.estimationCoveragePercent).toEqual({
      current: 50,
      estimatedCount: 1,
      unestimatedCount: 1,
    });
    expect(result.data.leadTimeRows).toEqual([
      {
        cardId: "card-1",
        cardTitle: "Ship analytics, phase \"one\"",
        createdAt: "2026-01-01T09:00:00.000Z",
        completedAt: "2026-01-04T09:00:00.000Z",
        leadTimeHours: 72,
        wasLate: true,
      },
    ]);
    expect(result.data.metadata).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        workspaceTimezone: "UTC",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-05T23:59:59.999Z",
        boardId: "board-1",
        memberId: "user-2",
        includeArchivedBoards: true,
      }),
    );
  });

  it("escapes CSV cells that contain commas and quotes", async () => {
    const csv = await generateAnalyticsCSV({
      burndown: [],
      kpis: {
        remainingHours: { current: 0, previous: 0, change: 0 },
        medianLeadTimeHours: { current: 0, previous: 0, change: 0 },
        averageLeadTimeHours: { current: 0, previous: 0, change: 0 },
        overdueCount: { current: 0, previous: 0, change: 0 },
        completedLateCount: { current: 0, previous: 0, change: 0 },
        reopenRatePercent: { current: 0, previous: 0, change: 0 },
        estimationCoveragePercent: {
          current: 0,
          estimatedCount: 0,
          unestimatedCount: 0,
        },
      },
      leadTimeRows: [
        {
          cardId: "card-1",
          cardTitle: "Ship analytics, phase \"one\"",
          createdAt: "2026-01-01T09:00:00.000Z",
          completedAt: "2026-01-04T09:00:00.000Z",
          leadTimeHours: 72,
          wasLate: true,
        },
      ],
      metadata: {
        workspaceId: "workspace-1",
        workspaceTimezone: "UTC",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-05T23:59:59.999Z",
        boardId: null,
        memberId: null,
        includeArchivedBoards: false,
        exportedAt: "2026-01-06T00:00:00.000Z",
      },
    });

    expect(csv).toContain(
      'card-1,"Ship analytics, phase ""one""",2026-01-01T09:00:00.000Z,2026-01-04T09:00:00.000Z,72.00,true',
    );
  });
});
