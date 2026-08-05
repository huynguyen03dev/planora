import type { ClientToServerEvents, ServerToClientEvents } from "./types";

// Canonical event-name list, derived from the typed maps (F6 round-2): the
// `satisfies Record<string, EventName>` guard makes every VALUE a literal event
// name from ServerToClientEvents ∪ ClientToServerEvents — a typo or a name that
// no longer exists in types.ts is a build error. The list is maintained as the
// full, canonical mirror of both maps (add new events here when types change).
type EventName = keyof ClientToServerEvents | keyof ServerToClientEvents;

export const EVENTS = {
  CARD_MOVED: "card:moved",
  LIST_MOVED: "list:moved",
  LIST_CREATED: "list:created",
  LIST_RESTORED: "list:restored",
  LIST_UPDATED: "list:updated",
  LIST_DELETED: "list:deleted",
  CARD_CREATED: "card:created",
  CARD_UPDATED: "card:updated",
  CARD_ARCHIVED: "card:archived",
  CARD_COMPLETION_UPDATED: "card:completion-updated",
  CARD_LABELS_UPDATED: "card:labels-updated",
  CARD_MEMBERS_UPDATED: "card:members-updated",
  CARD_META_UPDATED: "card:meta-updated",
  BOARD_ARCHIVED: "board:archived",
  BOARD_DELETED: "board:deleted",
  COMMENT_CREATED: "comment:created",
  BOARD_PRESENCE: "board:presence",
  NOTIFICATION_NEW: "notification:new",
  INVITATION_NEW: "invitation:new",
  ANALYTICS_REFRESH: "analytics:refresh",
  BOARD_ERROR: "board:error",
  WORKSPACE_ERROR: "workspace:error",
  BOARD_JOIN: "board:join",
  BOARD_LEAVE: "board:leave",
  WORKSPACE_JOIN: "workspace:join",
  WORKSPACE_LEAVE: "workspace:leave",
} as const satisfies Record<string, EventName>;

export const ROOMS = {
  board: (boardId: string) => `board:${boardId}`,
  user: (userId: string) => `user:${userId}`,
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,
} as const;
