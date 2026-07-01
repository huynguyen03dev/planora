"use server";

import { getWorkspaceAnalytics } from "@/lib/analytics/engine";
import type {
  AnalyticsFilters,
  WorkspaceAnalyticsPayload,
} from "@/lib/analytics/types";
import { isWorkspaceMember } from "@/lib/authorization";
import { csvCell } from "@/lib/csv";
import db from "@/lib/prisma";
import { verifySession } from "@/lib/dal";

export type AnalyticsActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

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

/**
 * Resolve workspace by slug.
 */
async function getWorkspaceBySlug(slug: string) {
  return db.workspace.findUnique({
    where: { slug },
    select: { id: true, name: true, timezone: true, analyticsLaunchAt: true },
  });
}

/**
 * Get workspace analytics with permission check.
 */
export async function getWorkspaceAnalyticsAction(
  slug: string,
  filters: AnalyticsFilters,
): Promise<AnalyticsActionResult<WorkspaceAnalyticsPayload>> {
  const { userId } = await verifySession();

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  const hasAccess = await isWorkspaceMember(userId, workspace.id);

  if (!hasAccess) {
    return { success: false, error: "Access denied" };
  }

  try {
    const payload = await getWorkspaceAnalytics({
      workspaceId: workspace.id,
      filters,
    });

    return { success: true, data: payload };
  } catch (error) {
    console.error("Failed to get workspace analytics:", error);
    return { success: false, error: "Failed to load analytics" };
  }
}

/**
 * Export workspace analytics as serializable payload.
 * Reuses the same analytics engine output.
 */
export async function exportWorkspaceAnalyticsAction(
  slug: string,
  filters: AnalyticsFilters,
): Promise<AnalyticsActionResult<AnalyticsExportPayload>> {
  const { userId } = await verifySession();

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  const hasAccess = await isWorkspaceMember(userId, workspace.id);

  if (!hasAccess) {
    return { success: false, error: "Access denied" };
  }

  try {
    const analytics = await getWorkspaceAnalytics({
      workspaceId: workspace.id,
      filters,
    });

    const exportPayload: AnalyticsExportPayload = {
      burndown: analytics.burndown,
      kpis: {
        remainingHours: {
          current: analytics.remainingHours.current,
          previous: analytics.remainingHours.previous,
          change: analytics.remainingHours.change,
        },
        medianLeadTimeHours: {
          current: analytics.leadTime.median.current,
          previous: analytics.leadTime.median.previous,
          change: analytics.leadTime.median.change,
        },
        averageLeadTimeHours: {
          current: analytics.leadTime.average.current,
          previous: analytics.leadTime.average.previous,
          change: analytics.leadTime.average.change,
        },
        overdueCount: {
          current: analytics.overdue.current,
          previous: analytics.overdue.previous,
          change: analytics.overdue.change,
        },
        completedLateCount: {
          current: analytics.completedLate.current,
          previous: analytics.completedLate.previous,
          change: analytics.completedLate.change,
        },
        reopenRatePercent: {
          current: analytics.reopenRate.current,
          previous: analytics.reopenRate.previous,
          change: analytics.reopenRate.change,
        },
        estimationCoveragePercent: {
          current: analytics.estimationCoverage.current,
          estimatedCount: analytics.estimationCoverage.estimatedCount,
          unestimatedCount: analytics.estimationCoverage.unestimatedCount,
        },
      },
      leadTimeRows: analytics.leadTime.rows.map((row) => ({
        cardId: row.cardId,
        cardTitle: row.cardTitle,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt.toISOString(),
        leadTimeHours: row.leadTimeHours,
        wasLate: row.wasLate,
      })),
      metadata: {
        workspaceId: analytics.filters.workspaceId,
        workspaceTimezone: analytics.filters.workspaceTimezone,
        from: analytics.filters.from.toISOString(),
        to: analytics.filters.to.toISOString(),
        boardId: analytics.filters.boardId ?? null,
        memberId: analytics.filters.memberId ?? null,
        includeArchivedBoards: analytics.filters.includeArchivedBoards ?? false,
        exportedAt: new Date().toISOString(),
      },
    };

    return { success: true, data: exportPayload };
  } catch (error) {
    console.error("Failed to export workspace analytics:", error);
    return { success: false, error: "Failed to export analytics" };
  }
}

