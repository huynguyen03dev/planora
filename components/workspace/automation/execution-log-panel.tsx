"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { RefreshIcon, TimelineListIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { getRuleExecutionLogAction } from "@/app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EXECUTION_LOG_PAGE_SIZE } from "@/lib/automation/constants";
import type { TriggerType } from "@/lib/schemas/automation";

import { ACTION_TYPE_LABELS, TRIGGER_LABELS, type ActionType } from "./rule-descriptors";
import type { NotifyFn } from "./types";

export type LogEntry = {
  id: string;
  // null once the rule is deleted (log survives via SetNull); ruleName is
  // denormalized so the entry always has a display name.
  ruleId: string | null;
  ruleName: string;
  chainDepth: number;
  actionType: string;
  triggerType: string;
  status: string;
  error: string | null;
  executedAt: string;
};

type ExecutionLogPanelProps = {
  workspaceId: string;
  initialLogs: LogEntry[];
  // Exact (server-probed) "more logs may exist" flag for the initial feed —
  // never inferred from a page-size heuristic.
  initialHasMore: boolean;
  notify: NotifyFn;
  // Host-driven refresh (board modal, US-067): when provided, the Refresh button
  // re-fetches through the host (which stays board-scoped) instead of the
  // built-in workspace-wide fetch; the fresh logs flow back via `initialLogs`.
  // Returns a promise so the button can show its pending state. Omitted on the
  // workspace page, which self-refreshes. The modal cannot cursor-page (its host
  // fetch has no cursor), so the infinite-scroll loop runs on the workspace page
  // only; the modal's feed is bounded and states honestly when more history
  // exists.
  onRefresh?: () => void | Promise<void>;
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "error") return "destructive";
  if (status === "success") return "outline";
  return "secondary";
}

function actionLabel(type: string): string {
  return ACTION_TYPE_LABELS[type as ActionType] ?? type;
}

function triggerLabel(type: string): string {
  return TRIGGER_LABELS[type as TriggerType] ?? type;
}

/**
 * End-of-feed status for the bounded scroll container.
 *
 * DESIGN.md voice: quiet secondary text (`text-muted-foreground`) or the
 * action's own error in `text-destructive`; nothing here is a prominent CTA
 * and nothing animates (safe under prefers-reduced-motion).
 *
 *  - loading → polite `role="status"` line while a batch is in flight;
 *  - auto-load failure → `role="alert"` + subtle ghost retry (keyboard/SR-
 *    accessible, never steals focus);
 *  - observer-less environment (no IntersectionObserver) → the same subtle
 *    ghost button as the standing manual affordance;
 *  - end of data → polite "All execution logs are shown" completion status;
 *  - board modal (host-driven, cannot page) → a muted line making the
 *    history cap explicit instead of pretending the list is complete.
 */
function FeedStatus({
  isModal,
  hasMore,
  isLoadingMore,
  loadError,
  observerSupported,
  onRetry,
}: {
  isModal: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadError: string | null;
  observerSupported: boolean;
  onRetry: () => void;
}) {
  if (isLoadingMore) {
    return (
      <div className="border-t px-4 py-2.5 text-center">
        <p role="status" className="text-xs text-muted-foreground">
          Loading more logs…
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-2 border-t px-4 py-2.5">
        <p role="alert" className="text-xs text-destructive">
          {loadError}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
          Load more
        </Button>
      </div>
    );
  }

  if (!hasMore) {
    if (isModal) return null;
    return (
      <div className="border-t px-4 py-2.5 text-center">
        <p role="status" className="text-xs text-muted-foreground">
          All execution logs are shown
        </p>
      </div>
    );
  }

  // More history exists.
  if (isModal) {
    // Board modal: host-driven, no cursor paging — state that these are the
    // latest rows and point at the workspace Automation page (the full-history
    // surface) instead of faking completeness.
    return (
      <div className="border-t px-4 py-2.5 text-center">
        <p role="status" className="text-xs text-muted-foreground">
          Showing the latest logs — the workspace Automation page lists the
          full history.
        </p>
      </div>
    );
  }

  // More data may exist but auto-load is unavailable — keep a subtle manual
  // affordance as the only path (never a prominent permanent CTA).
  if (!observerSupported) {
    return (
      <div className="flex flex-col items-center py-2.5">
        <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
          Load more
        </Button>
      </div>
    );
  }

  return null;
}

