import type { WorkspaceAnalyticsPayload } from "@/lib/analytics/types";

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

function ChangeIndicator({ change }: { change: number }) {
  const isPositive = change >= 0;
  return (
    <span
      className={`text-sm ${
        isPositive ? "text-green-600" : "text-red-600"
      }`}
    >
      {isPositive ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
    </span>
  );
}

interface CardProps {
  title: string;
  value: string;
  change: number;
  lowConfidence?: boolean;
  subtitle?: string;
}

function Card({ title, value, change, lowConfidence, subtitle }: CardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{value}</span>
        <ChangeIndicator change={change} />
      </div>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
      {lowConfidence && (
        <p className="mt-1 text-xs text-amber-600">
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

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Card
        title="Median Lead Time"
        value={formatHours(leadTime.median.current)}
        change={leadTime.median.change}
        lowConfidence={leadTime.median.lowConfidence}
      />

      <Card
        title="Remaining Hours"
        value={remainingHours.current.toString()}
        change={remainingHours.change}
        lowConfidence={remainingHours.lowConfidence}
      />

      <Card
        title="Overdue Cards"
        value={overdue.current.toString()}
        change={overdue.change}
        lowConfidence={overdue.lowConfidence}
      />

      <Card
        title="Completed Late"
        value={completedLate.current.toString()}
        change={completedLate.change}
        lowConfidence={completedLate.lowConfidence}
      />

      <Card
        title="Reopen Rate"
        value={formatPercent(reopenRate.current)}
        change={reopenRate.change}
        lowConfidence={reopenRate.lowConfidence}
      />

      <Card
        title="Estimation Coverage"
        value={formatPercent(estimationCoverage.current)}
        change={estimationCoverage.change}
        lowConfidence={estimationCoverage.lowConfidence}
        subtitle={`${estimationCoverage.estimatedCount} estimated, ${estimationCoverage.unestimatedCount} unestimated`}
      />
    </div>
  );
}
