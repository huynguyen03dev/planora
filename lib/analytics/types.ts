/**
 * Analytics types per PRD canonical metric definitions.
 */

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
    rows: LeadTimeRow[]; // capped at MAX_LEAD_TIME_ROWS; see totalCompleted
    totalCompleted: number; // total cards first-completed in range (>= rows.length)
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

// Query input
export type WorkspaceAnalyticsQuery = {
  workspaceId: string;
  filters: AnalyticsFilters;
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
