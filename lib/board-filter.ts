/**
 * Pure, client-side board card filtering (US-013).
 *
 * Slice 1 filters by label only — the board-view card carries `labels` but not
 * `dueDate`/`assignees` (those live in the detail sheet), so assignee/due-date
 * filtering is a follow-up slice that first enriches the card payload.
 *
 * This module is intentionally pure (no React, no store, no DOM) so the matching
 * rule is unit-tested in isolation. The board renders ALL cards and hides the
 * non-matching ones via CSS rather than removing them from the array — removing
 * would desync @hello-pangea/dnd's index space from the store's `cards` array
 * and corrupt drop positions (see lib/dnd/apply-drop.ts).
 */

export type LabelOption = { id: string; name: string; color: string };

export type CardFilter = {
  /** A card matches if it carries ANY of these label ids (OR). Empty = no label constraint. */
  labelIds: string[];
};

export type FilterableCard = {
  labels: Array<{ id: string }>;
};

export type SearchableCard = {
  title: string;
};

export const EMPTY_FILTER: CardFilter = { labelIds: [] };

/** True when the filter constrains anything — drives the toolbar's active state. */
export function isFilterActive(filter: CardFilter): boolean {
  return filter.labelIds.length > 0;
}

/** True when the search query constrains anything (non-whitespace). */
export function isSearchActive(query: string): boolean {
  return query.trim().length > 0;
}

/**
 * Whether a card survives the search query. Case-insensitive substring match on
 * the title; an empty / whitespace-only query matches everything.
 *
 * Slice 1 searches the title only — the board-view card carries `title` and
 * `labels` but not `description` (that lives in the detail sheet), so searching
 * the description is a follow-up slice that first enriches the card payload.
 * Search composes with the label filter via AND at the call site (ListColumn).
 */
export function cardMatchesQuery(card: SearchableCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return true;
  }
  return card.title.toLowerCase().includes(q);
}

/**
 * Whether a card survives the filter. OR semantics within labels: a card matches
 * if it has at least one selected label. An empty filter matches everything.
 */
export function cardMatchesFilter(card: FilterableCard, filter: CardFilter): boolean {
  if (filter.labelIds.length === 0) {
    return true;
  }
  return card.labels.some((label) => filter.labelIds.includes(label.id));
}

/**
 * The distinct labels in use across the board's cards, sorted by name — the
 * option set for the filter control. Derived from the cards already in the store
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
