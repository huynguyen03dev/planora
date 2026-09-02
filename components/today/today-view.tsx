"use client";

import { Calendar03Icon, Flag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { loadMoreTodayCardsAction } from "@/app/(authenticated)/(dashboard)/today/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DUE_META_CHIP_CLASS, PRIORITY_META_CHIP } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  describeTodayDue,
  getTodayLoadMoreCursor,
  getTodaySectionKey,
  groupTodayCards,
  TODAY_PAGE_SIZE,
  type TodayCard,
  type TodaySectionGroup,
  type TodaySectionKey,
} from "@/lib/today";

type TodayViewProps = {
  workspaceCount: number;
  cards: TodayCard[];
  /** Whether more assigned cards may exist behind the first page (the RSC
   * fetched a full page). The sentinel keeps auto-loading until it is false. */
  hasMore: boolean;
  /** Injected clock for deterministic grouping; defaults to the browser clock. */
  now?: Date;
};

// Priority chip — shared meta-chip ramp with the card face
// (lib/constants.ts): token tint pairs (label-*, warning), AA-measured in
// globals.css for both themes; icon + word, never color-only (WCAG 1.4.1).

// Due chip tint per bucket — the shared card-face due-state ramp
// (lib/constants.ts): destructive for overdue, warning tint for today, warning
// text for this week (≈ card-face "soon"), muted for later (≈ "upcoming"). The
// chip ALWAYS carries an icon + word + aria-label — the tint is reinforcement,
// never the only signal (WCAG 1.4.1).
const DUE_CHIP_CLASS: Record<TodaySectionKey, string> = {
  overdue: DUE_META_CHIP_CLASS.overdue,
  today: DUE_META_CHIP_CLASS.today,
  week: DUE_META_CHIP_CLASS.soon,
  later: DUE_META_CHIP_CLASS.upcoming,
};

