"use client";

import { io, Socket } from "socket.io-client";

import type { ServerToClientEvents, ClientToServerEvents } from "./types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

/**
 * A3 (round-2): whether a disconnect should trigger ONE manual reconnect.
 *
 * The server force-disconnects a user's sockets on membership revocation
 * (`kickUserSockets` → `disconnectSockets(true)`). socket.io-client treats
 * that as `io server disconnect` and sets `skipReconnect` — the tab would stay
 * frozen until a manual reload. Reconnecting exactly once re-runs the room
 * joins, and the server re-authorizes every `board:join`/`workspace:join`;
 * a revoked user is denied again → `board:error` → the provider's U5
 * `router.refresh()` surfaces the deny instead of a dead tab.
 *
 * Pure (extracted for unit testing): no reconnect when the disconnect was
 * client-initiated (logout/unmount), and at most one retry per server kick
 * (`alreadyAttempted` resets on a successful connect).
 */
export function shouldReconnectOnce(
  reason: string,
  alreadyAttempted: boolean,
): boolean {
  return reason === "io server disconnect" && !alreadyAttempted;
}

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

  // One manual retry per server-initiated disconnect (A3). Guarded: the flag is
  // set on the kick and cleared on the next successful connect, so a server
  // that keeps kicking gets one retry per kick — never a reconnect loop.
  let reconnectAfterServerDisconnect = false;

  socket.on("connect", () => {
    reconnectAfterServerDisconnect = false;
    console.log("[realtime] Connected to socket server");
  });

  socket.on("disconnect", (reason) => {
    console.log("[realtime] Disconnected:", reason);
    if (shouldReconnectOnce(reason, reconnectAfterServerDisconnect)) {
      reconnectAfterServerDisconnect = true;
      // The fresh socket has NO rooms until the providers re-emit
      // board:join/workspace:join and the server re-authorizes them — no stale
      // room membership rides the reconnect.
      socket?.connect();
    }
  });

  socket.on("board:error", (payload) => {
    console.error("[realtime] Board error:", payload.message);
  });

  socket.on("workspace:error", (payload) => {
    console.error("[realtime] Workspace error:", payload.message);
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

export function joinWorkspace(workspaceId: string) {
  if (!socket) {
    console.warn("[realtime] Socket not initialized");
    return;
  }

  socket.emit("workspace:join", { workspaceId });
}

export function leaveWorkspace(workspaceId: string) {
  if (!socket) {
    console.warn("[realtime] Socket not initialized");
    return;
  }

  socket.emit("workspace:leave", { workspaceId });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}