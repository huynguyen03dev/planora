"use client";

import { create } from "zustand";

import type {
  CardArchivedPayload,
  CardCreatedPayload,
  CardLabelsUpdatedPayload,
  CardMembersUpdatedPayload,
  CardMovedPayload,
  CardUpdatedPayload,
  CommentCreatedPayload,
  ListCreatedPayload,
  ListDeletedPayload,
  ListMovedPayload,
  ListUpdatedPayload,
} from "@/lib/realtime/types";

export type CardLabel = {
  id: string;
  name: string;
  color: string;
};

export type ListWithCards = {
  id: string;
  title: string;
  boardId: string;
  isDone: boolean;
  position: number;
  cards: Array<{
    id: string;
    listId: string;
    title: string;
    position: number;
    labels: CardLabel[];
  }>;
};

export type SelectedCardData = {
  card: {
    id: string;
    listId: string;
    title: string;
    description: string | null;
    estimateHours: number | null;
    dueDate: Date | null;
    completedAt: Date | null;
    updatedAt: Date;
  };
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date;
    user: {
      id: string;
      name: string;
      image: string | null;
    };
  }>;
  activity: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: Date;
    user: {
      id: string;
      name: string;
      image: string | null;
    };
    metadata: Record<string, unknown> | null;
  }>;
  attachments: Array<{
    id: string;
    url: string;
    filename: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
  }>;
  assignees: Array<{
    id: string;
    name: string;
    email: string;
    image: string | null;
  }>;
  assignableMembers: Array<{
    id: string;
    name: string;
    email: string;
    image: string | null;
  }>;
};

type BoardStore = {
  boardId: string | null;
  lists: ListWithCards[];
  selectedCardId: string | null;
  selectedCard: SelectedCardData | null;
  socketConnected: boolean;
  isDragging: boolean;
  pendingResync: boolean;
  /** Client-only view filter: card label ids to keep visible (OR). Empty = show all. */
  filterLabelIds: string[];

  setBoardId: (boardId: string) => void;
  setLists: (lists: ListWithCards[]) => void;
  setSelectedCardId: (cardId: string | null) => void;
  setSelectedCard: (card: SelectedCardData | null) => void;
  setSocketConnected: (connected: boolean) => void;
  setDragging: (dragging: boolean) => void;
  markResyncPending: () => void;
  consumeResync: () => boolean;
  toggleLabelFilter: (labelId: string) => void;
  clearFilters: () => void;
  reset: () => void;

  applyRemoteCardMoved: (payload: CardMovedPayload) => void;
  applyRemoteListMoved: (payload: ListMovedPayload) => void;
  applyRemoteListCreated: (payload: ListCreatedPayload) => void;
  applyRemoteListUpdated: (payload: ListUpdatedPayload) => void;
  applyRemoteListDeleted: (payload: ListDeletedPayload) => void;
  applyRemoteCardCreated: (payload: CardCreatedPayload) => void;
  applyRemoteCardUpdated: (payload: CardUpdatedPayload) => void;
  applyRemoteCardArchived: (payload: CardArchivedPayload) => void;
  applyRemoteCardLabelsUpdated: (payload: CardLabelsUpdatedPayload) => void;
  applyRemoteCardMembersUpdated: (payload: CardMembersUpdatedPayload) => void;
  applyRemoteCommentCreated: (payload: CommentCreatedPayload) => void;
};

