"use client";

import { Calendar03Icon, Flag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DUE_META_CHIP_CLASS, PRIORITY_META_CHIP } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  describeTodayDue,
  getTodaySectionKey,
  groupTodayCards,
  type TodayCard,
  type TodaySectionGroup,
  type TodaySectionKey,
} from "@/lib/today";

type TodayViewProps = {
  workspaceCount: number;
  cards: TodayCard[];
  /** Injected clock for deterministic grouping; defaults to the browser clock. */
  now?: Date;
};

// Priority chip — shared meta-chip ramp with the card face
// (components/boards/list-card-item.tsx, lib/constants.ts): token tint pairs
// (label-*, warning), AA-measured in globals.css for both themes, icon + word,
// never color-only (WCAG 1.4.1).

// Due chip tint per bucket — values are the shared card-face due-state ramp
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
      <h2 className="text-sm font-medium text-foreground">{copy.heading}</h2>
      <p className="max-w-sm text-xs text-muted-foreground">{copy.body}</p>
      <Button asChild variant="secondary" size="sm">
        <Link href="/boards">Go to boards</Link>
      </Button>
    </section>
  );
}

/**
 * Deterministic pre-mount placeholder. Server HTML and the first client
 * paint must be IDENTICAL (hydration can never rebucket), so while the
 * component is not yet mounted we render no time-dependent grouping at all —
 * just the page header + this skeleton (same shape as loading.tsx). One
 * `role="status"` announcement; the Skeleton blocks are aria-hidden per the
 * ui/skeleton contract.
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

export function TodayView({ workspaceCount, cards, now }: TodayViewProps) {
  // The viewer's clock, captured once at the FIRST client render. SSR never
  // reads it: pre-mount we render the deterministic skeleton, and hydration's
  // first client paint matches the server HTML exactly. Grouping/labels use
  // this captured clock only after mount, so a remote viewer whose local
  // midnight differs from the server's can never rebucket on hydration.
  const [clock] = useState(() => now ?? new Date());

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
      {mounted ? <TodayGroups cards={cards} now={clock} /> : <TodaySkeletonSections />}
    </main>
  );
}

function TodayPageHeader() {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold text-foreground">Today</h1>
      <p className="text-sm text-muted-foreground">
        Cards assigned to you across your workspaces, grouped by due date.
      </p>
    </header>
  );
}
