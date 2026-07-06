/**
 * Pure, client-side board card filtering (US-013 → US-065).
 *
 * The board renders ALL cards and hides the non-matching ones via CSS rather
 * than removing them from the array — removing would desync @hello-pangea/dnd's
 * index space from the store's `cards` array and corrupt drop positions (see
 * lib/dnd/apply-drop.ts).
 *
 * This module is intentionally pure (no React, no store, no DOM, no `Date.now()`
 * — callers pass `now`) so the matching rules are unit-tested in isolation.
 *
 * US-065 turned the label-only filter into a Trello-style multi-dimension filter:
 * keyword search + members + card status + due date + activity. Within a
 * dimension options combine via OR; across dimensions they combine via AND. An
 * active keyword suspends the dimensions (the call site matches on the query
 * alone) — that composition rule lives in ListColumn, not here, so each matcher
 * stays independently testable.
 */

export type LabelOption = { id: string; name: string; color: string };
export type MemberOption = { id: string; name: string; image: string | null };

/** Card status buckets (US-045: completion is `completedAt` null-ness). */
export type CardStatus = "complete" | "incomplete";

/** Due-date buckets, relative to `now`. `none` = card has no due date. */
export type DueBucket = "overdue" | "day" | "week" | "month" | "none";

/** Activity windows: card updated within the last 1 / 2 / 4 weeks. */
export type ActivityWindow = "1w" | "2w" | "4w";

export type CardFilter = {
  /** A card matches if it carries ANY of these label ids (OR). Empty = no constraint. */
  labelIds: string[];
  /** A card matches if it is assigned to ANY of these member ids (OR). Empty = no constraint. */
  memberIds: string[];
  /** Match cards with no members assigned. */
  noMembers: boolean;
  /** Match cards assigned to the current viewer (resolved against `currentUserId`). */
  assignedToMe: boolean;
  /** A card matches if its status is ANY of these (OR). Empty = no constraint. */
  statuses: CardStatus[];
  /** A card matches if its due date falls in ANY of these buckets (OR). Empty = no constraint. */
  dueBuckets: DueBucket[];
  /** A card matches if it was updated within ANY of these windows (OR). Empty = no constraint. */
  activityWindows: ActivityWindow[];
};

export type FilterableCard = {
  labels: Array<{ id: string }>;
  /** The full, uncapped assignee id set (the card-face `members` array is capped for avatars). */
  memberIds: string[];
  completedAt: Date | null;
  dueDate: Date | null;
  updatedAt: Date | null;
};

export type SearchableCard = {
  title: string;
};

export const EMPTY_FILTER: CardFilter = {
  labelIds: [],
  memberIds: [],
  noMembers: false,
  assignedToMe: false,
  statuses: [],
  dueBuckets: [],
  activityWindows: [],
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** True when the filter constrains anything — drives the toolbar's active state. */
export function isFilterActive(filter: CardFilter): boolean {
  return activeFilterCount(filter) > 0;
}

/** The number of active filter constraints — shown as the trigger's count badge. */
export function activeFilterCount(filter: CardFilter): number {
  return (
    filter.labelIds.length +
    filter.memberIds.length +
    (filter.noMembers ? 1 : 0) +
    (filter.assignedToMe ? 1 : 0) +
    filter.statuses.length +
    filter.dueBuckets.length +
    filter.activityWindows.length
  );
}

/** True when the search query constrains anything (non-whitespace). */
export function isSearchActive(query: string): boolean {
  return query.trim().length > 0;
}

/**
 * Whether a card survives the search query. Case-insensitive substring match on
 * the title; an empty / whitespace-only query matches everything.
 *
 * Search is title-only — the board-view card carries `title` and `labels` but
 * not `description` (that lives in the detail sheet).
 */
export function cardMatchesQuery(card: SearchableCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return true;
  }
  return card.title.toLowerCase().includes(q);
}

/** Label dimension: OR over selected label ids; empty selection matches all. */
export function cardMatchesLabels(card: FilterableCard, labelIds: string[]): boolean {
  if (labelIds.length === 0) {
    return true;
  }
  return card.labels.some((label) => labelIds.includes(label.id));
}

/**
 * Member dimension: OR across specific members, the "no members" option, and the
 * "assigned to me" option. No member constraint active → matches all.
 */
export function cardMatchesMembers(
  card: FilterableCard,
  filter: Pick<CardFilter, "memberIds" | "noMembers" | "assignedToMe">,
  currentUserId: string | null,
): boolean {
  const active =
    filter.memberIds.length > 0 || filter.noMembers || filter.assignedToMe;
  if (!active) {
    return true;
  }
  if (filter.memberIds.some((id) => card.memberIds.includes(id))) {
    return true;
  }
  if (filter.noMembers && card.memberIds.length === 0) {
    return true;
  }
  if (filter.assignedToMe && currentUserId !== null && card.memberIds.includes(currentUserId)) {
    return true;
  }
  return false;
}

