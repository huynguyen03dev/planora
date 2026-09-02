import type { ListWithCards } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";

/**
 * Translates a @hello-pangea/dnd drop (source/destination indices) into the
 * optimistic next-lists array plus the placement-intent fields the server
 * actions expect (decision 0032). Index-based: we have exact destination
 * indices, so there is no before/after placement ambiguity.
 *
 * Each translation carries:
 * - `intent`: the EXPLICIT placement ("start" | "end" | "between") derived from
 *   the destination index — never guessed by the server from null hints.
 * - `expectedMoveRevision`: the moved item's PRE-bump revision (the value the
 *   server's DB should still hold). The optimistic `nextLists` bump it by one;
 *   the server CASes on the expected value, so a stale client's reorder is
 *   rejected with ORDER_CONFLICT instead of silently overwriting a rival's move.
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
      fields: {
        listId: string;
        intent: "start" | "end" | "between";
        prevListId: string | null;
        nextListId: string | null;
        expectedMoveRevision: number;
      };
    }
  | {
      action: "reorderCard";
      nextLists: ListWithCards[];
      fields: {
        cardId: string;
        intent: "start" | "end" | "between";
        prevCardId: string | null;
        nextCardId: string | null;
        expectedMoveRevision: number;
      };
    }
  | {
      action: "moveCard";
      nextLists: ListWithCards[];
      fields: {
        cardId: string;
        targetListId: string;
        intent: "start" | "end" | "between";
        prevCardId: string | null;
        nextCardId: string | null;
        expectedMoveRevision: number;
      };
    };

type DropLocation = { droppableId: string; index: number };

/** Derive the explicit placement intent from a final index in an array. */
function intentFor(index: number, length: number): "start" | "end" | "between" {
  if (length <= 1) {
    return "start";
  }
  if (index === 0) {
    return "start";
  }
  if (index === length - 1) {
    return "end";
  }
  return "between";
}

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
  next.splice(destination.index, 0, {
    ...moved,
    // Optimistic OCC bump (decision 0032): the store now believes the list is
    // one ordering-write ahead of the server; the action CASes on the
    // pre-bump value captured below.
    moveRevision: moved.moveRevision + 1,
  });

  const i = destination.index;
  return {
    action: "reorderList",
    nextLists: next,
    fields: {
      listId: draggableId,
      intent: intentFor(i, next.length),
      prevListId: i > 0 ? next[i - 1].id : null,
      nextListId: i < next.length - 1 ? next[i + 1].id : null,
      expectedMoveRevision: moved.moveRevision,
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

  const srcIndex = lists.findIndex((list) => list.id === source.droppableId);
  const dstIndex = lists.findIndex((list) => list.id === destination.droppableId);
  if (srcIndex === -1 || dstIndex === -1) {
    return { action: "none" };
  }

  if (lists[srcIndex].cards[source.index]?.id !== cardId) {
    return { action: "none" };
  }

  // Clone only the lists actually mutated; keep every untouched list (and its
  // cards array) by reference so memoized ListColumns skip re-render. The array
  // identity changes, but unchanged list objects do not.
  const next = [...lists];

  if (sameList) {
    const cards = [...lists[srcIndex].cards];
    const [moved] = cards.splice(source.index, 1);
    if (!moved) {
      return { action: "none" };
    }
    // Same list: listId is unchanged. Clone the card so the optimistic OCC
    // bump (decision 0032) never mutates the shared pre-move reference.
    cards.splice(destination.index, 0, {
      ...moved,
      moveRevision: moved.moveRevision + 1,
    });
    next[srcIndex] = { ...lists[srcIndex], cards };

    const i = destination.index;
    const prevCardId = i > 0 ? cards[i - 1].id : null;
    const nextCardId = i < cards.length - 1 ? cards[i + 1].id : null;
    return {
      action: "reorderCard",
      nextLists: next,
      fields: {
        cardId,
        intent: intentFor(i, cards.length),
        prevCardId,
        nextCardId,
        expectedMoveRevision: moved.moveRevision,
      },
    };
  }

  const srcCards = [...lists[srcIndex].cards];
  const dstCards = [...lists[dstIndex].cards];
  const [moved] = srcCards.splice(source.index, 1);
  if (!moved) {
    return { action: "none" };
  }
  dstCards.splice(destination.index, 0, {
    ...moved,
    listId: lists[dstIndex].id,
    moveRevision: moved.moveRevision + 1,
  });
  next[srcIndex] = { ...lists[srcIndex], cards: srcCards };
  next[dstIndex] = { ...lists[dstIndex], cards: dstCards };

  const i = destination.index;
  const prevCardId = i > 0 ? dstCards[i - 1].id : null;
  const nextCardId = i < dstCards.length - 1 ? dstCards[i + 1].id : null;

  return {
    action: "moveCard",
    nextLists: next,
    fields: {
      cardId,
      targetListId: lists[dstIndex].id,
      intent: intentFor(i, dstCards.length),
      prevCardId,
      nextCardId,
      expectedMoveRevision: moved.moveRevision,
    },
  };
}
