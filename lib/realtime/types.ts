export interface BoardEventPayload {
  boardId: string;
}

export interface CardMovedPayload extends BoardEventPayload {
  cardId: string;
  listId: string;
  position: number;
}

export interface CommentCreatedPayload extends BoardEventPayload {
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
}

export type ServerToClientEvents = {
  "card:moved": (payload: CardMovedPayload) => void;
  "comment:created": (payload: CommentCreatedPayload) => void;
  "board:error": (payload: { message: string }) => void;
};

export type ClientToServerEvents = {
  "board:join": (payload: BoardEventPayload) => void;
  "board:leave": (payload: BoardEventPayload) => void;
};

export interface JoinBoardPayload {
  boardId: string;
}

export interface LeaveBoardPayload {
  boardId: string;
}