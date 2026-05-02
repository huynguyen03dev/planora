export const EVENTS = {
  CARD_MOVED: "card:moved",
  COMMENT_CREATED: "comment:created",
  BOARD_JOIN: "board:join",
  BOARD_LEAVE: "board:leave",
} as const;

export const ROOMS = {
  board: (boardId: string) => `board:${boardId}`,
  user: (userId: string) => `user:${userId}`,
} as const;