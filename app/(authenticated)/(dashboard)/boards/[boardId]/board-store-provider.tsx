"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { initSocket, joinBoard, leaveBoard } from "@/lib/realtime/client";
import type {
  BoardPresencePayload,
  CardArchivedPayload,
  CardCompletionUpdatedPayload,
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
  Watcher,
} from "@/lib/realtime/types";

import { useBoardStore, type ListWithCards, type SelectedCardData } from "./board-store";

type BoardStoreProviderProps = {
  children: React.ReactNode;
  boardId: string;
  lists: ListWithCards[];
  selectedCardId: string | null;
  selectedCard: SelectedCardData | null;
  currentViewer: Watcher;
  canEdit: boolean;
  canDelete: boolean;
  canCreateList: boolean;
  canCreateCard: boolean;
  canEditCard: boolean;
  canArchiveCard: boolean;
};

export function BoardStoreProvider({
  children,
  boardId,
  lists,
  selectedCardId,
  selectedCard,
  currentViewer: { id: viewerId, name: viewerName, image: viewerImage, role: viewerRole },
}: BoardStoreProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const connectedRef = useRef(false);
  const setBoardId = useBoardStore((s) => s.setBoardId);
  const setCurrentUserId = useBoardStore((s) => s.setCurrentUserId);
  const setLists = useBoardStore((s) => s.setLists);
  const setSelectedCardId = useBoardStore((s) => s.setSelectedCardId);
  const setSelectedCard = useBoardStore((s) => s.setSelectedCard);
  const setSocketConnected = useBoardStore((s) => s.setSocketConnected);
  const reset = useBoardStore((s) => s.reset);
  const applyRemoteCardMoved = useBoardStore((s) => s.applyRemoteCardMoved);
  const applyRemoteListMoved = useBoardStore((s) => s.applyRemoteListMoved);
  const applyRemoteListCreated = useBoardStore((s) => s.applyRemoteListCreated);
  const applyRemoteListUpdated = useBoardStore((s) => s.applyRemoteListUpdated);
  const applyRemoteListDeleted = useBoardStore((s) => s.applyRemoteListDeleted);
  const applyRemoteCardCreated = useBoardStore((s) => s.applyRemoteCardCreated);
  const applyRemoteCardUpdated = useBoardStore((s) => s.applyRemoteCardUpdated);
  const applyRemoteCardArchived = useBoardStore((s) => s.applyRemoteCardArchived);
  const applyRemoteCardCompletionUpdated = useBoardStore((s) => s.applyRemoteCardCompletionUpdated);
  const applyRemoteCardLabelsUpdated = useBoardStore((s) => s.applyRemoteCardLabelsUpdated);
  const applyRemoteCardMembersUpdated = useBoardStore((s) => s.applyRemoteCardMembersUpdated);
  const applyRemoteCommentCreated = useBoardStore((s) => s.applyRemoteCommentCreated);
  const applyRemotePresence = useBoardStore((s) => s.applyRemotePresence);
  const seedWatchers = useBoardStore((s) => s.seedWatchers);

  const normalizedLists = useMemo(() => {
    return lists.map((list) => ({
      ...list,
      cards: list.cards.map((card) => ({
        ...card,
        listId: list.id,
      })),
    }));
  }, [lists]);

  useEffect(() => {
    setBoardId(boardId);
    setCurrentUserId(viewerId);
    setLists(normalizedLists);
    setSelectedCardId(selectedCardId);
    setSelectedCard(selectedCard);
  }, [
    boardId,
    viewerId,
    normalizedLists,
    selectedCardId,
    selectedCard,
    setBoardId,
    setCurrentUserId,
    setLists,
    setSelectedCardId,
    setSelectedCard,
  ]);

  // Socket lifecycle: connect once, handle errors
  useEffect(() => {
    const socket = initSocket();

    // Seed connection state synchronously on mount. With a session-long socket,
    // the `connect` event won't re-fire on a second board visit, so without this
    // the connection badge would stick on a stale `false`.
    setSocketConnected(socket.connected);

    function handleConnect() {
      setSocketConnected(true);
    }

    function handleDisconnect() {
      setSocketConnected(false);
    }

    function handleConnectError(err: Error) {
      setSocketConnected(false);
      console.error("[realtime] connect_error:", err.message);
    }

    // While a local drag is in flight, applying a structural board mutation
    // (reorder / create / delete / archive) would reorder the list array under
    // @hello-pangea/dnd mid-drag — corrupting the drop position or breaking the
    // drag outright. Defer those events and flag a resync; BoardContent pulls
    // canonical state via router.refresh() when the drag ends. In-place patches
    // (list/card title, card completion, labels, comments) don't change list
    // structure, so they stay live.
    function applyOrDefer<T>(apply: (payload: T) => void, payload: T) {
      const store = useBoardStore.getState();
      if (store.isDragging) {
        store.markResyncPending();
        return;
      }
      apply(payload);
    }

    function handleCardMoved(payload: CardMovedPayload) {
      applyOrDefer(applyRemoteCardMoved, payload);
    }

    function handleListMoved(payload: ListMovedPayload) {
      applyOrDefer(applyRemoteListMoved, payload);
    }

    function handleListCreated(payload: ListCreatedPayload) {
      applyOrDefer(applyRemoteListCreated, payload);
    }

    function handleListUpdated(payload: ListUpdatedPayload) {
      applyRemoteListUpdated(payload);
    }

    function handleListDeleted(payload: ListDeletedPayload) {
      applyOrDefer(applyRemoteListDeleted, payload);
    }

    function handleCardCreated(payload: CardCreatedPayload) {
      applyOrDefer(applyRemoteCardCreated, payload);
    }

    function handleCardUpdated(payload: CardUpdatedPayload) {
      applyRemoteCardUpdated(payload);
    }

    function handleCardArchived(payload: CardArchivedPayload) {
      // Defer while dragging (see applyOrDefer) — the drop-time resync pulls the
      // archival from the server; an open sheet then closes via its
      // server-fetched prop on refresh.
      if (useBoardStore.getState().isDragging) {
        useBoardStore.getState().markResyncPending();
        return;
      }

      // Capture whether this is the card whose detail sheet is currently open
      // BEFORE clearing the store. The sheet's `open` state derives from the
      // URL `?cardId` param + a server-fetched prop (page.tsx), not the store,
      // so clearing the store alone won't close it — we must strip the param.
      const openCardId = searchParams.get("cardId");

      applyRemoteCardArchived(payload);

      if (openCardId === payload.cardId) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("cardId");
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }
    }

    function handleCardCompletionUpdated(payload: CardCompletionUpdatedPayload) {
      // In-place patch (completion flag + due-status); safe mid-drag, applied
      // live like card:labels-updated — it never reorders the list array.
      applyRemoteCardCompletionUpdated(payload);
    }

    function handleCardLabelsUpdated(payload: CardLabelsUpdatedPayload) {
      // In-place patch (label chips); safe mid-drag, applied live like card:updated.
      applyRemoteCardLabelsUpdated(payload);
    }

    function handleCardMembersUpdated(payload: CardMembersUpdatedPayload) {
      // In-place patch (open card detail sheet only); safe mid-drag, applied live.
      applyRemoteCardMembersUpdated(payload);
    }

    function handleCommentCreated(payload: CommentCreatedPayload) {
      applyRemoteCommentCreated(payload);
    }

    function handlePresence(payload: BoardPresencePayload) {
      // Live presence never touches the lists array, so it applies immediately —
      // no drag deferral. The store guards on boardId.
      applyRemotePresence(payload);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("card:moved", handleCardMoved);
    socket.on("list:moved", handleListMoved);
    socket.on("list:created", handleListCreated);
    socket.on("list:updated", handleListUpdated);
    socket.on("list:deleted", handleListDeleted);
    socket.on("card:created", handleCardCreated);
    socket.on("card:updated", handleCardUpdated);
    socket.on("card:archived", handleCardArchived);
    socket.on("card:completion-updated", handleCardCompletionUpdated);
    socket.on("card:labels-updated", handleCardLabelsUpdated);
    socket.on("card:members-updated", handleCardMembersUpdated);
    socket.on("comment:created", handleCommentCreated);
    socket.on("board:presence", handlePresence);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("card:moved", handleCardMoved);
      socket.off("list:moved", handleListMoved);
      socket.off("list:created", handleListCreated);
      socket.off("list:updated", handleListUpdated);
      socket.off("list:deleted", handleListDeleted);
      socket.off("card:created", handleCardCreated);
      socket.off("card:updated", handleCardUpdated);
      socket.off("card:archived", handleCardArchived);
      socket.off("card:completion-updated", handleCardCompletionUpdated);
      socket.off("card:labels-updated", handleCardLabelsUpdated);
      socket.off("card:members-updated", handleCardMembersUpdated);
      socket.off("comment:created", handleCommentCreated);
      socket.off("board:presence", handlePresence);
    };
  }, [
    setSocketConnected,
    applyRemoteCardMoved,
    applyRemoteListMoved,
    applyRemoteListCreated,
    applyRemoteListUpdated,
    applyRemoteListDeleted,
    applyRemoteCardCreated,
    applyRemoteCardUpdated,
    applyRemoteCardArchived,
    applyRemoteCardCompletionUpdated,
    applyRemoteCardLabelsUpdated,
    applyRemoteCardMembersUpdated,
    applyRemoteCommentCreated,
    applyRemotePresence,
    router,
    pathname,
    searchParams,
  ]);

  // Seed presence with the current viewer so the header shows at least
  // ourselves before the first server broadcast lands (avoids an empty flash),
  // and so a board switch resets to just ourselves rather than showing the
  // previous board's watchers. Keyed on boardId + the viewer's primitive fields
  // (not the prop object), so a router.refresh() — which re-creates the object —
  // doesn't re-run this and clobber the live list.
  useEffect(() => {
    seedWatchers([{ id: viewerId, name: viewerName, image: viewerImage, role: viewerRole }]);
  }, [boardId, viewerId, viewerName, viewerImage, viewerRole, seedWatchers]);

  // Board room join/leave: separate from socket lifecycle
  useEffect(() => {
    const socket = initSocket();

    if (socket.connected) {
      joinBoard(boardId);
      connectedRef.current = true; // baseline: we were already connected at mount
    }

    function onConnect() {
      joinBoard(boardId);
      if (connectedRef.current) {
        router.refresh(); // a reconnect after a drop — resync missed events
      }
      connectedRef.current = true;
    }

    socket.on("connect", onConnect);

    return () => {
      socket.off("connect", onConnect);
      leaveBoard(boardId);
    };
  }, [boardId, router]);

  // Reset store on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  return <>{children}</>;
}