/** Status dimension: OR over selected statuses; empty selection matches all. */
export function cardMatchesStatus(card: FilterableCard, statuses: CardStatus[]): boolean {
  if (statuses.length === 0) {
    return true;
  }
  const isComplete = card.completedAt !== null;
  return statuses.some((status) =>
    status === "complete" ? isComplete : !isComplete,
  );
}

// Local midnight of a date. Due dates are day-granular in Planora (the picker
// stores local midnight, no time-of-day — see card-detail-sheet), so bucket
// math compares whole calendar days, not raw timestamps.
function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Due-date dimension: OR over selected buckets, computed relative to `now` by
 * calendar day (mirrors the card-face badge, which is also day-granular). A card
 * is `overdue` only when its due date is a *past* day — a card due **today** is
 * never overdue (its badge reads "Today"); it instead falls into the forward
 * windows. `day`/`week`/`month` = due today through the next 1 / 7 / 30 days;
 * `none` = no due date. Empty selection matches all.
 */
export function cardMatchesDue(
  card: FilterableCard,
  buckets: DueBucket[],
  now: Date,
): boolean {
  if (buckets.length === 0) {
    return true;
  }
  const nowDay = startOfDay(now).getTime();
  const due = card.dueDate;

  return buckets.some((bucket) => {
    if (bucket === "none") {
      return due === null;
    }
    if (due === null) {
      return false;
    }
    const diffDays = Math.round((startOfDay(due).getTime() - nowDay) / DAY_MS);
    switch (bucket) {
      case "overdue":
        return diffDays < 0;
      case "day":
        return diffDays >= 0 && diffDays <= 1;
      case "week":
        return diffDays >= 0 && diffDays <= 7;
      case "month":
        return diffDays >= 0 && diffDays <= 30;
      default:
        return false;
    }
  });
}

/**
 * Activity dimension: OR over selected windows. A card matches a window if its
 * `updatedAt` is within the last 1 / 2 / 4 weeks of `now`. A card with no
 * `updatedAt` never matches (activity cannot be proven). Empty selection matches all.
 */
export function cardMatchesActivity(
  card: FilterableCard,
  windows: ActivityWindow[],
  now: Date,
): boolean {
  if (windows.length === 0) {
    return true;
  }
  const updated = card.updatedAt;
  if (updated === null) {
    return false;
  }
  const ageMs = now.getTime() - updated.getTime();
  return windows.some((window) => {
    switch (window) {
      case "1w":
        return ageMs <= WEEK_MS;
      case "2w":
        return ageMs <= 2 * WEEK_MS;
      case "4w":
        return ageMs <= 4 * WEEK_MS;
      default:
        return false;
    }
  });
}

/**
 * Whether a card survives every active filter dimension (AND across dimensions).
 * Does NOT consider the keyword search — an active keyword suspends the
 * dimensions, which the call site (ListColumn) enforces by matching on the query
 * alone instead of calling this.
 */
export function cardMatchesAllDimensions(
  card: FilterableCard,
  filter: CardFilter,
  now: Date,
  currentUserId: string | null,
): boolean {
  return (
    cardMatchesLabels(card, filter.labelIds) &&
    cardMatchesMembers(card, filter, currentUserId) &&
    cardMatchesStatus(card, filter.statuses) &&
    cardMatchesDue(card, filter.dueBuckets, now) &&
    cardMatchesActivity(card, filter.activityWindows, now)
  );
}

/**
 * The distinct labels in use across the board's cards, sorted by name — the
 * option set for the label filter. Derived from the cards already in the store
 * (no extra fetch); only labels actually applied to a card appear.
 */
export function availableLabels(
  lists: Array<{ cards: Array<{ labels: LabelOption[] }> }>,
): LabelOption[] {
  const byId = new Map<string, LabelOption>();
  for (const list of lists) {
    for (const card of list.cards) {
      for (const label of card.labels) {
        if (!byId.has(label.id)) {
          byId.set(label.id, label);
        }
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The distinct members assigned across the board's cards, sorted by name — the
 * option set for the member filter. Derived from the (uncapped) `members` the
 * store already holds; only members actually assigned to a card appear.
 *
 * `excludeId` drops one member from the list — the board passes the current
 * viewer's id, since the "Assigned to me" quick option already covers them, so a
 * named self-entry would be a redundant duplicate. `null` (the default) excludes
 * no one.
 */
export function availableMembers(
  lists: Array<{ cards: Array<{ members: MemberOption[] }> }>,
  excludeId: string | null = null,
): MemberOption[] {
  const byId = new Map<string, MemberOption>();
  for (const list of lists) {
    for (const card of list.cards) {
      for (const member of card.members) {
        if (member.id !== excludeId && !byId.has(member.id)) {
          byId.set(member.id, member);
        }
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
