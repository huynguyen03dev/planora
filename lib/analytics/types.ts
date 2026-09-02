/**
 * Analytics types per PRD canonical metric definitions.
 */

// Window size for the dashboard's lead-time detail pagination (page 1 is
// server-rendered, every later page fetched through the load-rows action).
// Lives here (NOT in engine.ts, which is a "use server" module — only async
// functions may be exported there; a const export breaks `next build`).
// The engine default stays MAX_LEAD_TIME_ROWS (100) for other callers (CSV
// export legacy cap); the dashboard explicitly requests this page size.
export const LEAD_TIME_PAGE_SIZE = 20;

// Filter types
export type AnalyticsRangePreset = "7d" | "30d" | "90d";

export type AnalyticsFilters = {
  boardId?: string;
  memberId?: string;
  includeArchivedBoards?: boolean;
  preset?: AnalyticsRangePreset;
  from?: Date;
  to?: Date;
};

// Burndown data point
export type BurndownPoint = {
  date: string; // ISO date string (YYYY-MM-DD)
  remainingHours: number;
  idealHours: number | null; // null for days before range start
};

// Flow data point: cards created vs first-completed on a given day. Unlike
// burndown this needs no estimates, so it stays meaningful at any coverage.
export type FlowPoint = {
  date: string; // YYYY-MM-DD
  created: number; // cards created that day (filtered)
  completed: number; // cards first-completed that day (filtered)
};

// Lead time detail row
export type LeadTimeRow = {
  cardId: string;
  cardTitle: string;
  createdAt: Date;
  completedAt: Date;
  leadTimeHours: number;
  dueDate: Date | null; // due date at completion; null if the card never had one
  wasLate: boolean; // completed after due date (false when there was no due date)
};

// KPI values with comparison
export type KPIValue = {
  current: number;
  previous: number;
  change: number; // percentage change
  lowConfidence: boolean;
};

// Estimation coverage KPI
export type EstimationCoverageKPI = {
  current: number; // percentage 0-100
  estimatedCount: number;
  unestimatedCount: number;
  previous: number;
  change: number;
  lowConfidence: boolean;
};

// Main analytics payload
export type WorkspaceAnalyticsPayload = {
  filters: AnalyticsFilters & {
    from: Date;
    to: Date;
    workspaceId: string;
    workspaceTimezone: string;
  };
  burndown: BurndownPoint[];
  flow: {
    points: FlowPoint[];
    createdTotal: number;
    completedTotal: number;
  };
  leadTime: {
    median: KPIValue;
    average: KPIValue;
    rows: LeadTimeRow[]; // capped at MAX_LEAD_TIME_ROWS by default; see hasMore/totalCompleted
    totalCompleted: number; // total cards first-completed in range (>= rows.length)
    hasMore: boolean; // whether more detail rows exist past the returned window
  };
  remainingHours: KPIValue;
  overdue: KPIValue;
  completedLate: KPIValue;
  reopenRate: KPIValue;
  estimationCoverage: EstimationCoverageKPI;
  launchBoundary: {
    analyticsLaunchAt: Date | null;
    selectedRangeCrossesBoundary: boolean;
    message?: string;
  };
  comparisonPeriod: {
    from: Date;
    to: Date;
  };
};

// Serializable export payload (JSON/CSV download). Built by
// exportWorkspaceAnalyticsAction and consumed by the pure CSV formatter in
// lib/analytics/csv-export.ts — kept here so neither depends on a "use server"
// module.
export type AnalyticsExportPayload = {
  burndown: {
    date: string;
    remainingHours: number;
    idealHours: number | null;
  }[];
  kpis: {
    remainingHours: { current: number; previous: number; change: number };
    medianLeadTimeHours: { current: number; previous: number; change: number };
    averageLeadTimeHours: { current: number; previous: number; change: number };
    overdueCount: { current: number; previous: number; change: number };
    completedLateCount: { current: number; previous: number; change: number };
    reopenRatePercent: { current: number; previous: number; change: number };
    estimationCoveragePercent: {
      current: number;
      estimatedCount: number;
      unestimatedCount: number;
    };
  };
  leadTimeRows: {
    cardId: string;
    cardTitle: string;
    createdAt: string;
    completedAt: string;
    leadTimeHours: number;
    wasLate: boolean;
  }[];
  metadata: {
    workspaceId: string;
    workspaceTimezone: string;
    from: string;
    to: string;
    boardId: string | null;
    memberId: string | null;
    includeArchivedBoards: boolean;
    exportedAt: string;
  };
};

// Query input
export type WorkspaceAnalyticsQuery = {
  workspaceId: string;
  filters: AnalyticsFilters;
  /** Optional offset/limit window for the lead-time detail rows. Omitted → the
   * first MAX_LEAD_TIME_ROWS rows (offset 0). KPIs are never windowed — they
   * always cover every completion in range. */
  leadTimeRows?: { offset?: number; limit?: number };
};

/** A page of lead-time detail rows — the offset/limit window of the full
 * completedAt-descending set, plus the window-independent totals. */
export type LeadTimeRowsPage = {
  rows: LeadTimeRow[];
  /** Whether rows exist past the returned window. */
  hasMore: boolean;
  /** Total cards first-completed in range (>= rows.length). */
  totalCompleted: number;
};

// Internal computation state
export type CardStateAtTime = {
  cardId: string;
  listId: string;
  listIsDone: boolean;
  estimateHours: number | null;
  dueDate: Date | null;
  memberIds: string[];
  archivedAt: Date | null;
  deletedAt: Date | null;
  completedAt: Date | null;
};

export type HistoryEvent = {
  sequence: bigint;
  cardId: string;
  eventType: string;
  occurredAt: Date;
  metadata: Record<string, unknown> | null;
};
