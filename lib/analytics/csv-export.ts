import type { AnalyticsExportPayload } from "@/lib/analytics/types";
import { csvCell } from "@/lib/csv";

/**
 * Format an analytics export payload as CSV.
 *
 * Pure, synchronous, and framework-free — deliberately NOT a Server Action
 * (US-062 mn17). It reads no database and needs no session, so it must not live
 * in a `"use server"` module where it could later grow into an unauthenticated
 * endpoint. The client calls it directly on an already-authorized payload
 * returned by `exportWorkspaceAnalyticsAction`.
 *
 * Every cell that can carry user-controlled or formula-leading text goes through
 * `csvCell` (CWE-1236 formula-injection guard); see US-058 / US-062 MJ1.
 */
export function generateAnalyticsCSV(payload: AnalyticsExportPayload): string {
  const lines: string[] = [];

  // Header
  lines.push("Analytics Export");
  lines.push(`Workspace ID,${payload.metadata.workspaceId}`);
  lines.push(`Timezone,${payload.metadata.workspaceTimezone}`);
  lines.push(`From,${payload.metadata.from}`);
  lines.push(`To,${payload.metadata.to}`);
  lines.push(`Board ID,${csvCell(payload.metadata.boardId ?? "")}`);
  lines.push(`Member ID,${csvCell(payload.metadata.memberId ?? "")}`);
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
