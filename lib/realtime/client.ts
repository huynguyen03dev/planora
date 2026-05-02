"use client";

import { io, Socket } from "socket.io-client";

import type { ServerToClientEvents, ClientToServerEvents } from "./types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socket;
}

export function initSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (socket) {
    return socket;
  }

  socket = io({
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });

  socket.on("connect", () => {
    console.log("[realtime] Connected to socket server");
  });

  socket.on("disconnect", (reason) => {
    console.log("[realtime] Disconnected:", reason);
  });

  socket.on("board:error", (payload) => {
    console.error("[realtime] Board error:", payload.message);
  });

  return socket;
}

export function joinBoard(boardId: string) {
  if (!socket) {
    console.warn("[realtime] Socket not initialized");
    return;
  }

  socket.emit("board:join", { boardId });
}

export function leaveBoard(boardId: string) {
  if (!socket) {
    console.warn("[realtime] Socket not initialized");
    return;
  }

  socket.emit("board:leave", { boardId });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}