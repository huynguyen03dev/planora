"use client";

import { create } from "zustand";

import type { ActivityWindow, CardStatus, DueBucket } from "@/lib/board-filter";
import type {
  BoardPresencePayload,
  CardArchivedPayload,
  CardCompletionUpdatedPayload,
  CardCreatedPayload,
  CardLabelsUpdatedPayload,
  CardMembersUpdatedPayload,
  CardMetaUpdatedPayload,
  CardMovedPayload,
  CardUpdatedPayload,
  CommentCreatedPayload,
  ListCreatedPayload,
  ListDeletedPayload,
  ListMovedPayload,
  ListUpdatedPayload,
  Watcher,
} from "@/lib/realtime/types";

export type CardLabel = {
  id: string;
  name: string;
  color: string;
};

/** Add `value` to the array if absent, remove it if present. Used by the view filters. */
function toggleInArray<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}

export type ListWithCards = {
  id: string;
  title: string;
  boardId: string;
  position: number;
  /** Logical ordering-move revision (decision 0032); bumped optimistically on drag. */
  moveRevision: number;
  cards: Array<{
    id: string;
    listId: string;
    title: string;
    position: number;
    /** Logical ordering-move revision; sibling normalization does not bump it. */
    moveRevision: number;
    coverImage: string | null;
    priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
    dueDate: Date | null;
    completedAt: Date | null;
    updatedAt: Date;
    labels: CardLabel[];
    members: Array<{ id: string; name: string; image: string | null }>;
    memberCount: number;
    checklistDone: number;
    checklistTotal: number;
    commentCount: number;
  }>;
};

/** Normalize pre-0032 snapshots without changing identities when already canonical. */
function normalizeOrderingRevisions(lists: ListWithCards[]): ListWithCards[] {
  let changed = false;
  const normalized = lists.map((list) => {
    const listRevision = list.moveRevision ?? 0;
    let cardsChanged = false;
    const cards = list.cards.map((card) => {
      const moveRevision = card.moveRevision ?? 0;
      if (moveRevision !== card.moveRevision) {
        changed = true;
        cardsChanged = true;
        return { ...card, moveRevision };
      }
      return card;
    });

    if (listRevision !== list.moveRevision || cardsChanged) {
      changed = true;
      return { ...list, moveRevision: listRevision, cards };
    }
    return list;
  });

  return changed ? normalized : lists;
}

