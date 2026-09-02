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

import { getLeadTimeRows, getWorkspaceAnalytics } from "./engine";

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

// Mirror production's query (engine.ts): filter by `occurredAt <= range.to` and
// order by [sequence asc, occurredAt asc]. Returning ALL events unfiltered would
// hide the fetch-cutoff behavior the streak anchor and flow scans depend on.
function setMockHistory(events: TestHistoryEvent[]) {
  mockDb.cardHistoryEvent.findMany.mockImplementation(
    async (args?: { where?: { occurredAt?: { lte?: Date } } }) => {
      const lte = args?.where?.occurredAt?.lte;
      const visible = lte
        ? events.filter((event) => event.occurredAt.getTime() <= lte.getTime())
        : events;
      return [...visible].sort((a, b) => {
        if (a.sequence !== b.sequence) return a.sequence < b.sequence ? -1 : 1;
        return a.occurredAt.getTime() - b.occurredAt.getTime();
      });
    },
  );
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
    // Streak anchor (US-064 / decision 0021): card-1 was completed then reopened
    // and is currently open, so it is NOT counted as completed — throughput,
    // lead time, and completed-late all drop it. (Pre-US-064 this reported a
    // 72h lead time off the stale first completion.)
    expect(analytics.leadTime.median.current).toBe(0);
    expect(analytics.leadTime.average.current).toBe(0);
    expect(analytics.leadTime.rows).toEqual([]);
    expect(analytics.leadTime.totalCompleted).toBe(0);
    expect(analytics.completedLate.current).toBe(0);
    // reopenRate stays event-based: card-1 reached completion in range
    // (denominator) and was reopened in range (numerator), so the rate is 100%
    // even though the card is no longer counted as completed.
    expect(analytics.reopenRate.current).toBe(100);
    // Both card-1 (reopened, due Jan 3) and card-2 (active, due Jan 3) are overdue
    expect(analytics.overdue.current).toBe(2);
    // card-1 is active (reopened, estimated), card-2 is active (unestimated)
    expect(analytics.estimationCoverage.current).toBe(50);
    expect(analytics.estimationCoverage.estimatedCount).toBe(1);
    expect(analytics.estimationCoverage.unestimatedCount).toBe(1);
    expect(analytics.launchBoundary.selectedRangeCrossesBoundary).toBe(false);
    expect(analytics.remainingHours.lowConfidence).toBe(false);
    // Flow: card-1 created Jan 1, card-2 created Jan 2. card-1's completion is
    // not plotted — it is currently reopened (no current streak).
    expect(analytics.flow.points.map((p) => p.created)).toEqual([1, 1, 0, 0, 0]);
    expect(analytics.flow.points.map((p) => p.completed)).toEqual([0, 0, 0, 0, 0]);
    expect(analytics.flow.createdTotal).toBe(2);
    expect(analytics.flow.completedTotal).toBe(0);
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

  it("treats an unparseable due-date string as no due date, not an Invalid Date (mn3)", async () => {
    // Before the guard, `new Date("not-a-date")` produced an Invalid Date whose
    // every comparison is false — silently dropping the card from the overdue
    // tally instead of treating the bad metadata as "no due date". The card must
    // still be counted (active, estimated) and simply not be flagged overdue.
    setMockCards({ "card-1": "Garbage due date" });
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
          dueDate: "not-a-date",
          memberIds: ["user-1"],
          archivedAt: null,
          deletedAt: null,
        },
      ),
    ]);

    const analytics = await getWorkspaceAnalytics({
      workspaceId: "workspace-1",
      filters: {
        from: utcDate("2026-01-01T00:00:00.000Z"),
        to: utcDate("2026-01-02T00:00:00.000Z"),
      },
    });

    // Not dropped: still active and estimated in coverage / burndown.
    expect(analytics.estimationCoverage.current).toBe(100);
    expect(analytics.estimationCoverage.estimatedCount).toBe(1);
    expect(analytics.remainingHours.current).toBe(4);
    // Unparseable due date → no due date → never overdue.
    expect(analytics.overdue.current).toBe(0);
  });

  it("caps the lead-time detail rows at the newest completions, not creation order (MJ2)", async () => {
    // Regression for the cap-before-sort bug: rows were capped at
    // MAX_LEAD_TIME_ROWS (100) in context.cardIds (creation) order, THEN sorted
    // by completedAt — so with >100 completions the table showed an arbitrary
    // slice that disagreed with totalCompleted. It must now show the *newest*
    // completions.
    const TOTAL = 120; // > MAX_LEAD_TIME_ROWS
    const createdEvents: TestHistoryEvent[] = [];
    const completedEvents: TestHistoryEvent[] = [];
    const titles: Record<string, string> = {};
    const completedBaseMs = Date.parse("2026-02-01T00:00:00.000Z");

    for (let i = 0; i < TOTAL; i += 1) {
      const id = `card-${String(i).padStart(3, "0")}`;
      titles[id] = `Card ${i}`;
      // CARD_CREATED events carry sequence 1..TOTAL in id order, so
      // context.cardIds is card-000..card-119 (creation order).
      createdEvents.push(
        historyEvent(
          i + 1,
          id,
          $Enums.CardHistoryEventType.CARD_CREATED,
          "2026-01-01T00:00:00.000Z",
          {
            listId: "todo",
            listIsDone: false,
            estimateHours: 1,
            dueDate: null,
            memberIds: ["user-1"],
            archivedAt: null,
            deletedAt: null,
          },
        ),
      );
      // completedAt increases with i, so the 100 newest completions are
      // card-020..card-119. The old cap kept card-000..card-099 (creation order),
      // which wrongly dropped the 20 newest and kept the 20 oldest.
      const completedAt = new Date(completedBaseMs + i * 3_600_000).toISOString();
      completedEvents.push(
        historyEvent(
          TOTAL + 1 + i,
          id,
          $Enums.CardHistoryEventType.CARD_COMPLETED,
          completedAt,
          {
            listId: "done",
            estimateHours: 1,
            dueDate: null,
            memberIds: ["user-1"],
            firstCompletion: true,
          },
        ),
      );
    }

    setMockCards(titles);
    setMockHistory([...createdEvents, ...completedEvents]);

    const analytics = await getWorkspaceAnalytics({
      workspaceId: "workspace-1",
      filters: {
        from: utcDate("2026-01-01T00:00:00.000Z"),
        to: utcDate("2026-07-01T00:00:00.000Z"),
      },
    });

    const returnedIds = analytics.leadTime.rows.map((row) => row.cardId);

    expect(analytics.leadTime.rows).toHaveLength(100);
    // The table count reports every completion; the two must be consistent.
    expect(analytics.leadTime.totalCompleted).toBe(TOTAL);
    // Newest-completed first, oldest-of-the-kept last.
    expect(returnedIds[0]).toBe("card-119");
    expect(returnedIds[99]).toBe("card-020");
    // The 20 oldest completions must NOT appear (the bug would include them).
    expect(returnedIds).not.toContain("card-000");
    expect(returnedIds).not.toContain("card-019");
    // Strictly sorted by completedAt descending.
    const times = analytics.leadTime.rows.map((row) => row.completedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe("lead-time rows pagination (offset/limit/hasMore)", () => {
  // N cards, completedAt increasing with index, so the completedAt-descending
  // order is card-(N-1) .. card-0 (mirrors the MJ2 fixture shape).
  function seedCompletedCards(total: number) {
    const createdEvents: TestHistoryEvent[] = [];
    const completedEvents: TestHistoryEvent[] = [];
    const titles: Record<string, string> = {};
    const completedBaseMs = Date.parse("2026-02-01T00:00:00.000Z");

    for (let i = 0; i < total; i += 1) {
      const id = `card-${String(i).padStart(3, "0")}`;
      titles[id] = `Card ${i}`;
      createdEvents.push(
        historyEvent(
          i + 1,
          id,
          $Enums.CardHistoryEventType.CARD_CREATED,
          "2026-01-01T00:00:00.000Z",
          {
            listId: "todo",
            listIsDone: false,
            estimateHours: 1,
            dueDate: null,
            memberIds: ["user-1"],
            archivedAt: null,
            deletedAt: null,
          },
        ),
      );
      completedEvents.push(
        historyEvent(
          total + 1 + i,
          id,
          $Enums.CardHistoryEventType.CARD_COMPLETED,
          new Date(completedBaseMs + i * 3_600_000).toISOString(),
          {
            listId: "done",
            estimateHours: 1,
            dueDate: null,
            memberIds: ["user-1"],
            firstCompletion: true,
          },
        ),
      );
    }

    setMockCards(titles);
    setMockHistory([...createdEvents, ...completedEvents]);
  }

  const RANGE = {
    from: utcDate("2026-01-01T00:00:00.000Z"),
    to: utcDate("2026-07-01T00:00:00.000Z"),
  };

  beforeEach(() => {
    setMockWorkspace(utcDate("2025-12-01T00:00:00.000Z"));
    setMockBoards(["board-1"]);
  });

  it("keeps the historical default: offset 0, limit 100, KPIs from ALL completions (backward compat)", async () => {
    seedCompletedCards(120);

    const analytics = await getWorkspaceAnalytics({
      workspaceId: "workspace-1",
      filters: RANGE,
    });

    expect(analytics.leadTime.rows).toHaveLength(100);
    expect(analytics.leadTime.hasMore).toBe(true);
    expect(analytics.leadTime.totalCompleted).toBe(120);
    expect(analytics.leadTime.rows[0].cardId).toBe("card-119");
    expect(analytics.leadTime.rows[99].cardId).toBe("card-020");
    // The row window must not touch the KPI population: median is computed
    // over all 120 lead times, not the 100 displayed rows.
    expect(analytics.leadTime.median.current).toBe(803.5);
  });

  it("applies an offset/limit window over the completedAt-descending set", async () => {
    seedCompletedCards(120);

    const analytics = await getWorkspaceAnalytics({
      workspaceId: "workspace-1",
      filters: RANGE,
      leadTimeRows: { offset: 40, limit: 40 },
    });

    const returnedIds = analytics.leadTime.rows.map((row) => row.cardId);
    expect(returnedIds).toHaveLength(40);
    expect(returnedIds[0]).toBe("card-079");
    expect(returnedIds[39]).toBe("card-040");
    expect(analytics.leadTime.hasMore).toBe(true);
    expect(analytics.leadTime.totalCompleted).toBe(120);
    // KPIs still cover every completion in range, not the window.
    expect(analytics.leadTime.median.current).toBe(803.5);
  });

  it("hasMore flips exactly at the window boundary", async () => {
    seedCompletedCards(120);

    const exactEnd = await getWorkspaceAnalytics({
      workspaceId: "workspace-1",
      filters: RANGE,
      leadTimeRows: { offset: 80, limit: 40 },
    });
    expect(exactEnd.leadTime.rows).toHaveLength(40);
    expect(exactEnd.leadTime.hasMore).toBe(false);

    const oneShort = await getWorkspaceAnalytics({
      workspaceId: "workspace-1",
      filters: RANGE,
      leadTimeRows: { offset: 80, limit: 39 },
    });
    expect(oneShort.leadTime.rows).toHaveLength(39);
    expect(oneShort.leadTime.hasMore).toBe(true);
    expect(oneShort.leadTime.rows[38].cardId).toBe("card-001");
  });

  it("window past the end yields an empty page with hasMore false", async () => {
    seedCompletedCards(50);

    const analytics = await getWorkspaceAnalytics({
      workspaceId: "workspace-1",
      filters: RANGE,
      leadTimeRows: { offset: 100, limit: 100 },
    });

    expect(analytics.leadTime.rows).toHaveLength(0);
    expect(analytics.leadTime.hasMore).toBe(false);
    expect(analytics.leadTime.totalCompleted).toBe(50);
  });

  it("getLeadTimeRows serves the same window with window-independent totals", async () => {
    seedCompletedCards(120);

    const page = await getLeadTimeRows(
      "workspace-1",
      RANGE,
      { offset: 100, limit: 100 },
    );

    const returnedIds = page.rows.map((row) => row.cardId);
    expect(returnedIds).toHaveLength(20);
    expect(returnedIds[0]).toBe("card-019");
    expect(returnedIds[19]).toBe("card-000");
    expect(page.hasMore).toBe(false);
    expect(page.totalCompleted).toBe(120);
    // Rows remain strictly sorted by completedAt descending.
    const times = page.rows.map((row) => row.completedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("getLeadTimeRows honors memberId like the dashboard filters", async () => {
    // card-000 is completed by user-2 only; every other card by user-1.
    const createdEvents: TestHistoryEvent[] = [];
    const completedEvents: TestHistoryEvent[] = [];
    const titles: Record<string, string> = { "card-000": "A", "card-001": "B" };
    createdEvents.push(
      historyEvent(1, "card-000", $Enums.CardHistoryEventType.CARD_CREATED, "2026-01-01T00:00:00.000Z", {
        listId: "todo",
        listIsDone: false,
        estimateHours: 1,
        dueDate: null,
        memberIds: ["user-1", "user-2"],
        archivedAt: null,
        deletedAt: null,
      }),
    );
    createdEvents.push(
      historyEvent(2, "card-001", $Enums.CardHistoryEventType.CARD_CREATED, "2026-01-02T00:00:00.000Z", {
        listId: "todo",
        listIsDone: false,
        estimateHours: 1,
        dueDate: null,
        memberIds: ["user-1"],
        archivedAt: null,
        deletedAt: null,
      }),
    );
    completedEvents.push(
      historyEvent(
        3,
        "card-000",
        $Enums.CardHistoryEventType.CARD_COMPLETED,
        "2026-02-01T00:00:00.000Z",
        { listId: "done", estimateHours: 1, dueDate: null, memberIds: ["user-2"], firstCompletion: true },
      ),
    );
    completedEvents.push(
      historyEvent(
        4,
        "card-001",
        $Enums.CardHistoryEventType.CARD_COMPLETED,
        "2026-02-02T00:00:00.000Z",
        { listId: "done", estimateHours: 1, dueDate: null, memberIds: ["user-1"], firstCompletion: true },
      ),
    );
    setMockCards(titles);
    setMockHistory([...createdEvents, ...completedEvents]);

    const all = await getLeadTimeRows("workspace-1", RANGE, {});
    expect(all.totalCompleted).toBe(2);
    expect(all.rows.map((row) => row.cardId)).toEqual(["card-001", "card-000"]);

    const memberOnly = await getLeadTimeRows(
      "workspace-1",
      { ...RANGE, memberId: "user-1" },
      {},
    );
    expect(memberOnly.totalCompleted).toBe(1);
    expect(memberOnly.rows.map((row) => row.cardId)).toEqual(["card-001"]);
  });
});

describe("completion streak anchor (US-064 / decision 0021)", () => {
  const CREATED = $Enums.CardHistoryEventType.CARD_CREATED;
  const COMPLETED = $Enums.CardHistoryEventType.CARD_COMPLETED;
  const REOPENED = $Enums.CardHistoryEventType.CARD_REOPENED;

  const created = (seq: number, cardId: string, at: string) =>
    historyEvent(seq, cardId, CREATED, at, {
      listId: "todo",
      estimateHours: 4,
      dueDate: null,
      memberIds: [],
      archivedAt: null,
      deletedAt: null,
    });
  const completed = (seq: number, cardId: string, at: string) =>
    historyEvent(seq, cardId, COMPLETED, at, {
      listId: "done",
      estimateHours: 4,
      dueDate: null,
      memberIds: [],
      // Deliberately kept true across streaks: the anchor must NOT rely on this
      // vestigial flag (US-064).
      firstCompletion: true,
    });
  const reopened = (seq: number, cardId: string, at: string) =>
    historyEvent(seq, cardId, REOPENED, at, {
      listId: "todo",
      dueDate: null,
      memberIds: [],
    });

  const analyze = (fromISO: string, toISO: string) =>
    getWorkspaceAnalytics({
      workspaceId: "workspace-1",
      filters: { from: utcDate(fromISO), to: utcDate(toISO) },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    // Launch boundary well before the ranges so nothing is low-confidence.
    setMockWorkspace(utcDate("2025-12-01T00:00:00.000Z"));
    setMockBoards(["board-1"]);
    setMockCards({ "card-1": "Card One" });
  });

  it("(a) a single completion is counted, cycle-time = created → completion", async () => {
    setMockHistory([
      created(1, "card-1", "2026-01-01T09:00:00.000Z"),
      completed(2, "card-1", "2026-01-04T09:00:00.000Z"),
    ]);

    const a = await analyze("2026-01-01T00:00:00.000Z", "2026-01-10T00:00:00.000Z");
    expect(a.leadTime.totalCompleted).toBe(1);
    expect(a.leadTime.median.current).toBe(72); // 3 days
    expect(a.flow.completedTotal).toBe(1);
  });

  it("(b) complete → reopen (still open) is NOT counted as completed", async () => {
    setMockHistory([
      created(1, "card-1", "2026-01-01T09:00:00.000Z"),
      completed(2, "card-1", "2026-01-02T09:00:00.000Z"),
      reopened(3, "card-1", "2026-01-03T09:00:00.000Z"),
    ]);

    const a = await analyze("2026-01-01T00:00:00.000Z", "2026-01-10T00:00:00.000Z");
    expect(a.leadTime.totalCompleted).toBe(0);
    expect(a.leadTime.median.current).toBe(0);
    expect(a.flow.completedTotal).toBe(0);
  });

  it("(c) complete → reopen → complete anchors on the LATER completion", async () => {
    setMockHistory([
      created(1, "card-1", "2026-01-01T09:00:00.000Z"),
      completed(2, "card-1", "2026-01-02T09:00:00.000Z"),
      reopened(3, "card-1", "2026-01-03T09:00:00.000Z"),
      completed(4, "card-1", "2026-01-05T09:00:00.000Z"),
    ]);

    const a = await analyze("2026-01-01T00:00:00.000Z", "2026-01-10T00:00:00.000Z");
    expect(a.leadTime.totalCompleted).toBe(1);
    // created Jan 1 09:00 → current-streak completion Jan 5 09:00 = 96h (not 24h).
    expect(a.leadTime.median.current).toBe(96);
  });

  it("(d) accidental early tick then real completion day 30 → cycle-time = 30d, not ~0", async () => {
    setMockHistory([
      created(1, "card-1", "2026-01-01T00:00:00.000Z"),
      completed(2, "card-1", "2026-01-01T01:00:00.000Z"),
      reopened(3, "card-1", "2026-01-01T02:00:00.000Z"),
      completed(4, "card-1", "2026-01-31T00:00:00.000Z"),
    ]);

    const a = await analyze("2026-01-01T00:00:00.000Z", "2026-02-05T00:00:00.000Z");
    expect(a.leadTime.totalCompleted).toBe(1);
    expect(a.leadTime.median.current).toBe(30 * 24); // 720h
    // (f) flow plots only the day-30 completion, not the day-1 tick.
    const nonZeroCompletedDays = a.flow.points.filter((p) => p.completed > 0);
    expect(nonZeroCompletedDays).toHaveLength(1);
    expect(a.flow.completedTotal).toBe(1);
  });

  it("(e) point-in-time replay: overdue reflects the streak state as-of the query date", async () => {
    // Point-in-time correctness lives in reconstructCardStateAtTime (overdue /
    // burndown / coverage), which replays events up to `at`. A card completed
    // before its reopen must read as completed (not overdue) as-of a date between
    // them, and as open (overdue, past-due) as-of a date after the reopen.
    setMockHistory([
      historyEvent(1, "card-1", CREATED, "2026-01-01T09:00:00.000Z", {
        listId: "todo",
        estimateHours: 4,
        dueDate: "2026-01-02T00:00:00.000Z",
        memberIds: [],
        archivedAt: null,
        deletedAt: null,
      }),
      historyEvent(2, "card-1", COMPLETED, "2026-01-03T09:00:00.000Z", {
        listId: "done",
        estimateHours: 4,
        dueDate: "2026-01-02T00:00:00.000Z",
        memberIds: [],
        firstCompletion: true,
      }),
      reopened(3, "card-1", "2026-01-05T09:00:00.000Z"),
    ]);

    // As-of Jan 4 (after completion, before reopen): completed → not overdue.
    const before = await analyze("2026-01-01T00:00:00.000Z", "2026-01-04T00:00:00.000Z");
    expect(before.overdue.current).toBe(0);

    // As-of Jan 6 (after reopen): open + past due → overdue.
    const after = await analyze("2026-01-01T00:00:00.000Z", "2026-01-06T00:00:00.000Z");
    expect(after.overdue.current).toBe(1);
  });

  it("reopenRate (blocker): a complete → reopen (still open) card keeps the rate at 100%", async () => {
    setMockHistory([
      created(1, "card-1", "2026-01-01T09:00:00.000Z"),
      completed(2, "card-1", "2026-01-02T09:00:00.000Z"),
      reopened(3, "card-1", "2026-01-03T09:00:00.000Z"),
    ]);

    const a = await analyze("2026-01-01T00:00:00.000Z", "2026-01-10T00:00:00.000Z");
    // Not counted as completed (throughput 0)...
    expect(a.leadTime.totalCompleted).toBe(0);
    // ...but stays in BOTH the reopen denominator (completed in range) and the
    // numerator (reopened in range), so the rate does not collapse to 0.
    expect(a.reopenRate.current).toBe(100);
  });

  it("(regression) previous-period throughput is not polluted by a reopen in the current period", async () => {
    // Card completed inside the PREVIOUS window (Jan 5–14) then reopened inside
    // the CURRENT window (Jan 15–24). The single event fetch has cutoff = current
    // range.to, so before the asOf bound the previous-period anchor scan saw the
    // Jan 18 reopen and wrongly dropped the card — collapsing leadTime.previous
    // to 0. As-of Jan 14 the card was genuinely complete (anchor Jan 10).
    setMockCards({ "card-1": "Card One" });
    setMockHistory([
      created(1, "card-1", "2026-01-06T09:00:00.000Z"),
      completed(2, "card-1", "2026-01-10T09:00:00.000Z"),
      reopened(3, "card-1", "2026-01-18T09:00:00.000Z"),
    ]);

    const a = await analyze("2026-01-15T00:00:00.000Z", "2026-01-24T00:00:00.000Z");
    // Current period: reopened and open → not counted.
    expect(a.leadTime.median.current).toBe(0);
    // Previous period: complete as-of its own end → counted, lead time Jan 6→Jan 10 = 96h.
    expect(a.leadTime.median.previous).toBe(96);
    expect(a.leadTime.average.previous).toBe(96);
  });

  it("(regression) reopenRate cannot exceed 100% when a completion predates the range", async () => {
    // A + B completed BEFORE the range but reopened inside it (numerator); only C
    // completed in-range (old denominator). Before the union fix the numerator
    // (A, B) exceeded the denominator (C) → 200%. The fix unions the reopened
    // cards into the denominator, capping the rate at 100%.
    setMockCards({ "card-a": "A", "card-b": "B", "card-c": "C" });
    setMockHistory([
      created(1, "card-a", "2025-12-28T09:00:00.000Z"),
      completed(2, "card-a", "2025-12-30T09:00:00.000Z"),
      created(3, "card-b", "2026-01-01T09:00:00.000Z"),
      completed(4, "card-b", "2026-01-02T09:00:00.000Z"),
      created(5, "card-c", "2026-01-07T09:00:00.000Z"),
      completed(6, "card-c", "2026-01-08T09:00:00.000Z"),
      reopened(7, "card-a", "2026-01-10T09:00:00.000Z"),
      reopened(8, "card-b", "2026-01-11T09:00:00.000Z"),
    ]);

    const a = await analyze("2026-01-05T00:00:00.000Z", "2026-01-15T00:00:00.000Z");
    // numerator {A,B} ⊆ denominator {A,B,C} → 2/3.
    expect(a.reopenRate.current).toBeLessThanOrEqual(100);
    expect(a.reopenRate.current).toBeCloseTo((2 / 3) * 100, 5);
  });
});
