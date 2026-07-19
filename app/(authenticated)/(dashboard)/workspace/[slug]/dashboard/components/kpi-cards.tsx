import {
  formatHourTotal,
  resolveTrend,
  type Polarity,
} from "@/lib/analytics/presentation";
import type { KPIValue, WorkspaceAnalyticsPayload } from "@/lib/analytics/types";

interface KPICardsProps {
  analytics: WorkspaceAnalyticsPayload;
}

function formatHours(hours: number): string {
  if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function Trend({
  value,
  polarity,
}: {
  value: KPIValue;
  polarity: Polarity;
}) {
  const trend = resolveTrend(value, polarity);

  if (trend.kind === "new") {
    return <span className="text-sm text-muted-foreground">New</span>;
  }

  if (trend.kind === "flat") {
    return (
      <span className="text-sm text-muted-foreground">
        <span aria-hidden="true">→</span><span className="sr-only">Flat </span>0.0%
      </span>
    );
  }

  return (
    <span
      className={`text-sm ${trend.isImprovement ? "text-success-foreground" : "text-destructive"}`}
      aria-label={`${trend.rising ? "Trending up" : "Trending down"} ${trend.magnitude.toFixed(1)}%`}
    >
      <span aria-hidden="true">{trend.rising ? "↑" : "↓"}</span> {trend.magnitude.toFixed(1)}%
    </span>
  );
}

function NoDataTrend() {
  return <span className="text-sm text-muted-foreground">No data</span>;
}

interface CardProps {
  title: string;
  value: string;
  trend: React.ReactNode;
  lowConfidence?: boolean;
  subtitle?: string;
}

function Card({ title, value, trend, lowConfidence, subtitle }: CardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{value}</span>
        {trend}
      </div>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
      {lowConfidence && (
        <p className="mt-1 text-xs text-warning-foreground">
          Low confidence: historical data may be incomplete
        </p>
      )}
    </div>
  );
}

export function KPICards({ analytics }: KPICardsProps) {
  const {
    leadTime,
    remainingHours,
    overdue,
    completedLate,
    reopenRate,
    estimationCoverage,
  } = analytics;

  // Lead time and reopen rate are only meaningful when something completed in
  // the range; otherwise a literal 0 reads as a real (excellent) result.
  const hasCompletions = leadTime.totalCompleted > 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Card
        title="Median Lead Time"
        value={hasCompletions ? formatHours(leadTime.median.current) : "—"}
        trend={
          hasCompletions ? (
            <Trend value={leadTime.median} polarity="higherIsWorse" />
          ) : (
            <NoDataTrend />
          )
        }
        lowConfidence={leadTime.median.lowConfidence}
      />

      <Card
        title="Remaining Hours"
        value={formatHourTotal(remainingHours.current)}
        trend={<Trend value={remainingHours} polarity="higherIsWorse" />}
        lowConfidence={remainingHours.lowConfidence}
      />

      <Card
        title="Overdue Cards"
        value={overdue.current.toString()}
        trend={<Trend value={overdue} polarity="higherIsWorse" />}
        lowConfidence={overdue.lowConfidence}
      />

      <Card
        title="Completed Late"
        value={completedLate.current.toString()}
        trend={<Trend value={completedLate} polarity="higherIsWorse" />}
        lowConfidence={completedLate.lowConfidence}
      />

      <Card
        title="Reopen Rate"
        value={hasCompletions ? formatPercent(reopenRate.current) : "—"}
        trend={
          hasCompletions ? (
            <Trend value={reopenRate} polarity="higherIsWorse" />
          ) : (
            <NoDataTrend />
          )
        }
        lowConfidence={reopenRate.lowConfidence}
      />

      <Card
        title="Estimation Coverage"
        value={formatPercent(estimationCoverage.current)}
        trend={
          <Trend
            value={{
              current: estimationCoverage.current,
              previous: estimationCoverage.previous,
              change: estimationCoverage.change,
              lowConfidence: estimationCoverage.lowConfidence,
            }}
            polarity="higherIsBetter"
          />
        }
        lowConfidence={estimationCoverage.lowConfidence}
        subtitle={`${estimationCoverage.estimatedCount} estimated, ${estimationCoverage.unestimatedCount} unestimated`}
      />
    </div>
  );
}