export type SelectedCardData = {
  card: {
    id: string;
    listId: string;
    title: string;
    description: string | null;
    estimateHours: number | null;
    dueDate: Date | null;
    completedAt: Date | null;
    coverImage: string | null;
    priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
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
  /** Label set of the open card — patched live by card:labels-updated (F4) so
   *  the detail sheet can render remote label changes without a reload. */
  labels: CardLabel[];
};

type BoardStore = {
  boardId: string | null;
  lists: ListWithCards[];
  selectedCardId: string | null;
  selectedCard: SelectedCardData | null;
  socketConnected: boolean;
  isDragging: boolean;
  pendingResync: boolean;
  /** Users currently viewing this board (live presence). Deduped, server-driven. */
  watchers: Watcher[];
  /** The current viewer's user id — resolves the "assigned to me" filter option (US-065). */
  currentUserId: string | null;
  /** Client-only view filter: card label ids to keep visible (OR). Empty = show all. */
  filterLabelIds: string[];
  /** Client-only view filter: assignee ids to keep visible (OR). Empty = no constraint. */
  filterMemberIds: string[];
  /** Client-only view filter: keep only cards with no assignees. */
  filterNoMembers: boolean;
  /** Client-only view filter: keep only cards assigned to the current viewer. */
  filterAssignedToMe: boolean;
  /** Client-only view filter: card completion statuses to keep (OR). Empty = no constraint. */
  filterStatuses: CardStatus[];
  /** Client-only view filter: due-date buckets to keep (OR). Empty = no constraint. */
  filterDueBuckets: DueBucket[];
  /** Client-only view filter: activity windows to keep (OR). Empty = no constraint. */
  filterActivityWindows: ActivityWindow[];
  /** Client-only card search: title substring (case-insensitive). Empty = show all. */
  searchQuery: string;
  /** Board-level "expand labels" preference (US-044): false = compact color bars,
   *  true = full text pills. Held here, not per-card, so it survives realtime
   *  re-renders without flicker during a drag. */
  expandLabels: boolean;

  setBoardId: (boardId: string) => void;
  setCurrentUserId: (userId: string | null) => void;
  setLists: (lists: ListWithCards[]) => void;
  setSelectedCardId: (cardId: string | null) => void;
  setSelectedCard: (card: SelectedCardData | null) => void;
  setSocketConnected: (connected: boolean) => void;
  /** Seed presence with the current viewer to avoid an empty-avatar flash; no-op if already populated. */
  seedWatchers: (watchers: Watcher[]) => void;
  setDragging: (dragging: boolean) => void;
  markResyncPending: () => void;
  consumeResync: () => boolean;
  toggleLabelFilter: (labelId: string) => void;
  toggleMemberFilter: (memberId: string) => void;
  toggleNoMembers: () => void;
  toggleAssignedToMe: () => void;
  toggleStatusFilter: (status: CardStatus) => void;
  toggleDueBucket: (bucket: DueBucket) => void;
  toggleActivityWindow: (window: ActivityWindow) => void;
  clearFilters: () => void;
  setSearchQuery: (query: string) => void;
  toggleExpandLabels: () => void;
  reset: () => void;

  applyRemoteCardMoved: (payload: CardMovedPayload) => void;
  applyRemoteListMoved: (payload: ListMovedPayload) => void;
  applyRemoteListCreated: (payload: ListCreatedPayload) => void;
  applyRemoteListUpdated: (payload: ListUpdatedPayload) => void;
  applyRemoteListDeleted: (payload: ListDeletedPayload) => void;
  applyRemoteCardCreated: (payload: CardCreatedPayload) => void;
  applyRemoteCardUpdated: (payload: CardUpdatedPayload) => void;
  applyRemoteCardArchived: (payload: CardArchivedPayload) => void;
  applyRemoteCardCompletionUpdated: (payload: CardCompletionUpdatedPayload) => void;
  applyRemoteCardLabelsUpdated: (payload: CardLabelsUpdatedPayload) => void;
  applyRemoteCardMembersUpdated: (payload: CardMembersUpdatedPayload) => void;
  applyRemoteCardMetaUpdated: (payload: CardMetaUpdatedPayload) => void;
  applyRemoteCommentCreated: (payload: CommentCreatedPayload) => void;
  applyRemotePresence: (payload: BoardPresencePayload) => void;
};

export const useBoardStore = create<BoardStore>((set, get) => ({
  boardId: null,
  lists: [],
  selectedCardId: null,
  selectedCard: null,
  socketConnected: false,
  isDragging: false,
  pendingResync: false,
  watchers: [],
  currentUserId: null,
  filterLabelIds: [],
  filterMemberIds: [],
  filterNoMembers: false,
  filterAssignedToMe: false,
  filterStatuses: [],
  filterDueBuckets: [],
  filterActivityWindows: [],
  searchQuery: "",
  expandLabels: false,

  setBoardId: (boardId) => set({ boardId }),

  setCurrentUserId: (userId) => set({ currentUserId: userId }),

  setLists: (lists) => set({ lists: normalizeOrderingRevisions(lists) }),

  setSelectedCardId: (cardId) => set({ selectedCardId: cardId }),

  setSelectedCard: (card) => set({ selectedCard: card }),

  setSocketConnected: (connected) => set({ socketConnected: connected }),

  // Seed presence with the current viewer so the header isn't blank before the
  // first server broadcast; the authoritative `board:presence` broadcast fills
  // in everyone else.
  seedWatchers: (watchers) => set({ watchers }),

  setDragging: (dragging) => set({ isDragging: dragging }),

  // A structural remote board event (reorder/create/delete/archive) was skipped
  // during a local drag to keep the list array stable under @hello-pangea/dnd;
  // flag that the board is behind the server so BoardContent reconciles via
  // router.refresh() on drop.
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

  // View-only filters (no server round-trip). Each toggle adds/removes an option
  // from its dimension's keep-visible set; ListColumn hides non-matching cards via
  // CSS. Within a dimension the options OR; across dimensions they AND (US-065).
  toggleLabelFilter: (labelId) => set((state) => ({
    filterLabelIds: toggleInArray(state.filterLabelIds, labelId),
  })),

  toggleMemberFilter: (memberId) => set((state) => ({
    filterMemberIds: toggleInArray(state.filterMemberIds, memberId),
  })),

  toggleNoMembers: () => set((state) => ({ filterNoMembers: !state.filterNoMembers })),

  toggleAssignedToMe: () => set((state) => ({ filterAssignedToMe: !state.filterAssignedToMe })),

  toggleStatusFilter: (status) => set((state) => ({
    filterStatuses: toggleInArray(state.filterStatuses, status),
  })),

  toggleDueBucket: (bucket) => set((state) => ({
    filterDueBuckets: toggleInArray(state.filterDueBuckets, bucket),
  })),

  toggleActivityWindow: (window) => set((state) => ({
    filterActivityWindows: toggleInArray(state.filterActivityWindows, window),
  })),

  // "Clear filters" resets every dimension AND the keyword — one action wipes the
  // whole popover back to "show all" (US-065).
  clearFilters: () => set({
    filterLabelIds: [],
    filterMemberIds: [],
    filterNoMembers: false,
    filterAssignedToMe: false,
    filterStatuses: [],
    filterDueBuckets: [],
    filterActivityWindows: [],
    searchQuery: "",
  }),

  // View-only card search (no server round-trip). ListColumn hides cards whose
  // title does not contain the query; while a keyword is active it takes over card
  // visibility and the other dimensions are suspended.
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Board-wide compact↔expanded label toggle. One flag, every card reads it, so
  // there is no per-card state to reset mid-drag (US-044).
  toggleExpandLabels: () => set((state) => ({ expandLabels: !state.expandLabels })),

  reset: () => set({
    boardId: null,
    lists: [],
    selectedCardId: null,
    selectedCard: null,
    socketConnected: false,
    isDragging: false,
    pendingResync: false,
    watchers: [],
    currentUserId: null,
    filterLabelIds: [],
    filterMemberIds: [],
    filterNoMembers: false,
    filterAssignedToMe: false,
    filterStatuses: [],
    filterDueBuckets: [],
    filterActivityWindows: [],
    searchQuery: "",
    expandLabels: false,
  }),

  // Live presence: replace the watcher list with the server's authoritative set.
  // Guarded on boardId like every applyRemote* — during A→B navigation the socket
  // is briefly in both rooms, so a stale board-A payload can arrive after switching.
  applyRemotePresence: (payload) => {
    if (get().boardId !== payload.boardId) {
      return;
    }

    set({ watchers: payload.watchers });
  },

  applyRemoteCardMoved: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    const { cardId, listId, position } = payload;
    const revision = payload.moveRevision ?? 0;

    set((state) => {
      // decision 0032 revision semantics: reject lower revisions; dedupe
      // equal-revision echoes already at the canonical position (the actor's
      // own echo after the optimistic commit); apply everything else (equal +
      // different position = canonical correction; higher = cross-user move).
      const sourceList = state.lists.find((list) =>
        list.cards.some((card) => card.id === cardId),
      );
      if (!sourceList) {
        // A destination-board echo can arrive with no local source card. New
        // emitters include the canonical snapshot for this cross-board case;
        // legacy moved payloads remain a safe no-op because they lack enough
        // data to construct a board card.
        const targetList = state.lists.find((list) => list.id === listId);
        if (!targetList || !payload.card) {
          return state;
        }

        const movedCard = {
          ...payload.card,
          listId,
          position,
          moveRevision: payload.card.moveRevision ?? revision,
          coverImage: null,
          priority: payload.card.priority ?? null,
          dueDate: payload.card.dueDate ? new Date(payload.card.dueDate) : null,
          completedAt: null,
          updatedAt: new Date(),
          labels: [],
          members: [],
          memberCount: 0,
          checklistDone: 0,
          checklistTotal: 0,
          commentCount: 0,
        };

        return {
          lists: state.lists.map((list) =>
            list.id === listId
              ? { ...list, cards: [...list.cards, movedCard].sort((a, b) => a.position - b.position) }
              : list,
          ),
        };
      }
      const foundCard = sourceList.cards.find((card) => card.id === cardId)!;

      if (revision < foundCard.moveRevision) {
        return state;
      }
      if (
        revision === foundCard.moveRevision &&
        foundCard.listId === listId &&
        foundCard.position === position
      ) {
        return state;
      }

      const targetListExists = state.lists.some((list) => list.id === listId);
      if (!targetListExists) {
        // A workspace-wide automation move can leave this board entirely. The
        // source-room echo names the destination list, which is intentionally
        // absent from this store; remove the card instead of retaining an
        // invisible duplicate. The destination room handles insertion.
        const listsWithoutMovedCard = state.lists.map((list) =>
          list.id === sourceList.id
            ? { ...list, cards: list.cards.filter((card) => card.id !== cardId) }
            : list,
        );
        const selectionCleared =
          state.selectedCardId === cardId
            ? { selectedCardId: null, selectedCard: null }
            : {};
        return { lists: listsWithoutMovedCard, ...selectionCleared };
      }

      const movedCard = { ...foundCard, listId, position, moveRevision: revision };

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
    const revision = payload.moveRevision ?? 0;

    set((state) => {
      const targetList = state.lists.find((list) => list.id === listId);

      if (!targetList) {
        return state;
      }

      // decision 0032 revision semantics, mirroring applyRemoteCardMoved:
      // reject lower revisions; dedupe equal revision + same position (the
      // actor's own echo); apply everything else (equal + different position =
      // canonical correction; higher revision = cross-user move).
      if (revision < targetList.moveRevision) {
        return state;
      }
      if (revision === targetList.moveRevision && targetList.position === position) {
        return state;
      }

      const newLists = state.lists
        .map((list) => (list.id === listId ? { ...list, position, moveRevision: revision } : list))
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

      const newLists = [
        ...state.lists,
        { ...payload.list, moveRevision: payload.list.moveRevision ?? 0, cards: [] },
      ].sort(
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
          cards: [
            ...list.cards,
            {
              ...payload.card,
              coverImage: null,
              // decision 0032: seed the canonical revision from the payload
              // (default 0 for pre-0032 emitters) so later drags CAS on it.
              moveRevision: payload.card.moveRevision ?? 0,
              // US-083 W7 fidelity: a quick-captured card's due date + priority
              // arrive on the wire; older payloads without the fields fall back
              // to null.
              priority: payload.card.priority ?? null,
              dueDate: payload.card.dueDate ? new Date(payload.card.dueDate) : null,
              completedAt: null,
              // A socket-created card was just made, so it is "active now" for the
              // activity filter (US-065). The snapshot carries no timestamp; the
              // next router.refresh reseeds the authoritative value.
              updatedAt: new Date(),
              labels: [],
              members: [],
              memberCount: 0,
              checklistDone: 0,
              checklistTotal: 0,
              commentCount: 0,
            },
          ].sort((a, b) => a.position - b.position),
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

  // In-place completion flip (US-045): patch the card's completedAt on the board
  // face (drives dimmed styling + due-status) and, if open, the detail sheet.
  // Never reorders the list array, so it's safe to apply mid-drag (like labels).
  // completedAt arrives as an ISO string (or null); rehydrate to a Date to match
  // the store's card shape.
  applyRemoteCardCompletionUpdated: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    const nextCompletedAt = payload.completedAt ? new Date(payload.completedAt) : null;

    set((state) => {
      const owningList = state.lists.find((list) =>
        list.cards.some((card) => card.id === payload.cardId),
      );
      const isSelected =
        state.selectedCardId === payload.cardId && Boolean(state.selectedCard);

      if (!owningList && !isSelected) {
        return state;
      }

      const newLists = owningList
        ? state.lists.map((list) => {
            if (!list.cards.some((card) => card.id === payload.cardId)) {
              return list;
            }

            return {
              ...list,
              cards: list.cards.map((card) =>
                card.id === payload.cardId
                  ? { ...card, completedAt: nextCompletedAt }
                  : card,
              ),
            };
          })
        : state.lists;

      const newSelectedCard =
        isSelected && state.selectedCard
          ? {
              ...state.selectedCard,
              card: { ...state.selectedCard.card, completedAt: nextCompletedAt },
            }
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
      const isSelected =
        state.selectedCardId === payload.cardId && Boolean(state.selectedCard);

      if (!owningList && !isSelected) {
        return state;
      }

      // Self-echo dedupe: if the card already carries this exact label set (same
      // ids, names, colors, same order), the store is current (the actor's own
      // echo after router.refresh already reseeded it). No-op to skip a redundant
      // re-render. The name/color comparison matters: a label rename/recolor
      // keeps the id set unchanged, so an id-only check would wrongly swallow it
      // and leave stale chips (US-010).
      const current = owningList
        ? owningList.cards.find((card) => card.id === payload.cardId)
        : undefined;
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

      const newLists = owningList
        ? state.lists.map((list) => {
            if (!list.cards.some((card) => card.id === payload.cardId)) {
              return list;
            }

            return {
              ...list,
              cards: list.cards.map((card) =>
                card.id === payload.cardId ? { ...card, labels: payload.labels } : card,
              ),
            };
          })
        : state.lists;

      // F4: also patch the open detail sheet's label set when this is the card
      // being viewed — mirrors how members are patched, so a remote label
      // attach/detach (or rename/recolor fan-out) reaches the sheet live.
      const newSelectedCard =
        isSelected && state.selectedCard
          ? { ...state.selectedCard, labels: payload.labels }
          : state.selectedCard;

      return { lists: newLists, selectedCard: newSelectedCard };
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

  // In-place display-metadata patch (F3): one or more of a card's due date,
  // priority, estimate, cover changed remotely. Safe to apply mid-drag — it
  // never reorders the list array (mirrors card:completion-updated / labels).
  // dueDate arrives as an ISO string (JSON-safe); rehydrate to a Date to match
  // the store's card shape. estimateHours exists only on the open detail sheet,
  // so it is applied to selectedCard only; the rest patch both faces.
  applyRemoteCardMetaUpdated: (payload) => {
    const { boardId } = get();

    if (boardId !== payload.boardId) {
      return;
    }

    const { cardId, fields } = payload;

    const dueDate =
      fields.dueDate === undefined ? undefined : fields.dueDate ? new Date(fields.dueDate) : null;
    // Only the fields the payload carries are patched — the rest of the card is
    // untouched.
    const listPatch: Partial<Pick<ListWithCards["cards"][number], "coverImage" | "priority" | "dueDate">> = {};
    if (fields.coverImage !== undefined) listPatch.coverImage = fields.coverImage;
    if (fields.priority !== undefined) listPatch.priority = fields.priority;
    if (fields.dueDate !== undefined) listPatch.dueDate = dueDate;

    const selectedPatch: Partial<Pick<SelectedCardData["card"], "estimateHours" | "coverImage" | "priority" | "dueDate">> = {
      ...listPatch,
    };
    if (fields.estimateHours !== undefined) selectedPatch.estimateHours = fields.estimateHours;

    set((state) => {
      const owningList = state.lists.find((list) =>
        list.cards.some((card) => card.id === cardId),
      );
      const isSelected = state.selectedCardId === cardId && Boolean(state.selectedCard);

      if (!owningList && !isSelected) {
        return state;
      }

      // Self-echo dedupe: skip the re-render when the store already reflects
      // every incoming field (the actor's own echo after router.refresh already
      // reseeded it). Dates compare by instant, not reference.
      const sameMetaValue = (a: unknown, b: unknown) =>
        a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
      let unchanged = true;
      if (owningList) {
        const current = owningList.cards.find((card) => card.id === cardId)!;
        for (const key of Object.keys(listPatch) as Array<keyof typeof listPatch>) {
          if (!sameMetaValue(current[key], listPatch[key])) {
            unchanged = false;
            break;
          }
        }
      }
      if (unchanged && isSelected && state.selectedCard) {
        for (const key of Object.keys(selectedPatch) as Array<keyof typeof selectedPatch>) {
          if (!sameMetaValue(state.selectedCard.card[key], selectedPatch[key])) {
            unchanged = false;
            break;
          }
        }
      }
      if (unchanged) {
        return state;
      }

      const newLists =
        owningList && Object.keys(listPatch).length > 0
          ? state.lists.map((list) => {
              if (!list.cards.some((card) => card.id === cardId)) {
                return list;
              }

              return {
                ...list,
                cards: list.cards.map((card) =>
                  card.id === cardId ? { ...card, ...listPatch } : card,
                ),
              };
            })
          : state.lists;

      const newSelectedCard =
        isSelected && state.selectedCard
          ? { ...state.selectedCard, card: { ...state.selectedCard.card, ...selectedPatch } }
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