function TodayCardTile({ card, now }: { card: TodayCard; now: Date }) {
  const due = describeTodayDue(card.dueDate, now);
  const dueKey = card.dueDate ? getTodaySectionKey(card.dueDate, now) : null;
  const priority = card.priority ? PRIORITY_META_CHIP[card.priority] : null;
  const context = [card.board.workspace.name, card.board.title, card.list.title].join(" · ");

  return (
    <li>
      <Link
        href={`/boards/${card.board.id}?cardId=${card.id}`}
        aria-label={`Open card ${card.title}`}
        className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <p className="truncate text-sm font-medium text-card-foreground">
          {card.title}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {context}
          </span>
          {due && dueKey ? (
            <span
              aria-label={due.a11yLabel}
              className={cn(
                "ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs",
                DUE_CHIP_CLASS[dueKey],
              )}
            >
              <HugeiconsIcon icon={Calendar03Icon} className="size-3" aria-hidden="true" />
              {due.label}
            </span>
          ) : null}
          {priority ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs",
                priority.className,
              )}
            >
              <HugeiconsIcon icon={Flag01Icon} className="size-3" aria-hidden="true" />
              {priority.label}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function TodaySection({ group, now }: { group: TodaySectionGroup; now: Date }) {
  return (
    <section aria-labelledby={`today-section-${group.key}`}>
      <div className="flex items-center gap-2">
        <h2
          id={`today-section-${group.key}`}
          className="text-sm font-semibold text-foreground"
        >
          {group.title}
        </h2>
        <Badge variant="secondary" className="rounded-full">
          {group.count}
        </Badge>
      </div>
      {group.cards.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {group.cards.map((card) => (
            <TodayCardTile key={card.id} card={card} now={now} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Nothing here yet.</p>
      )}
    </section>
  );
}

function TodayEmptyState({ variant }: { variant: "no-workspaces" | "nothing-assigned" }) {
  const copy =
    variant === "no-workspaces"
      ? {
          heading: "No workspaces yet",
          body: "Join or create a workspace to start tracking your assigned work.",
        }
      : {
          heading: "Nothing assigned",
          body: "Cards assigned to you across your workspaces appear here — including cards without a due date, under Later.",
        };

  return (
    <section className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-muted" aria-hidden="true">
        <HugeiconsIcon icon={Calendar03Icon} className="size-5 text-muted-foreground" />
      </span>
      <h2 className="text-sm font-medium text-foreground">{copy.heading}</h2>
      <p className="max-w-sm text-xs text-muted-foreground">{copy.body}</p>
      <Button asChild variant="secondary" size="sm">
        <Link href="/boards">Go to boards</Link>
      </Button>
    </section>
  );
}

/**
 * Deterministic pre-mount placeholder. Server HTML and the first client paint
 * must be IDENTICAL (hydration can never rebucket), so before mount we render
 * no time-dependent grouping — just the page header + this skeleton (same
 * shape as loading.tsx), with one `role="status"` announcement.
 */
function TodaySkeletonSections() {
  return (
    <div className="grid gap-8">
      <p role="status" className="sr-only">
        Loading your day…
      </p>
      {[0, 1, 2, 3].map((section) => (
        <div key={section} className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function TodayGroups({ cards, now }: { cards: TodayCard[]; now: Date }) {
  const groups = useMemo(() => groupTodayCards(cards, now), [cards, now]);

  return (
    <div className="grid gap-8">
      {groups.map((group) => (
        <TodaySection key={group.key} group={group} now={now} />
      ))}
    </div>
  );
}

/**
 * End-of-list status + fallback affordance for the infinite-scroll loop.
 *
 * DESIGN.md voice: all states are quiet secondary text (`text-muted-foreground`)
 * or the action's own error in `text-destructive`; nothing here is a
 * prominent CTA and nothing animates (safe under prefers-reduced-motion).
 *
 *  - loading → polite `role="status"` line while a batch is in flight;
 *  - auto-load failure → `role="alert"` with the action's message + a subtle
 *    ghost retry button (keyboard/SR-accessible retry, never steals focus);
 *  - observer-less environment (no IntersectionObserver) → the same subtle
 *    ghost button as the standing manual affordance;
 *  - end of data → polite "All assigned cards are shown" completion status.
 */
function TodayEndStatus({
  hasMore,
  isLoadingMore,
  loadError,
  observerSupported,
  onRetry,
}: {
  hasMore: boolean;
  isLoadingMore: boolean;
  loadError: string | null;
  observerSupported: boolean;
  onRetry: () => void;
}) {
  if (isLoadingMore) {
    return (
      <div className="flex flex-col items-center py-1">
        <p role="status" className="text-xs text-muted-foreground">
          Loading more cards…
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-2 py-1">
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
    return (
      <div className="flex flex-col items-center py-1">
        <p role="status" className="text-xs text-muted-foreground">
          All assigned cards are shown
        </p>
      </div>
    );
  }

  // More data may exist but auto-load is unavailable — keep a subtle manual
  // affordance as the only path (never a prominent permanent CTA).
  if (!observerSupported) {
    return (
      <div className="flex flex-col items-center py-1">
        <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
          Load more
        </Button>
      </div>
    );
  }

  return null;
}

export function TodayView({
  workspaceCount,
  cards: initialCards,
  hasMore: initialHasMore,
  now,
}: TodayViewProps) {
  // The viewer's clock, captured once at the FIRST client render. SSR never
  // reads it: pre-mount we render the deterministic skeleton, and hydration's
  // first client paint matches the server HTML exactly, so a remote viewer
  // whose local midnight differs from the server's can never rebucket.
  const [clock] = useState(() => now ?? new Date());

  // Explicit keyset pagination (no silent cap): the first page arrives via
  // props; every later batch is fetched behind the last loaded (dueDate, id)
  // and appended (deduped, then re-grouped), so every assigned card stays
  // reachable. An IntersectionObserver sentinel drives the auto-load loop; a
  // subtle manual fallback covers observer-less environments and doubles as
  // the error-retry affordance.
  const [cards, setCards] = useState(initialCards);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Synchronous in-flight flag: set before the first await, so two observer
  // callbacks in the same tick (or a double-click on the fallback) collapse
  // into one request — the state guard alone cannot see the update yet.
  const requestInFlightRef = useRef(false);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || requestInFlightRef.current) {
      return;
    }
    // The cursor is the last loaded card in the server's (dueDate, id) order
    // — the displayed set is always a deduped prefix, so the max IS the last
    // loaded row and the next page continues exactly (no skip, no duplicate).
    const cursor = getTodayLoadMoreCursor(cards);
    if (!cursor) {
      setHasMore(false);
      return;
    }
    requestInFlightRef.current = true;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const formData = new FormData();
      formData.set("limit", String(TODAY_PAGE_SIZE));
      formData.set("cursorId", cursor.id);
      // Empty string = a null dueDate (the no-due Later group) — a real cursor
      // position, not "no cursor".
      formData.set("cursorDueDate", cursor.dueDate ?? "");
      const result = await loadMoreTodayCardsAction(formData);
      if (!result.success) {
        setLoadError(result.error);
        return;
      }
      setCards((prev) => {
        const seen = new Set(prev.map((card) => card.id));
        const additions = result.items.filter((card) => !seen.has(card.id));
        return [...prev, ...additions];
      });
      setHasMore(result.hasMore);
    } catch {
      setLoadError("Failed to load more cards. Please try again.");
    } finally {
      requestInFlightRef.current = false;
      setIsLoadingMore(false);
    }
  }, [cards, isLoadingMore]);

  // Hydration-safe "mounted" flag (React-docs pattern, no effect): SSR and
  // the first client paint read the SERVER snapshot (false) → deterministic
  // skeleton; once hydrated, React re-checks the CLIENT snapshot (true) → the
  // time-grouped sections render with the browser clock. No
  // suppressHydrationWarning anywhere — the two sides never disagree.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Client-only capability flag: used exclusively inside the mounted branch
  // (never server-rendered), so the SSR skeleton and the first client paint
  // can never disagree. When IntersectionObserver is missing, the manual
  // fallback becomes the permanent (subtle) affordance.
  const observerSupported = typeof IntersectionObserver !== "undefined";

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

  // Auto-load loop: observes the end-of-list sentinel and fetches the next
  // keyset page when it scrolls near. The observer is torn down whenever a
  // load is in flight, an error is showing, the end was reached, or the list
  // changed — and re-created after every append — so one request can never
  // overlap or duplicate the same window. SSR never reaches this: pre-mount
  // renders the deterministic skeleton with no sentinel.
  useEffect(() => {
    if (!mounted || !hasMore || isLoadingMore || loadError) {
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") {
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
      // 600px lookahead: the next batch starts loading just before the
      // sentinel is on screen, so scrolling feels continuous.
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [mounted, hasMore, isLoadingMore, loadError, handleLoadMore]);

  // Empty states are props-only (no clock read): they render identically on
  // the server and the client, so they stay immediate and accessible.
  if (workspaceCount === 0) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <TodayPageHeader />
        <TodayEmptyState variant="no-workspaces" />
      </main>
    );
  }

  if (cards.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <TodayPageHeader />
        <TodayEmptyState variant="nothing-assigned" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <TodayPageHeader />
      {mounted ? (
        <>
          <TodayGroups cards={cards} now={clock} />
          <TodayEndStatus
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            loadError={loadError}
            observerSupported={observerSupported}
            onRetry={handleLoadMore}
          />
          {/* Scroll sentinel: pure trigger, no content. */}
          <div ref={sentinelRef} aria-hidden="true" className="h-px" />
        </>
      ) : (
        <TodaySkeletonSections />
      )}
    </main>
  );
}

function TodayPageHeader() {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Today</h1>
      <p className="text-sm text-muted-foreground">
        Cards assigned to you across your workspaces, grouped by due date.
      </p>
    </header>
  );
}
