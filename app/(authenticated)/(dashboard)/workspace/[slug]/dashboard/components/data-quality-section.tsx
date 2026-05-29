import { AnalyticsExportButtons } from "./analytics-export-buttons";
import type { WorkspaceAnalyticsPayload } from "@/lib/analytics/types";

type DataQualitySectionProps = {
  analytics: WorkspaceAnalyticsPayload;
  workspaceSlug: string;
};

export function DataQualitySection({
  analytics,
  workspaceSlug,
}: DataQualitySectionProps) {
  const hasUnestimatedCards = analytics.estimationCoverage.unestimatedCount > 0;

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Data quality and export</h2>
          <p className="text-sm text-muted-foreground">
            Exports use the same filtered dataset and raw values as this dashboard.
          </p>
        </div>
        <AnalyticsExportButtons
          workspaceSlug={workspaceSlug}
          filters={{
            boardId: analytics.filters.boardId,
            memberId: analytics.filters.memberId,
            includeArchivedBoards: analytics.filters.includeArchivedBoards,
            preset: analytics.filters.preset,
            from: analytics.filters.from.toISOString(),
            to: analytics.filters.to.toISOString(),
          }}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <QualityCard
          label="Estimated cards"
          value={String(analytics.estimationCoverage.estimatedCount)}
        />
        <QualityCard
          label="Unestimated cards"
          value={String(analytics.estimationCoverage.unestimatedCount)}
          warning={hasUnestimatedCards}
        />
        <QualityCard
          label="Coverage"
          value={`${analytics.estimationCoverage.current.toFixed(1)}%`}
          warning={analytics.estimationCoverage.lowConfidence}
        />
      </div>

      {hasUnestimatedCards ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {analytics.estimationCoverage.unestimatedCount} active card(s) are
          excluded from burndown totals because they do not have an estimate.
        </p>
      ) : null}
    </section>
  );
}

function QualityCard({
  label,
  value,
  warning,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={warning ? "text-2xl font-semibold text-amber-700" : "text-2xl font-semibold"}>
        {value}
      </p>
    </div>
  );
}
