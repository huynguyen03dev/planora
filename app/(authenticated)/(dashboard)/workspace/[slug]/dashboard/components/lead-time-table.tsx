import type { LeadTimeRow } from "@/lib/analytics/types";

type LeadTimeTableProps = {
  rows: LeadTimeRow[];
};

function formatHours(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export function LeadTimeTable({ rows }: LeadTimeTableProps) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b p-5">
        <h2 className="text-lg font-semibold">Lead-time detail</h2>
        <p className="text-sm text-muted-foreground">
          Cards first completed in the selected range.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="p-5 text-sm text-muted-foreground">
          No completed cards match the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Card</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Completed</th>
                <th className="px-4 py-3 font-medium">Lead time</th>
                <th className="px-4 py-3 font-medium">Late</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.cardId}-${row.completedAt.toISOString()}`} className="border-b last:border-0">
                  <td className="max-w-xs truncate px-4 py-3 font-medium">
                    {row.cardTitle}
                  </td>
                  <td className="px-4 py-3">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-3">{formatDate(row.completedAt)}</td>
                  <td className="px-4 py-3">{formatHours(row.leadTimeHours)}</td>
                  <td className="px-4 py-3">
                    {row.wasLate ? (
                      <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-700">
                        Late
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700">
                        On time
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
