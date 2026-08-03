"use server";

import { getWorkspaceAnalytics } from "@/lib/analytics/engine";
import type {
  AnalyticsExportPayload,
  AnalyticsFilters,
  WorkspaceAnalyticsPayload,
} from "@/lib/analytics/types";
import { isWorkspaceMember } from "@/lib/authorization";
import db from "@/lib/prisma";
import { verifySession } from "@/lib/dal";

export type AnalyticsActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

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
