"use client";

import { useState } from "react";

import { loadMoreLeadTimeRowsAction } from "../actions";
import { Button } from "@/components/ui/button";
import type { LeadTimeRow } from "@/lib/analytics/types";

/** Page size for the "Load more" window — matches the engine default cap so
 * the first server-rendered page and every appended page are the same size. */
const LEAD_TIME_PAGE_SIZE = 100;

/** The RESOLVED filters the dashboard rendered, echoed verbatim to the
 * load-more action so appended rows come from the identical set. from/to are
 * the payload's resolved range (workspace-timezone-aware), not a re-derivation. */
type LeadTimeFilterSnapshot = {
  from: string; // ISO-8601
  to: string; // ISO-8601
  boardId: string | null;
  memberId: string | null;
  includeArchivedBoards: boolean;
};

type LeadTimeTableProps = {
  workspaceId: string;
  rows: LeadTimeRow[];
  totalCompleted: number;
  /** Whether more detail rows exist behind the server-rendered page. */
  hasMore: boolean;
  filterSnapshot: LeadTimeFilterSnapshot;
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

function DueDateBadge({ row }: { row: LeadTimeRow }) {
  if (!row.dueDate) {
    return (
      <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
        No due date
      </span>
    );
  }

  if (row.wasLate) {
    return (
      <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
        Late
      </span>
    );
  }

  return (
    <span className="rounded-full bg-success px-2 py-1 text-xs font-medium text-success-foreground">
      On time
    </span>
  );
}

export function LeadTimeTable({
  workspaceId,
  rows: initialRows,
  totalCompleted: initialTotalCompleted,
  hasMore: initialHasMore,
  filterSnapshot,
}: LeadTimeTableProps) {
  const [rows, setRows] = useState(initialRows);
  const [totalCompleted, setTotalCompleted] = useState(initialTotalCompleted);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isTruncated = totalCompleted > rows.length;

  async function handleLoadMore() {
    if (isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const formData = new FormData();
      formData.set("workspaceId", workspaceId);
      formData.set("from", filterSnapshot.from);
      formData.set("to", filterSnapshot.to);
      if (filterSnapshot.boardId) {
        formData.set("boardId", filterSnapshot.boardId);
      }
      if (filterSnapshot.memberId) {
        formData.set("memberId", filterSnapshot.memberId);
      }
      if (filterSnapshot.includeArchivedBoards) {
        formData.set("includeArchivedBoards", "1");
      }
      // The next window starts after every row already displayed. Cards that
      // complete between renders can shift the sorted set, so the append is
      // deduped by cardId as a safety net.
      formData.set("offset", String(rows.length));
      formData.set("limit", String(LEAD_TIME_PAGE_SIZE));

      const result = await loadMoreLeadTimeRowsAction(formData);
      if (!result.success) {
        setLoadError(result.error);
        return;
      }
      setRows((prev) => {
        const seen = new Set(prev.map((row) => row.cardId));
        const additions = result.rows.filter((row) => !seen.has(row.cardId));
        return [...prev, ...additions];
      });
      setTotalCompleted(result.totalCompleted);
      setHasMore(result.hasMore);
    } catch {
      setLoadError("Failed to load more rows. Please try again.");
    } finally {
      setIsLoadingMore(false);
    }
  }

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
                    <DueDateBadge row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(isTruncated || hasMore) && (
        <div className="flex flex-col items-center gap-2 border-t p-3 text-center">
          {isTruncated && (
            <p className="text-xs text-muted-foreground">
              Showing {rows.length} of {totalCompleted} completed cards. Narrow
              the date range or filters to see the rest.
            </p>
          )}
          {hasMore && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "Load more"}
              </Button>
              {loadError ? (
                <p role="alert" className="text-xs text-destructive">
                  {loadError}
                </p>
              ) : null}
            </>
          )}
        </div>
      )}
    </section>
  );
}
