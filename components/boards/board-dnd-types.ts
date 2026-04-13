export const LIST_SORTABLE_PREFIX = "list";
export const CARD_SORTABLE_PREFIX = "card";

export type SortableKind = "list" | "card";

export function toListSortableId(listId: string): string {
  return `${LIST_SORTABLE_PREFIX}:${listId}`;
}

export function toCardSortableId(cardId: string): string {
  return `${CARD_SORTABLE_PREFIX}:${cardId}`;
}

export function parseSortableId(sortableId: string): {
  kind: SortableKind | null;
  id: string | null;
} {
  const [kind, id] = sortableId.split(":");
  if (!kind || !id) {
    return { kind: null, id: null };
  }

  if (kind !== LIST_SORTABLE_PREFIX && kind !== CARD_SORTABLE_PREFIX) {
    return { kind: null, id: null };
  }

  return { kind, id };
}
