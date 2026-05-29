import { $Enums } from "@/app/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  workspace: {
    findUnique: vi.fn(),
  },
  board: {
    findMany: vi.fn(),
  },
  cardHistoryEvent: {
    findMany: vi.fn(),
  },
  card: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: mockDb,
  db: mockDb,
}));

import { getWorkspaceAnalytics } from "./engine";

type TestHistoryEvent = {
  sequence: bigint;
  cardId: string;
  eventType: $Enums.CardHistoryEventType;
  occurredAt: Date;
  metadata: Record<string, unknown>;
};

function utcDate(value: string): Date {
  return new Date(value);
}

function historyEvent(
  sequence: number,
  cardId: string,
  eventType: $Enums.CardHistoryEventType,
  occurredAt: string,
  metadata: Record<string, unknown>,
): TestHistoryEvent {
  return {
    sequence: BigInt(sequence),
    cardId,
    eventType,
    occurredAt: utcDate(occurredAt),
    metadata,
  };
}

function setMockWorkspace(analyticsLaunchAt: Date | null) {
  mockDb.workspace.findUnique.mockResolvedValue({
    timezone: "UTC",
    analyticsLaunchAt,
  });
}

function setMockBoards(boardIds: string[]) {
  mockDb.board.findMany.mockResolvedValue(
    boardIds.map((id) => ({
      id,
    })),
  );
}

function setMockCards(cardTitles: Record<string, string>) {
  mockDb.card.findMany.mockResolvedValue(
    Object.entries(cardTitles).map(([id, title]) => ({
      id,
      title,
    })),
  );
}

function setMockHistory(events: TestHistoryEvent[]) {
  mockDb.cardHistoryEvent.findMany.mockResolvedValue(events);
}