export function ExecutionLogPanel({
  workspaceId,
  initialLogs,
  initialHasMore,
  notify,
  onRefresh,
}: ExecutionLogPanelProps) {
  // The workspace page self-pages; the board modal is host-driven (`onRefresh`)
  // and cannot cursor-page through its board-scoped host fetch.
  const isModal = Boolean(onRefresh);

  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isPending, startTransition] = useTransition();
  // Batch fetch state (infinite scroll), deliberately separate from the
  // refresh transition so the inline "Loading more logs…" status and the
  // Refresh button's "Refreshing…" never fight.
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reflect externally-supplied logs when the host re-fetches (board modal); on
  // the workspace page `initialLogs` is stable between self-refreshes, so this
  // never fights the built-in fetch below — it does reset the feed when the page
  // re-renders with fresh props after a mutation (router.refresh()).
  useEffect(() => {
    setLogs(initialLogs);
    setHasMore(initialHasMore);
    setLoadError(null);
  }, [initialLogs, initialHasMore]);

  // The bounded feed container — also the IntersectionObserver root, so the
  // sentinel only triggers when it scrolls into the feed's own viewport,
  // never the page's.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Synchronous in-flight flag: set before the first await, so two observer
  // callbacks in the same tick (or a double-click on the fallback) collapse
  // into one request — the state guard alone cannot see the update yet.
  const requestInFlightRef = useRef(false);
  // Bumped on refresh: an in-flight batch that resolves after a refresh is
  // stale (its cursor descends from the pre-refresh list) and must not append.
  const loadGenerationRef = useRef(0);

  // Hydration-safe "mounted" flag (React-docs pattern, no effect): SSR and the
  // first client paint read the SERVER snapshot (false) → no observer-dependent
  // status/footer yet; once hydrated, React re-checks the CLIENT snapshot
  // (true) → the sentinel-driven loop and its statuses render. No
  // suppressHydrationWarning anywhere — the two sides never disagree.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Client-only capability flag: false on the server and during the first
  // client paint, so SSR and hydration agree. When IntersectionObserver is
  // missing, the manual fallback becomes the permanent (subtle) affordance.
  const observerSupported = mounted && typeof IntersectionObserver !== "undefined";

  function refresh() {
    // A refresh replaces the feed; any batch in flight is now stale.
    loadGenerationRef.current += 1;
    if (onRefresh) {
      // Drive the host re-fetch inside the transition so the button shows the
      // same pending affordance it does for the built-in fetch below.
      startTransition(async () => {
        await onRefresh();
      });
      return;
    }
    startTransition(async () => {
      const result = await getRuleExecutionLogAction({
        workspaceId,
        take: EXECUTION_LOG_PAGE_SIZE,
      });
      if (!result.success) {
        notify(result.error, "error");
        return;
      }
      setLogs(result.logs);
      setHasMore(result.hasMore);
      setLoadError(null);
    });
  }

  // Fetches the next batch behind the last loaded log (US-066 cursor
  // pagination), appending with an id dedupe so a refresh racing the load can
  // never double-list a row, and skipping the append if a refresh superseded
  // this batch meanwhile.
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || requestInFlightRef.current) {
      return;
    }
    const cursor = logs[logs.length - 1]?.id;
    if (!cursor) {
      setHasMore(false);
      return;
    }
    const generation = loadGenerationRef.current;
    requestInFlightRef.current = true;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const result = await getRuleExecutionLogAction({
        workspaceId,
        cursor,
        take: EXECUTION_LOG_PAGE_SIZE,
      });
      if (loadGenerationRef.current !== generation) {
        return; // a refresh reset the feed while this batch was in flight
      }
      if (!result.success) {
        setLoadError(result.error);
        return;
      }
      setLogs((prev) => {
        const seen = new Set(prev.map((log) => log.id));
        return [...prev, ...result.logs.filter((log) => !seen.has(log.id))];
      });
      setHasMore(result.hasMore);
    } catch {
      if (loadGenerationRef.current !== generation) {
        return;
      }
      setLoadError("Failed to load more logs. Please try again.");
    } finally {
      requestInFlightRef.current = false;
      setIsLoadingMore(false);
    }
  }, [logs, isLoadingMore, workspaceId]);

  // Latest-state mirrors for the observer callback: reading these avoids
  // re-creating the observer on every render while guaranteeing a request is
  // never fired against stale state (the refs are the single gate against
  // concurrent/duplicate auto-loads).
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const loadErrorRef = useRef<string | null>(loadError);
  hasMoreRef.current = hasMore;
  isLoadingMoreRef.current = isLoadingMore;
  loadErrorRef.current = loadError;

  // Auto-load loop (workspace page only — the modal is host-driven and cannot
  // page). Root MUST be the scroll container: the sentinel then only triggers
  // when it scrolls into the feed's own viewport. The observer is torn down
  // whenever a load is in flight, an error is showing, the end was reached,
  // or the list changed — and re-created after every append — so one request
  // can never overlap or duplicate the same window.
  useEffect(() => {
    if (!observerSupported || isModal || !hasMore || isLoadingMore || loadError) {
      return;
    }
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        if (
          hasMoreRef.current === false ||
          isLoadingMoreRef.current ||
          loadErrorRef.current
        ) {
          return;
        }
        void handleLoadMore();
      },
      // 240px lookahead below the feed's own bottom edge: the next batch
      // starts loading just before the sentinel scrolls into view, so
      // scrolling feels continuous.
      { root, rootMargin: "0px 0px 240px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [observerSupported, isModal, hasMore, isLoadingMore, loadError, handleLoadMore]);

  return (
    <section className="space-y-3">
      {/* Header stays visible outside the scrolling feed. */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Execution log{logs.length > 0 ? ` (${logs.length})` : ""}
        </h2>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={isPending}>
          <HugeiconsIcon icon={RefreshIcon} className="size-4" aria-hidden="true" />
          {isPending ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Bounded feed: the panel scrolls internally (max-h-80, the codebase's
          scrollable-list height) so the page/modal never grows with history.
          The IO sentinel lives inside, rooted to this container. */}
      <div
        ref={scrollRef}
        className="max-h-80 overflow-y-auto rounded-lg border bg-card"
      >
        {logs.length > 0 ? (
          <>
            <div className="divide-y">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{log.ruleName}</span>
                      {/* The rule survives in the log after deletion (ruleId goes
                          null); flag it so the name here — which has no matching
                          row in the rules list above — is explained. */}
                      {log.ruleId === null ? (
                        <span className="text-xs text-muted-foreground">(deleted)</span>
                      ) : null}
                      <Badge variant={statusVariant(log.status)} className="capitalize">
                        {log.status}
                      </Badge>
                      {log.chainDepth > 0 ? (
                        <span className="text-xs text-muted-foreground">chain depth {log.chainDepth}</span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {triggerLabel(log.triggerType)} → {actionLabel(log.actionType)}
                    </p>
                    {log.error ? (
                      <p className="truncate text-xs text-destructive">{log.error}</p>
                    ) : null}
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={log.executedAt}>
                    {new Date(log.executedAt).toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
            {mounted ? (
              <FeedStatus
                isModal={isModal}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                loadError={loadError}
                observerSupported={observerSupported}
                onRetry={handleLoadMore}
              />
            ) : null}
            {/* Scroll sentinel: pure trigger, no content. Never observed in
                modal mode (no paging); the observer effect gates on that. */}
            {!isModal ? (
              <div ref={sentinelRef} aria-hidden="true" className="h-px" />
            ) : null}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <HugeiconsIcon icon={TimelineListIcon} className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No execution logs yet</p>
              <p className="text-sm text-muted-foreground">
                Runs appear here as rules fire.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