/**
 * Generate CSV content for analytics export.
 * Note: This is an async function because it's in a server actions file.
 */
export async function generateAnalyticsCSV(payload: AnalyticsExportPayload): Promise<string> {
  const lines: string[] = [];

  // Header
  lines.push("Analytics Export");
  lines.push(`Workspace ID,${payload.metadata.workspaceId}`);
  lines.push(`Timezone,${payload.metadata.workspaceTimezone}`);
  lines.push(`From,${payload.metadata.from}`);
  lines.push(`To,${payload.metadata.to}`);
  lines.push(`Board ID,${payload.metadata.boardId ?? ""}`);
  lines.push(`Member ID,${payload.metadata.memberId ?? ""}`);
  lines.push(`Include Archived Boards,${payload.metadata.includeArchivedBoards}`);
  lines.push(`Exported At,${payload.metadata.exportedAt}`);
  lines.push("");

  // Burndown section
  lines.push("Burndown");
  lines.push("Date,Remaining Hours,Ideal Hours");
  for (const point of payload.burndown) {
    lines.push(
      `${point.date},${point.remainingHours},${point.idealHours ?? ""}`,
    );
  }
  lines.push("");

  // KPIs section
  lines.push("KPIs");
  lines.push("Metric,Current,Previous,Change");
  lines.push(
    `Remaining Hours,${payload.kpis.remainingHours.current},${payload.kpis.remainingHours.previous},${payload.kpis.remainingHours.change.toFixed(2)}%`,
  );
  lines.push(
    `Median Lead Time (hours),${payload.kpis.medianLeadTimeHours.current.toFixed(2)},${payload.kpis.medianLeadTimeHours.previous.toFixed(2)},${payload.kpis.medianLeadTimeHours.change.toFixed(2)}%`,
  );
  lines.push(
    `Average Lead Time (hours),${payload.kpis.averageLeadTimeHours.current.toFixed(2)},${payload.kpis.averageLeadTimeHours.previous.toFixed(2)},${payload.kpis.averageLeadTimeHours.change.toFixed(2)}%`,
  );
  lines.push(
    `Overdue Count,${payload.kpis.overdueCount.current},${payload.kpis.overdueCount.previous},${payload.kpis.overdueCount.change.toFixed(2)}%`,
  );
  lines.push(
    `Completed Late Count,${payload.kpis.completedLateCount.current},${payload.kpis.completedLateCount.previous},${payload.kpis.completedLateCount.change.toFixed(2)}%`,
  );
  lines.push(
    `Reopen Rate (%),${payload.kpis.reopenRatePercent.current.toFixed(2)},${payload.kpis.reopenRatePercent.previous.toFixed(2)},${payload.kpis.reopenRatePercent.change.toFixed(2)}%`,
  );
  const coverage = payload.kpis.estimationCoveragePercent;
  lines.push(
    [
      "Estimation Coverage (%)",
      coverage.current.toFixed(2),
      "-",
    ].join(",") +
      "," +
      csvCell(`Estimated: ${coverage.estimatedCount}, Unestimated: ${coverage.unestimatedCount}`),
  );
  lines.push("");

  // Lead time detail section
  lines.push("Lead Time Detail");
  lines.push("Card ID,Card Title,Created At,Completed At,Lead Time (hours),Was Late");
  for (const row of payload.leadTimeRows) {
    lines.push(
      [
        row.cardId,
        row.cardTitle,
        row.createdAt,
        row.completedAt,
        row.leadTimeHours.toFixed(2),
        row.wasLate,
      ].map(csvCell).join(","),
    );
  }

  return lines.join("\n");
}
