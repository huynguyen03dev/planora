/**
 * US-083 W6 — pure `/today` grouping helpers (client-safe: no server-only
 * import, no db, no clock reads). The four buckets are disjoint in the
 * VIEWER'S LOCAL calendar time, so every helper takes `now` as an argument
 * and the client boundary injects the browser clock.
 *
 * Bucket contract (locked, US-077 AC2 incorporated by reference):
 *   Overdue        diff < 0
 *   Due Today      diff = 0
 *   Due This Week  diff 1..7 inclusive
 *   Later          diff >= 8 or no due date
 * where diff = whole calendar days from `now` to `dueDate` in the local
 * calendar (DST-proof day-number arithmetic — never a 24h rollover window).
 * Completed cards are excluded globally (the query filters completedAt; the
 * grouping re-checks it so the AC2 predicate holds at every layer).
 */

export type TodaySectionKey = "overdue" | "today" | "week" | "later";

export type TodayPriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;

/** Serializable card shape the RSC read model hands to the client boundary. */
export type TodayCard = {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  priority: TodayPriority;
  board: {
    id: string;
    title: string;
    workspaceId: string;
    workspace: { name: string };
  };
  list: { id: string; title: string };
};

export type TodaySectionGroup = {
  key: TodaySectionKey;
  title: string;
  count: number;
  cards: TodayCard[];
};

const SECTION_TITLES: Record<TodaySectionKey, string> = {
  overdue: "Overdue",
  today: "Due Today",
  week: "Due This Week",
  later: "Later",
};

export const TODAY_SECTION_ORDER: readonly TodaySectionKey[] = [
  "overdue",
  "today",
  "week",
  "later",
];

/**
 * Whole calendar days from `now` to `dueDate` in the local calendar. Day
 * numbers are computed via Date.UTC on the LOCAL calendar fields, so the
 * difference is an exact integer in every timezone — DST transitions (23/25h
 * days) and the runner's own zone can never produce fractional results.
 */
export function calendarDayDiff(dueDate: Date, now: Date): number {
  const dueDay = Date.UTC(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  );
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((dueDay - nowDay) / 86_400_000);
}

export function getTodaySectionKey(
  dueDate: string | null,
  now: Date,
): TodaySectionKey {
  if (!dueDate) {
    return "later";
  }
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return "later";
  }
  const diff = calendarDayDiff(due, now);
  if (diff < 0) {
    return "overdue";
  }
  if (diff === 0) {
    return "today";
  }
  if (diff <= 7) {
    return "week";
  }
  return "later";
}

export type TodayDueMeta = { label: string; a11yLabel: string };

/**
 * Tile-level due chip: icon + word, never color-only (WCAG 1.4.1). Mirrors
 * the card-face due-badge voice (components/boards/list-card-item.tsx) —
 * "Today"/"Tomorrow" words, a calendar date otherwise, and an a11y string
 * that always names the state. Null when there is no due date.
 */
export function describeTodayDue(
  dueDate: string | null,
  now: Date,
): TodayDueMeta | null {
  if (!dueDate) {
    return null;
  }
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  const diff = calendarDayDiff(due, now);
  // English Planora UI: the locale is pinned explicitly so a non-en-US
  // server/browser locale can never produce different label text (or
  // server/client label divergence).
  const dayLabel = due.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(due.getFullYear() === now.getFullYear()
      ? {}
      : { year: "numeric" }),
  });

  if (diff < 0) {
    return { label: dayLabel, a11yLabel: `Overdue, due ${dayLabel}` };
  }
  if (diff === 0) {
    return { label: "Today", a11yLabel: "Due today" };
  }
  if (diff === 1) {
    return { label: "Tomorrow", a11yLabel: "Due tomorrow" };
  }
  return { label: dayLabel, a11yLabel: `Due ${dayLabel}` };
}

/**
 * Partition cards into the four fixed-order sections. Completed cards are
 * dropped (defensive; the read model already excludes them). Within a section
 * cards sort by due date ascending (no-due last), then by title — stable,
 * deterministic rendering for tiles and E2E.
 */
export function groupTodayCards(
  cards: TodayCard[],
  now: Date,
): TodaySectionGroup[] {
  const buckets: Record<TodaySectionKey, TodayCard[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
  };

  for (const card of cards) {
    if (card.completedAt) {
      continue;
    }
    buckets[getTodaySectionKey(card.dueDate, now)].push(card);
  }

  const byDueThenTitle = (a: TodayCard, b: TodayCard): number => {
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) {
      return aDue - bDue;
    }
    return a.title.localeCompare(b.title);
  };

  return TODAY_SECTION_ORDER.map((key) => ({
    key,
    title: SECTION_TITLES[key],
    count: buckets[key].length,
    cards: [...buckets[key]].sort(byDueThenTitle),
  }));
}
