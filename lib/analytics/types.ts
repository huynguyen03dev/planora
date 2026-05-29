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

// Lead time detail row
export type LeadTimeRow = {
  cardId: string;
  cardTitle: string;
  createdAt: Date;
  completedAt: Date;
  leadTimeHours: number;
  wasLate: boolean; // completed after due date
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
  leadTime: {
    median: KPIValue;
    average: KPIValue;
    rows: LeadTimeRow[];
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
