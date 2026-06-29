import type { Watcher } from "./types";

type BoardPresence = Map<string, { watcher: Watcher; socketIds: Set<string> }>;

/**
 * In-memory, single-process registry of who currently has each board open.
 *
 * Presence is ephemeral — it lives only for the lifetime of the server process
 * and is never persisted. The app runs a single custom server (`server.ts`), so
 * one in-process registry is authoritative (mirrors the `global.io` singleton in
 * `./server`). Multi-server presence would need a shared store (e.g. a Redis
 * Socket.io adapter) — out of scope.
 *
 * Watchers are deduped by user id: a single user with multiple tabs/sockets is
 * one watcher. Each mutator returns whether the board's *visible* watcher set
 * changed, so callers can skip redundant broadcasts.
 */
export class PresenceRegistry {
  // boardId -> userId -> { watcher, socketIds }
  private boards = new Map<string, BoardPresence>();
  // socketId -> { userId, boardIds } — reverse index for disconnect cleanup.
  private sockets = new Map<string, { userId: string; boardIds: Set<string> }>();

  /**
   * Record that `socketId` (belonging to `watcher`) is viewing `boardId`.
   * Returns true only when this is the user's first socket on the board (i.e. a
   * new avatar appears); a second tab returns false.
   */
  add(boardId: string, socketId: string, watcher: Watcher): boolean {
    let board = this.boards.get(boardId);
    if (!board) {
      board = new Map();
      this.boards.set(boardId, board);
    }

    const socketEntry = this.sockets.get(socketId) ?? {
      userId: watcher.id,
      boardIds: new Set<string>(),
    };
    socketEntry.boardIds.add(boardId);
    this.sockets.set(socketId, socketEntry);

    const existing = board.get(watcher.id);
    if (existing) {
      existing.socketIds.add(socketId);
      // Refresh the cached profile (name/image may differ across sessions).
      existing.watcher = watcher;
      return false; // user already present → no visible change
    }

    board.set(watcher.id, { watcher, socketIds: new Set([socketId]) });
    return true;
  }

  /**
   * Remove `socketId` for `userId` from `boardId`. Returns true only when the
   * user's last socket on the board leaves (i.e. their avatar disappears).
   */
  remove(boardId: string, socketId: string, userId: string): boolean {
    const socketEntry = this.sockets.get(socketId);
    if (socketEntry) {
      socketEntry.boardIds.delete(boardId);
      if (socketEntry.boardIds.size === 0) {
        this.sockets.delete(socketId);
      }
    }

    const board = this.boards.get(boardId);
    if (!board) {
      return false;
    }

    const entry = board.get(userId);
    if (!entry) {
      return false;
    }

    if (!entry.socketIds.delete(socketId)) {
      return false; // socket wasn't part of this user's presence — no change
    }

    if (entry.socketIds.size > 0) {
      return false; // other tabs keep the user present
    }

    board.delete(userId);
    if (board.size === 0) {
      this.boards.delete(boardId);
    }
    return true;
  }

  /**
   * Remove a socket from every board it was viewing (used on disconnect).
   * Returns the board ids whose visible watcher set actually changed.
   */
  removeSocket(socketId: string): string[] {
    const socketEntry = this.sockets.get(socketId);
    if (!socketEntry) {
      return [];
    }

    const { userId, boardIds } = socketEntry;
    const affected: string[] = [];
    // Copy: remove() mutates socketEntry.boardIds as it prunes.
    for (const boardId of [...boardIds]) {
      if (this.remove(boardId, socketId, userId)) {
        affected.push(boardId);
      }
    }

    this.sockets.delete(socketId);
    return affected;
  }

  /** Current watchers of a board, deduped and sorted by name for stable order. */
  watchers(boardId: string): Watcher[] {
    const board = this.boards.get(boardId);
    if (!board) {
      return [];
    }

    return [...board.values()]
      .map((entry) => entry.watcher)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

declare global {
  var presenceRegistry: PresenceRegistry | undefined;
}

// Singleton — matches the `global.io` pattern in `./server` so HMR or an
// accidental second import never splits presence across two registries.
export const presenceRegistry =
  global.presenceRegistry ?? (global.presenceRegistry = new PresenceRegistry());
