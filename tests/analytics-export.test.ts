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

import { exportWorkspaceAnalyticsAction } from "@/app/(authenticated)/(dashboard)/workspace/[slug]/dashboard/actions";
import { generateAnalyticsCSV } from "@/lib/analytics/csv-export";

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
      flow: {
        points: [
          { date: "2026-01-01", created: 1, completed: 0 },
          { date: "2026-01-02", created: 0, completed: 1 },
        ],
        createdTotal: 1,
        completedTotal: 1,
      },
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
            dueDate: new Date("2026-01-03T00:00:00.000Z"),
            wasLate: true,
          },
        ],
        totalCompleted: 1,
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

  function basePayload(overrides: {
    leadTimeRows?: Array<{
      cardId: string;
      cardTitle: string;
      createdAt: string;
      completedAt: string;
      leadTimeHours: number;
      wasLate: boolean;
    }>;
    estimationCoveragePercent?: {
      current: number;
      estimatedCount: number;
      unestimatedCount: number;
    };
  } = {}) {
    return {
      burndown: [],
      kpis: {
        remainingHours: { current: 0, previous: 0, change: 0 },
        medianLeadTimeHours: { current: 0, previous: 0, change: 0 },
        averageLeadTimeHours: { current: 0, previous: 0, change: 0 },
        overdueCount: { current: 0, previous: 0, change: 0 },
        completedLateCount: { current: 0, previous: 0, change: 0 },
        reopenRatePercent: { current: 0, previous: 0, change: 0 },
        estimationCoveragePercent: overrides.estimationCoveragePercent ?? {
          current: 0,
          estimatedCount: 0,
          unestimatedCount: 0,
        },
      },
      leadTimeRows: overrides.leadTimeRows ?? [
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
    };
  }

  it("escapes CSV cells that contain commas and quotes", async () => {
    const csv = await generateAnalyticsCSV(basePayload());

    expect(csv).toContain(
      'card-1,"Ship analytics, phase ""one""",2026-01-01T09:00:00.000Z,2026-01-04T09:00:00.000Z,72.00,true',
    );
  });

  it("prefixes a formula-leading card title so it round-trips as inert text", async () => {
    const csv = await generateAnalyticsCSV(
      basePayload({
        leadTimeRows: [
          {
            cardId: "card-1",
            cardTitle: "=cmd|'/C calc'!A1",
            createdAt: "2026-01-01T09:00:00.000Z",
            completedAt: "2026-01-04T09:00:00.000Z",
            leadTimeHours: 72,
            wasLate: true,
          },
        ],
      }),
    );

    expect(csv).toContain(
      "card-1,'=cmd|'/C calc'!A1,2026-01-01T09:00:00.000Z",
    );
  });

  it("guards +, -, @, tab, and CR leading card titles the same way", async () => {
    const csv = await generateAnalyticsCSV(
      basePayload({
        leadTimeRows: [
          "+1+1",
          "-1+1",
          "@SUM(1,1)",
          "\tsneaky",
          "\rsneaky",
        ].map((cardTitle, i) => ({
          cardId: `card-${i}`,
          cardTitle,
          createdAt: "2026-01-01T09:00:00.000Z",
          completedAt: "2026-01-04T09:00:00.000Z",
          leadTimeHours: 1,
          wasLate: false,
        })),
      }),
    );

    expect(csv).toContain("card-0,'+1+1,");
    expect(csv).toContain("card-1,'-1+1,");
    expect(csv).toContain('card-2,"\'@SUM(1,1)"');
    expect(csv).toContain("card-3,'\tsneaky,");
    // \r also trips the existing quote-wrap check (it's in /[",\n\r]/), so
    // the guarded cell is additionally quoted, same as a comma/quote would be.
    expect(csv).toContain('card-4,"\'\rsneaky"');
  });

  it("keeps an embedded newline in a card title quoted", async () => {
    const csv = await generateAnalyticsCSV(
      basePayload({
        leadTimeRows: [
          {
            cardId: "card-1",
            cardTitle: "Line one\nLine two",
            createdAt: "2026-01-01T09:00:00.000Z",
            completedAt: "2026-01-04T09:00:00.000Z",
            leadTimeHours: 1,
            wasLate: false,
          },
        ],
      }),
    );

    expect(csv).toContain('"Line one\nLine two"');
  });

  it("guards formula-leading Board ID / Member ID header cells (MJ1)", async () => {
    // boardId/memberId come from unvalidated searchParams; before US-062 they were
    // interpolated raw into the header, bypassing csvCell. A spreadsheet must see
    // them as inert text, not a formula.
    const payload = basePayload();
    const csv = await generateAnalyticsCSV({
      ...payload,
      metadata: { ...payload.metadata, boardId: "=1+1", memberId: "+1+1" },
    });

    expect(csv).toContain("Board ID,'=1+1");
    expect(csv).toContain("Member ID,'+1+1");
  });

  it("emits Estimation Coverage as a single quoted column, not split by the embedded comma", async () => {
    const csv = await generateAnalyticsCSV(
      basePayload({
        estimationCoveragePercent: {
          current: 50,
          estimatedCount: 3,
          unestimatedCount: 2,
        },
      }),
    );

    const lines = csv.split("\n");
    const row = lines.find((line) => line.startsWith("Estimation Coverage"));
    expect(row).toBe(
      'Estimation Coverage (%),50.00,-,"Estimated: 3, Unestimated: 2"',
    );
  });
});
