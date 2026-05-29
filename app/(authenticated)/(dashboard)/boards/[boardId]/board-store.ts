"use client";

import { create } from "zustand";

import type { CardMovedPayload, CommentCreatedPayload } from "@/lib/realtime/types";

export type ListWithCards = {
  id: string;
  title: string;
  boardId: string;
  isDone: boolean;
  cards: Array<{
    id: string;
    listId: string;
    title: string;
    position: number;
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

  setBoardId: (boardId: string) => void;
  setLists: (lists: ListWithCards[]) => void;
  setSelectedCardId: (cardId: string | null) => void;
  setSelectedCard: (card: SelectedCardData | null) => void;
  setSocketConnected: (connected: boolean) => void;
  reset: () => void;

  applyRemoteCardMoved: (payload: CardMovedPayload) => void;
  applyRemoteCommentCreated: (payload: CommentCreatedPayload) => void;
};

export const useBoardStore = create<BoardStore>((set, get) => ({
  boardId: null,
  lists: [],
  selectedCardId: null,
  selectedCard: null,
  socketConnected: false,

  setBoardId: (boardId) => set({ boardId }),

  setLists: (lists) => set({ lists }),

  setSelectedCardId: (cardId) => set({ selectedCardId: cardId }),

  setSelectedCard: (card) => set({ selectedCard: card }),

  setSocketConnected: (connected) => set({ socketConnected: connected }),

  reset: () => set({
    boardId: null,
    lists: [],
    selectedCardId: null,
    selectedCard: null,
    socketConnected: false,
  }),

  applyRemoteCardMoved: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    const { cardId, listId, position } = payload;

    set((state) => {
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
