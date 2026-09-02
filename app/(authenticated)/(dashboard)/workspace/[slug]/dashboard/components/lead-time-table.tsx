"use client";

import { useEffect, useRef, useState } from "react";

import { loadMoreLeadTimeRowsAction } from "../actions";
import { Button } from "@/components/ui/button";
import type { LeadTimeRow } from "@/lib/analytics/types";

/** The RESOLVED filters the dashboard rendered, echoed verbatim to the
 * pagination action so every fetched page comes from the identical set.
 * from/to are the payload's resolved range (workspace-timezone-aware), not a
 * re-derivation. */
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
  /** Pagination window size (LEAD_TIME_PAGE_SIZE from the analytics engine —
   * page 1 is server-rendered at this size, every later page fetched with the
   * same limit). */
  pageSize: number;
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
  pageSize,
}: LeadTimeTableProps) {
  const [rows, setRows] = useState(initialRows);
  const [totalCompleted, setTotalCompleted] = useState(initialTotalCompleted);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Primitive key for the filter effect: only the resolved filter VALUES
  // matter, never the props object identity.
  const filterKey = [
    filterSnapshot.from,
    filterSnapshot.to,
    filterSnapshot.boardId ?? "",
    filterSnapshot.memberId ?? "",
    filterSnapshot.includeArchivedBoards ? "archived" : "",
  ].join("|");

  // Filters/range changed server-side: the fresh page-1 window just arrived
  // via props — reset the client pagination state onto it. Guarded by the
  // previous-key ref so re-renders that keep the SAME filter values (e.g. tab
  // away/back) never clobber the current page.
  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKey.current === filterKey) {
      return;
    }
    prevFilterKey.current = filterKey;
    setPage(1);
    setRows(initialRows);
    setTotalCompleted(initialTotalCompleted);
    setHasMore(initialHasMore);
    setError(null);
    setIsLoading(false);
  }, [filterKey, initialRows, initialTotalCompleted, initialHasMore]);

  const totalPages = totalCompleted > 0 ? Math.ceil(totalCompleted / pageSize) : 1;
  const firstRow = totalCompleted > 0 ? (page - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(page * pageSize, totalCompleted);

  async function fetchPage(targetPage: number) {
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    setError(null);
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
      // The requested page's window starts after every row on the pages
      // before it; rows REPLACE the displayed set (no append/dedupe needed —
      // each page is an independent window of the same sorted set).
      formData.set("offset", String((targetPage - 1) * pageSize));
      formData.set("limit", String(pageSize));

      const result = await loadMoreLeadTimeRowsAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setRows(result.rows);
      setTotalCompleted(result.totalCompleted);
      setHasMore(result.hasMore);
      setPage(targetPage);
    } catch {
      setError("Failed to load rows. Please try again.");
    } finally {
      setIsLoading(false);
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

      {totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t p-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            Showing {firstRow}–{lastRow} of {totalCompleted} completed cards
          </p>

          <div className="flex items-center gap-2" aria-busy={isLoading}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fetchPage(page - 1)}
              disabled={page <= 1 || isLoading}
            >
              Previous
            </Button>
            <span
              className="min-w-24 text-center text-xs text-muted-foreground"
              aria-live="polite"
            >
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fetchPage(page + 1)}
              disabled={!hasMore || isLoading}
            >
              Next
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
