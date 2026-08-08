"use server";

import { getLeadTimeRows, getWorkspaceAnalytics } from "@/lib/analytics/engine";
import type {
  AnalyticsExportPayload,
  AnalyticsFilters,
  LeadTimeRow,
  WorkspaceAnalyticsPayload,
} from "@/lib/analytics/types";
import { isWorkspaceMember } from "@/lib/authorization";
import db from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { loadMoreLeadTimeRowsSchema } from "@/lib/schemas";

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
 * Get workspace analytics with permission check. `leadTimeRows` optionally
 * windows the lead-time detail rows (offset/limit) so the dashboard can
 * server-render page 1 at the pagination page size instead of the engine's
 * MAX_LEAD_TIME_ROWS cap. Omitted → historical default (offset 0, limit 100).
 */
export async function getWorkspaceAnalyticsAction(
  slug: string,
  filters: AnalyticsFilters,
  leadTimeRows?: { offset?: number; limit?: number },
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
      ...(leadTimeRows ? { leadTimeRows } : {}),
    });

    return { success: true, data: payload };
  } catch (error) {
    console.error("Failed to get workspace analytics:", error);
    return { success: false, error: "Failed to load analytics" };
  }
}

export type LoadMoreLeadTimeRowsResult =
  | {
      success: true;
      rows: LeadTimeRow[];
      hasMore: boolean;
      totalCompleted: number;
    }
  | { success: false; error: string };

/**
 * Offset-paginated read of the next lead-time detail window (no silent cap).
 * The dashboard renders the first page server-side; "Load more" appends the
 * next window against the SAME resolved range/filters the dashboard used —
 * from/to arrive as the payload's resolved dates, boardId/memberId/
 * includeArchivedBoards echo the page's parsed searchParams — so appended rows
 * can never drift from the displayed view. Read gate mirrors
 * getWorkspaceAnalyticsAction: any workspace member (viewers included) may
 * read analytics rows.
 */
export async function loadMoreLeadTimeRowsAction(
  formData: FormData,
): Promise<LoadMoreLeadTimeRowsResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = loadMoreLeadTimeRowsSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId } = await verifySession();

  const {
    workspaceId,
    from,
    to,
    boardId,
    memberId,
    includeArchivedBoards,
    offset,
    limit,
  } = parsed.data;

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  if (!(await isWorkspaceMember(userId, workspace.id))) {
    return { success: false, error: "Access denied" };
  }

  try {
    const page = await getLeadTimeRows(
      workspace.id,
      {
        from,
        to,
        ...(boardId ? { boardId } : {}),
        ...(memberId ? { memberId } : {}),
        includeArchivedBoards,
      },
      { offset, limit },
    );

    return {
      success: true,
      rows: page.rows,
      hasMore: page.hasMore,
      totalCompleted: page.totalCompleted,
    };
  } catch (error) {
    console.error("Failed to load more lead-time rows:", error);
    return { success: false, error: "Failed to load rows" };
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
