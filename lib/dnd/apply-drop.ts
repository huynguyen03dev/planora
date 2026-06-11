import type { ListWithCards } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";

/**
 * Translates a @hello-pangea/dnd drop (source/destination indices) into the
 * optimistic next-lists array plus the neighbor-id fields the server actions
 * expect. Index-based: we have exact destination indices, so there is no
 * before/after placement ambiguity.
 *
 * Neighbors are read AFTER insertion from the destination's final order, so the
 * moved item sits between `prev` and `next` and is never referenced by them —
 * matching the server's float gap-ordering contract.
 */
export type DropTranslation =
  | { action: "none" }
  | {
      action: "reorderList";
      nextLists: ListWithCards[];
      fields: { listId: string; prevListId: string | null; nextListId: string | null };
    }
  | {
      action: "reorderCard";
      nextLists: ListWithCards[];
      fields: { cardId: string; prevCardId: string | null; nextCardId: string | null };
    }
  | {
      action: "moveCard";
      nextLists: ListWithCards[];
      fields: {
        cardId: string;
        targetListId: string;
        prevCardId: string | null;
        nextCardId: string | null;
      };
    };

type DropLocation = { droppableId: string; index: number };

export function translateListDrop(
  lists: ListWithCards[],
  draggableId: string,
  source: DropLocation,
  destination: DropLocation,
): DropTranslation {
  if (destination.index === source.index) {
    return { action: "none" };
  }

  if (lists[source.index]?.id !== draggableId) {
    return { action: "none" };
  }

  const next = [...lists];
  const [moved] = next.splice(source.index, 1);
  if (!moved) {
    return { action: "none" };
  }
  next.splice(destination.index, 0, moved);

  const i = destination.index;
  return {
    action: "reorderList",
    nextLists: next,
    fields: {
      listId: draggableId,
      prevListId: i > 0 ? next[i - 1].id : null,
      nextListId: i < next.length - 1 ? next[i + 1].id : null,
    },
  };
}

export function translateCardDrop(
  lists: ListWithCards[],
  cardId: string,
  source: DropLocation,
  destination: DropLocation,
): DropTranslation {
  const sameList = source.droppableId === destination.droppableId;
  if (sameList && destination.index === source.index) {
    return { action: "none" };
  }

  const next = lists.map((list) => ({ ...list, cards: [...list.cards] }));
  const srcList = next.find((list) => list.id === source.droppableId);
  const dstList = next.find((list) => list.id === destination.droppableId);
  if (!srcList || !dstList) {
    return { action: "none" };
  }

  if (srcList.cards[source.index]?.id !== cardId) {
    return { action: "none" };
  }

  const [moved] = srcList.cards.splice(source.index, 1);
  if (!moved) {
    return { action: "none" };
  }
  dstList.cards.splice(destination.index, 0, { ...moved, listId: dstList.id });

  const i = destination.index;
  const cards = dstList.cards;
  const prevCardId = i > 0 ? cards[i - 1].id : null;
  const nextCardId = i < cards.length - 1 ? cards[i + 1].id : null;

  if (sameList) {
    return {
      action: "reorderCard",
      nextLists: next,
      fields: { cardId, prevCardId, nextCardId },
    };
  }

  return {
    action: "moveCard",
    nextLists: next,
    fields: { cardId, targetListId: dstList.id, prevCardId, nextCardId },
  };
}
