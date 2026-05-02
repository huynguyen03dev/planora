import { Server } from "socket.io";

import type { NotificationNewPayload, ServerToClientEvents, ClientToServerEvents } from "./types";
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
