export const EVENTS = {
  CARD_MOVED: "card:moved",
  COMMENT_CREATED: "comment:created",
  BOARD_JOIN: "board:join",
  BOARD_LEAVE: "board:leave",
  WORKSPACE_JOIN: "workspace:join",
  WORKSPACE_LEAVE: "workspace:leave",
  ANALYTICS_REFRESH: "analytics:refresh",
} as const;

export const ROOMS = {
  board: (boardId: string) => `board:${boardId}`,
  user: (userId: string) => `user:${userId}`,
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,
} as const;