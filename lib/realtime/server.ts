import { Server } from "socket.io";

import type { CardLabelSnapshot, CardMemberSnapshot, CardSnapshot, ListSnapshot, NotificationNewPayload, ServerToClientEvents, ClientToServerEvents, Watcher } from "./types";
import { ROOMS } from "./events";

declare global {
  var io: Server<ClientToServerEvents, ServerToClientEvents> | undefined;
}

export function getIO(): Server<ClientToServerEvents, ServerToClientEvents> | undefined {
  return global.io;
}

export function initIO(server: ReturnType<typeof import("http").createServer>): Server<ClientToServerEvents, ServerToClientEvents> {
  if (global.io) {
    return global.io;
  }

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:3000"],
      credentials: true,
    },
  });

  global.io = io;
  return io;
}

export function emitCardMoved(boardId: string, payload: {
  cardId: string;
  listId: string;
  position: number;
}) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("card:moved", {
      boardId,
      ...payload,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit card:moved:", error);
  }
}

export function emitListMoved(boardId: string, payload: {
  listId: string;
  position: number;
}) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("list:moved", {
      boardId,
      ...payload,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit list:moved:", error);
  }
}

export function emitListCreated(boardId: string, payload: {
  list: ListSnapshot;
}) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("list:created", {
      boardId,
      ...payload,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit list:created:", error);
  }
}

export function emitListUpdated(boardId: string, payload: {
  listId: string;
  title?: string;
  isDone?: boolean;
}) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("list:updated", {
      boardId,
      ...payload,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit list:updated:", error);
  }
}

export function emitListDeleted(boardId: string, payload: {
  listId: string;
}) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("list:deleted", {
      boardId,
      ...payload,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit list:deleted:", error);
  }
}

export function emitCardCreated(boardId: string, payload: {
  card: CardSnapshot;
}) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("card:created", {
      boardId,
      ...payload,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit card:created:", error);
  }
}

export function emitCardUpdated(boardId: string, payload: {
  cardId: string;
  title: string;
}) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("card:updated", {
      boardId,
      ...payload,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit card:updated:", error);
  }
}

export function emitCardArchived(boardId: string, payload: {
  cardId: string;
}) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("card:archived", {
      boardId,
      ...payload,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit card:archived:", error);
  }
}

// In-place / live (not structural): a card's label set changed. Safe to apply
// mid-drag — it never reorders the list array. Mirrors card:updated.
export function emitCardLabelsUpdated(boardId: string, payload: {
  cardId: string;
  labels: CardLabelSnapshot[];
}) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("card:labels-updated", {
      boardId,
      ...payload,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit card:labels-updated:", error);
  }
}

// In-place / live (not structural): a card's assignee set changed. Safe to apply
// mid-drag — members render only in the open card detail sheet, never on the
// list array. Mirrors card:labels-updated. Emitted on assign/remove.
export function emitCardMembersUpdated(boardId: string, payload: {
  cardId: string;
  members: CardMemberSnapshot[];
}) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("card:members-updated", {
      boardId,
      ...payload,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit card:members-updated:", error);
  }
}

export function emitCommentCreated(boardId: string, payload: {
  cardId: string;
  comment: {
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string | null;
    author: {
      id: string;
      name: string;
      image: string | null;
    };
  };
  activity: {
    id: string;
    type: string;
    createdAt: string;
    user: {
      id: string;
      name: string;
      image: string | null;
    };
  };
}) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("comment:created", {
      boardId,
      ...payload,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit comment:created:", error);
  }
}

// Live presence (not structural): the set of users currently viewing a board
// changed. Broadcast the full watcher list to the board room. Ephemeral — never
// touches the lists array, so it is always safe to apply (no drag deferral).
export function emitBoardPresence(boardId: string, watchers: Watcher[]) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.board(boardId)).emit("board:presence", {
      boardId,
      watchers,
    });
  } catch (error) {
    console.error("[realtime] Failed to emit board:presence:", error);
  }
}

export function emitNotificationNew(userId: string, payload: NotificationNewPayload) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.user(userId)).emit("notification:new", payload);
  } catch (error) {
    console.error("[realtime] Failed to emit notification:new:", error);
  }
}

export function emitAnalyticsRefresh(workspaceId: string) {
  const io = getIO();
  if (!io) {
    console.error("[realtime] IO not initialized");
    return;
  }

  try {
    io.to(ROOMS.workspace(workspaceId)).emit("analytics:refresh", {
      workspaceId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[realtime] Failed to emit analytics:refresh:", error);
  }
}