describe("getWorkspaceAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockWorkspace(utcDate("2025-12-01T00:00:00.000Z"));
    setMockBoards(["board-1"]);
    setMockCards({
      "card-1": "Implement analytics",
      "card-2": "Unestimated follow-up",
    });
  });

  it("computes burndown, lead time, late completion, reopen rate, overdue, and coverage from history", async () => {
    setMockHistory([
      historyEvent(
        1,
        "card-1",
        $Enums.CardHistoryEventType.CARD_CREATED,
        "2026-01-01T09:00:00.000Z",
        {
          listId: "todo",
          listIsDone: false,
          estimateHours: 4,
          dueDate: "2026-01-03T00:00:00.000Z",
          memberIds: ["user-1"],
          archivedAt: null,
          deletedAt: null,
        },
      ),
      historyEvent(
        2,
        "card-2",
        $Enums.CardHistoryEventType.CARD_CREATED,
        "2026-01-02T09:00:00.000Z",
        {
          listId: "todo",
          listIsDone: false,
          estimateHours: null,
          dueDate: "2026-01-03T00:00:00.000Z",
          memberIds: ["user-2"],
          archivedAt: null,
          deletedAt: null,
        },
      ),
      historyEvent(
        3,
        "card-1",
        $Enums.CardHistoryEventType.ESTIMATE_CHANGED,
        "2026-01-03T10:00:00.000Z",
        {
          previousEstimateHours: 4,
          nextEstimateHours: 8,
          memberIds: ["user-1"],
        },
      ),
      historyEvent(
        4,
        "card-1",
        $Enums.CardHistoryEventType.CARD_COMPLETED,
        "2026-01-04T09:00:00.000Z",
        {
          listId: "done",
          estimateHours: 8,
          dueDate: "2026-01-03T00:00:00.000Z",
          memberIds: ["user-1"],
          firstCompletion: true,
        },
      ),
      historyEvent(
        5,
        "card-1",
        $Enums.CardHistoryEventType.CARD_REOPENED,
        "2026-01-05T09:00:00.000Z",
        {
          listId: "todo",
          dueDate: "2026-01-03T00:00:00.000Z",
          memberIds: ["user-1"],
        },
      ),
    ]);

    const analytics = await getWorkspaceAnalytics({
      workspaceId: "workspace-1",
      filters: {
        from: utcDate("2026-01-01T00:00:00.000Z"),
        to: utcDate("2026-01-05T00:00:00.000Z"),
      },
    });

    // Burndown: reopened card becomes active again with its estimate of 8
    expect(analytics.burndown.map((point) => point.remainingHours)).toEqual([
      4,
      4,
      8,
      0,
      8,
    ]);
    expect(analytics.burndown.map((point) => point.idealHours)).toEqual([
      4,
      3,
      2,
      1,
      0,
    ]);
    // Remaining hours reflects reopened card
    expect(analytics.remainingHours.current).toBe(8);
    // Lead time uses first completion, not affected by reopen
    expect(analytics.leadTime.median.current).toBe(72);
    expect(analytics.leadTime.average.current).toBe(72);
    expect(analytics.leadTime.rows).toEqual([
      expect.objectContaining({
        cardId: "card-1",
        cardTitle: "Implement analytics",
        leadTimeHours: 72,
        wasLate: true,
      }),
    ]);
    expect(analytics.completedLate.current).toBe(1);
    expect(analytics.reopenRate.current).toBe(100);
    // Both card-1 (reopened, due Jan 3) and card-2 (active, due Jan 3) are overdue
    expect(analytics.overdue.current).toBe(2);
    // card-1 is active (reopened, estimated), card-2 is active (unestimated)
    expect(analytics.estimationCoverage.current).toBe(50);
    expect(analytics.estimationCoverage.estimatedCount).toBe(1);
    expect(analytics.estimationCoverage.unestimatedCount).toBe(1);
    expect(analytics.launchBoundary.selectedRangeCrossesBoundary).toBe(false);
    expect(analytics.remainingHours.lowConfidence).toBe(false);
  });

  it("uses historical member assignment state for member filters", async () => {
    setMockHistory([
      historyEvent(
        1,
        "card-1",
        $Enums.CardHistoryEventType.CARD_CREATED,
        "2026-01-01T09:00:00.000Z",
        {
          listId: "todo",
          listIsDone: false,
          estimateHours: 4,
          dueDate: null,
          memberIds: ["user-1"],
          archivedAt: null,
          deletedAt: null,
        },
      ),
      historyEvent(
        2,
        "card-2",
        $Enums.CardHistoryEventType.CARD_CREATED,
        "2026-01-02T09:00:00.000Z",
        {
          listId: "todo",
          listIsDone: false,
          estimateHours: 8,
          dueDate: null,
          memberIds: ["user-2"],
          archivedAt: null,
          deletedAt: null,
        },
      ),
    ]);

    const analytics = await getWorkspaceAnalytics({
      workspaceId: "workspace-1",
      filters: {
        memberId: "user-1",
        from: utcDate("2026-01-01T00:00:00.000Z"),
        to: utcDate("2026-01-02T00:00:00.000Z"),
      },
    });

    expect(analytics.burndown.map((point) => point.remainingHours)).toEqual([
      4,
      4,
    ]);
    expect(analytics.estimationCoverage.current).toBe(100);
    expect(analytics.estimationCoverage.estimatedCount).toBe(1);
    expect(analytics.estimationCoverage.unestimatedCount).toBe(0);
  });

  it("marks selected ranges and comparisons as low confidence when they cross the launch boundary", async () => {
    setMockWorkspace(utcDate("2026-01-03T00:00:00.000Z"));
    setMockHistory([]);
    setMockCards({});

    const analytics = await getWorkspaceAnalytics({
      workspaceId: "workspace-1",
      filters: {
        from: utcDate("2026-01-01T00:00:00.000Z"),
        to: utcDate("2026-01-05T00:00:00.000Z"),
      },
    });

    expect(analytics.launchBoundary.analyticsLaunchAt?.toISOString()).toBe(
      "2026-01-03T00:00:00.000Z",
    );
    expect(analytics.launchBoundary.selectedRangeCrossesBoundary).toBe(true);
    expect(analytics.launchBoundary.message).toContain(
      "before full analytics history",
    );
    expect(analytics.remainingHours.lowConfidence).toBe(true);
    expect(analytics.leadTime.median.lowConfidence).toBe(true);
    expect(analytics.estimationCoverage.lowConfidence).toBe(true);
  });
});