export const useBoardStore = create<BoardStore>((set, get) => ({
  boardId: null,
  lists: [],
  selectedCardId: null,
  selectedCard: null,
  socketConnected: false,
  isDragging: false,
  pendingResync: false,
  filterLabelIds: [],

  setBoardId: (boardId) => set({ boardId }),

  setLists: (lists) => set({ lists }),

  setSelectedCardId: (cardId) => set({ selectedCardId: cardId }),

  setSelectedCard: (card) => set({ selectedCard: card }),

  setSocketConnected: (connected) => set({ socketConnected: connected }),

  setDragging: (dragging) => set({ isDragging: dragging }),

  // A structural remote board event (reorder/create/delete/archive) arrived
  // while a local drag was in flight and was skipped to keep the list array
  // stable under @hello-pangea/dnd. Flag that the board is now behind the
  // server so BoardContent can reconcile via router.refresh() on drop.
  markResyncPending: () => set({ pendingResync: true }),

  // Read the pending-resync flag and clear it in a single step. Returns whether
  // at least one remote event was deferred during the drag just completed.
  consumeResync: () => {
    const pending = get().pendingResync;
    if (pending) {
      set({ pendingResync: false });
    }
    return pending;
  },

  // View-only label filter (no server round-trip). Toggling a label adds/removes
  // it from the keep-visible set; the board hides non-matching cards via CSS.
  toggleLabelFilter: (labelId) => set((state) => ({
    filterLabelIds: state.filterLabelIds.includes(labelId)
      ? state.filterLabelIds.filter((id) => id !== labelId)
      : [...state.filterLabelIds, labelId],
  })),

  clearFilters: () => set({ filterLabelIds: [] }),

  reset: () => set({
    boardId: null,
    lists: [],
    selectedCardId: null,
    selectedCard: null,
    socketConnected: false,
    isDragging: false,
    pendingResync: false,
    filterLabelIds: [],
  }),

  applyRemoteCardMoved: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    const { cardId, listId, position } = payload;

    set((state) => {
      // Self-echo dedupe: if the card already sits in the target list at the
      // canonical position this payload carries, the store already reflects the
      // move (the actor's own echo after a prior position-correcting apply, or a
      // duplicate echo). No-op to avoid a redundant re-render. A genuine
      // cross-user move (card elsewhere, or a stale optimistic position) still
      // applies — applying is what now delivers canonical float-gap positions to
      // the actor, since reorder/move no longer revalidate (decision 0008).
      const reflectingList = state.lists.find((list) => list.id === listId);
      if (
        reflectingList &&
        reflectingList.cards.some((card) => card.id === cardId && card.position === position)
      ) {
        return state;
      }

      const sourceList = state.lists.find((list) => list.cards.some((card) => card.id === cardId));
      const targetListExists = state.lists.some((list) => list.id === listId);

      if (!sourceList || !targetListExists) {
        return state;
      }

      const foundCard = sourceList.cards.find((card) => card.id === cardId);
      if (!foundCard) {
        return state;
      }

      const movedCard = { ...foundCard, listId, position };

      const newLists = state.lists.map((list) => {
        const cardsWithoutMovedCard = list.cards.filter((card) => card.id !== cardId);

        if (list.id === sourceList.id && list.id === listId) {
          return {
            ...list,
            cards: [...cardsWithoutMovedCard, movedCard].sort((a, b) => a.position - b.position),
          };
        }

        if (list.id === sourceList.id) {
          return {
            ...list,
            cards: cardsWithoutMovedCard.sort((a, b) => a.position - b.position),
          };
        }

        if (list.id === listId) {
          return {
            ...list,
            cards: [...cardsWithoutMovedCard, movedCard].sort((a, b) => a.position - b.position),
          };
        }

        return list;
      });

      const newSelectedCard =
        state.selectedCardId === cardId && state.selectedCard
          ? { ...state.selectedCard, card: { ...state.selectedCard.card, listId } }
          : state.selectedCard;

      return { lists: newLists, selectedCard: newSelectedCard };
    });
  },

  applyRemoteListMoved: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    const { listId, position } = payload;

    set((state) => {
      const targetList = state.lists.find((list) => list.id === listId);

      if (!targetList) {
        return state;
      }

      // Self-echo dedupe: already at the canonical position → no-op (the actor's
      // own echo after the position was applied, or a duplicate). A real move
      // (stale optimistic position, or cross-user) still applies and re-sorts.
      if (targetList.position === position) {
        return state;
      }

      const newLists = state.lists
        .map((list) => (list.id === listId ? { ...list, position } : list))
        .sort((a, b) => a.position - b.position);

      return { lists: newLists };
    });
  },

  applyRemoteListCreated: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    set((state) => {
      // Self-echo dedupe: the creator receives their own emit on top of the
      // revalidate reseed. If the list already exists, leave state unchanged.
      if (state.lists.some((list) => list.id === payload.list.id)) {
        return state;
      }

      const newLists = [...state.lists, { ...payload.list, cards: [] }].sort(
        (a, b) => a.position - b.position,
      );

      return { lists: newLists };
    });
  },

  applyRemoteListUpdated: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    set((state) => {
      const targetList = state.lists.find((list) => list.id === payload.listId);

      if (!targetList) {
        return state;
      }

      const newLists = state.lists.map((list) => {
        if (list.id !== payload.listId) {
          return list;
        }

        return {
          ...list,
          ...(payload.title !== undefined ? { title: payload.title } : {}),
          ...(payload.isDone !== undefined ? { isDone: payload.isDone } : {}),
        };
      });

      return { lists: newLists };
    });
  },

  applyRemoteListDeleted: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    set((state) => {
      const exists = state.lists.some((list) => list.id === payload.listId);

      if (!exists) {
        return state;
      }

      return {
        lists: state.lists.filter((list) => list.id !== payload.listId),
      };
    });
  },

  applyRemoteCardCreated: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    set((state) => {
      // Self-echo dedupe: the creator receives their own emit on top of the
      // revalidate reseed. If the card already exists in any list, no-op.
      if (state.lists.some((list) => list.cards.some((card) => card.id === payload.card.id))) {
        return state;
      }

      const targetListExists = state.lists.some((list) => list.id === payload.card.listId);

      if (!targetListExists) {
        return state;
      }

      const newLists = state.lists.map((list) => {
        if (list.id !== payload.card.listId) {
          return list;
        }

        return {
          ...list,
          cards: [...list.cards, { ...payload.card, labels: [] }].sort(
            (a, b) => a.position - b.position,
          ),
        };
      });

      return { lists: newLists };
    });
  },

  applyRemoteCardUpdated: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    set((state) => {
      const exists = state.lists.some((list) =>
        list.cards.some((card) => card.id === payload.cardId),
      );

      if (!exists) {
        return state;
      }

      const newLists = state.lists.map((list) => {
        if (!list.cards.some((card) => card.id === payload.cardId)) {
          return list;
        }

        return {
          ...list,
          cards: list.cards.map((card) =>
            card.id === payload.cardId ? { ...card, title: payload.title } : card,
          ),
        };
      });

      const newSelectedCard =
        state.selectedCardId === payload.cardId && state.selectedCard
          ? { ...state.selectedCard, card: { ...state.selectedCard.card, title: payload.title } }
          : state.selectedCard;

      return { lists: newLists, selectedCard: newSelectedCard };
    });
  },

  applyRemoteCardArchived: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    set((state) => {
      const exists = state.lists.some((list) =>
        list.cards.some((card) => card.id === payload.cardId),
      );

      const isSelected = state.selectedCardId === payload.cardId;

      if (!exists && !isSelected) {
        return state;
      }

      const newLists = exists
        ? state.lists.map((list) => {
            if (!list.cards.some((card) => card.id === payload.cardId)) {
              return list;
            }

            return {
              ...list,
              cards: list.cards.filter((card) => card.id !== payload.cardId),
            };
          })
        : state.lists;

      if (isSelected) {
        return { lists: newLists, selectedCardId: null, selectedCard: null };
      }

      return { lists: newLists };
    });
  },

  applyRemoteCardLabelsUpdated: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    set((state) => {
      const owningList = state.lists.find((list) =>
        list.cards.some((card) => card.id === payload.cardId),
      );

      if (!owningList) {
        return state;
      }

      // Self-echo dedupe: if the card already carries this exact label set (same
      // ids, names, colors, same order), the store is current (the actor's own
      // echo after router.refresh already reseeded it). No-op to skip a redundant
      // re-render. The name/color comparison matters: a label rename/recolor
      // keeps the id set unchanged, so an id-only check would wrongly swallow it
      // and leave stale chips (US-010).
      const current = owningList.cards.find((card) => card.id === payload.cardId);
      if (
        current &&
        current.labels.length === payload.labels.length &&
        current.labels.every(
          (label, index) =>
            label.id === payload.labels[index].id &&
            label.name === payload.labels[index].name &&
            label.color === payload.labels[index].color,
        )
      ) {
        return state;
      }

      const newLists = state.lists.map((list) => {
        if (!list.cards.some((card) => card.id === payload.cardId)) {
          return list;
        }

        return {
          ...list,
          cards: list.cards.map((card) =>
            card.id === payload.cardId ? { ...card, labels: payload.labels } : card,
          ),
        };
      });

      return { lists: newLists };
    });
  },

  applyRemoteCardMembersUpdated: (payload) => {
    // Members render only in the open card detail sheet (never on the list
    // array), so this is in-place / live and scoped to the currently-open card.
    const { boardId, selectedCardId, selectedCard } = get();

    if (boardId !== payload.boardId || selectedCardId !== payload.cardId || !selectedCard) {
      return;
    }

    set((state) => {
      if (!state.selectedCard || state.selectedCard.card.id !== payload.cardId) {
        return state;
      }

      // Self-echo dedupe: identical assignee id set (same order) → no-op so the
      // actor's own echo (after router.refresh already reseeded) skips a re-render.
      const currentIds = state.selectedCard.assignees.map((member) => member.id);
      const nextIds = payload.members.map((member) => member.id);
      if (
        currentIds.length === nextIds.length &&
        currentIds.every((id, index) => id === nextIds[index])
      ) {
        return state;
      }

      // Recompute "assignable" (the Add-members pool) from everyone currently
      // known on this card — assignees ∪ assignable — minus the new assignees, so
      // a remotely-removed member returns to the pool and a remotely-added one
      // leaves it, all without a server round-trip.
      const nextAssigneeIds = new Set(nextIds);
      const pool = new Map<string, SelectedCardData["assignableMembers"][number]>();
      for (const member of [...state.selectedCard.assignees, ...state.selectedCard.assignableMembers]) {
        pool.set(member.id, member);
      }
      const nextAssignable = [...pool.values()].filter((member) => !nextAssigneeIds.has(member.id));

      return {
        selectedCard: {
          ...state.selectedCard,
          assignees: payload.members,
          assignableMembers: nextAssignable,
        },
      };
    });
  },

  applyRemoteCommentCreated: (payload) => {
    const { boardId, selectedCardId, selectedCard } = get();

    if (boardId !== payload.boardId || selectedCardId !== payload.cardId || !selectedCard) {
      return;
    }

    const { comment, activity } = payload;

    const newComment = {
      id: comment.id,
      content: comment.content,
      createdAt: new Date(comment.createdAt),
      user: comment.author,
    };

    const newActivity = {
      id: activity.id,
      action: activity.type,
      entityType: "COMMENT",
      createdAt: new Date(activity.createdAt),
      user: activity.user,
      metadata: null,
    };

    set((state) => {
      if (!state.selectedCard || state.selectedCard.card.id !== payload.cardId) {
        return state;
      }

      const existingComment = state.selectedCard.comments.find((c) => c.id === comment.id);
      const existingActivity = state.selectedCard.activity.find((a) => a.id === activity.id);

      if (existingComment || existingActivity) {
        return state;
      }

      return {
        selectedCard: {
          ...state.selectedCard,
          comments: [...state.selectedCard.comments, newComment],
          activity: [newActivity, ...state.selectedCard.activity],
        },
      };
    });
  },
}));
