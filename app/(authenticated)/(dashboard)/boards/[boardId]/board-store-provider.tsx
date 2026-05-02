"use client";

import { useEffect, useMemo } from "react";

import { initSocket, joinBoard, leaveBoard, disconnectSocket } from "@/lib/realtime/client";
import type { CardMovedPayload, CommentCreatedPayload } from "@/lib/realtime/types";

import { useBoardStore, type ListWithCards, type SelectedCardData } from "./board-store";

type BoardStoreProviderProps = {
  children: React.ReactNode;
  boardId: string;
  lists: ListWithCards[];
  selectedCardId: string | null;
  selectedCard: SelectedCardData | null;
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
}: BoardStoreProviderProps) {
  const setBoardId = useBoardStore((s) => s.setBoardId);
  const setLists = useBoardStore((s) => s.setLists);
  const setSelectedCardId = useBoardStore((s) => s.setSelectedCardId);
  const setSelectedCard = useBoardStore((s) => s.setSelectedCard);
  const setSocketConnected = useBoardStore((s) => s.setSocketConnected);
  const reset = useBoardStore((s) => s.reset);
  const applyRemoteCardMoved = useBoardStore((s) => s.applyRemoteCardMoved);
  const applyRemoteCommentCreated = useBoardStore((s) => s.applyRemoteCommentCreated);

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
    setLists(normalizedLists);
    setSelectedCardId(selectedCardId);
    setSelectedCard(selectedCard);
  }, [
    boardId,
    normalizedLists,
    selectedCardId,
    selectedCard,
    setBoardId,
    setLists,
    setSelectedCardId,
    setSelectedCard,
  ]);

  // Socket lifecycle: connect once, handle errors
  useEffect(() => {
    const socket = initSocket();

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

    function handleCardMoved(payload: CardMovedPayload) {
      applyRemoteCardMoved(payload);
    }

    function handleCommentCreated(payload: CommentCreatedPayload) {
      applyRemoteCommentCreated(payload);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("card:moved", handleCardMoved);
    socket.on("comment:created", handleCommentCreated);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("card:moved", handleCardMoved);
      socket.off("comment:created", handleCommentCreated);
      disconnectSocket();
    };
  }, [setSocketConnected, applyRemoteCardMoved, applyRemoteCommentCreated]);

  // Board room join/leave: separate from socket lifecycle
  useEffect(() => {
    const socket = initSocket();

    if (socket.connected) {
      joinBoard(boardId);
    }

    function onConnect() {
      joinBoard(boardId);
    }

    socket.on("connect", onConnect);

    return () => {
      socket.off("connect", onConnect);
      leaveBoard(boardId);
    };
  }, [boardId]);

  // Reset store on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  return <>{children}</>;
}
