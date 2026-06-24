export interface BoardEventPayload {
  boardId: string;
}

export interface CardMovedPayload extends BoardEventPayload {
  cardId: string;
  listId: string;
  position: number;
}

export interface ListMovedPayload extends BoardEventPayload {
  listId: string;
  position: number;
}

export interface ListSnapshot {
  id: string;
  title: string;
  boardId: string;
  isDone: boolean;
  position: number;
}

export interface ListCreatedPayload extends BoardEventPayload {
  list: ListSnapshot;
}

export interface ListUpdatedPayload extends BoardEventPayload {
  listId: string;
  title?: string;
  isDone?: boolean;
}

export interface ListDeletedPayload extends BoardEventPayload {
  listId: string;
}

export interface CardSnapshot {
  id: string;
  listId: string;
  title: string;
  position: number;
}

export interface CardCreatedPayload extends BoardEventPayload {
  card: CardSnapshot;
}

export interface CardUpdatedPayload extends BoardEventPayload {
  cardId: string;
  title: string;
}

export interface CardArchivedPayload extends BoardEventPayload {
  cardId: string;
}

export interface CardLabelSnapshot {
  id: string;
  name: string;
  color: string;
}

export interface CardLabelsUpdatedPayload extends BoardEventPayload {
  cardId: string;
  labels: CardLabelSnapshot[];
}

export interface CardMemberSnapshot {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface CardMembersUpdatedPayload extends BoardEventPayload {
  cardId: string;
  members: CardMemberSnapshot[];
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

export interface NotificationNewPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface WorkspaceEventPayload {
  workspaceId: string;
}

export interface AnalyticsRefreshPayload {
  workspaceId: string;
  timestamp: string;
}

export type ServerToClientEvents = {
  "card:moved": (payload: CardMovedPayload) => void;
  "list:moved": (payload: ListMovedPayload) => void;
  "list:created": (payload: ListCreatedPayload) => void;
  "list:updated": (payload: ListUpdatedPayload) => void;
  "list:deleted": (payload: ListDeletedPayload) => void;
  "card:created": (payload: CardCreatedPayload) => void;
  "card:updated": (payload: CardUpdatedPayload) => void;
  "card:archived": (payload: CardArchivedPayload) => void;
  "card:labels-updated": (payload: CardLabelsUpdatedPayload) => void;
  "card:members-updated": (payload: CardMembersUpdatedPayload) => void;
  "comment:created": (payload: CommentCreatedPayload) => void;
  "notification:new": (payload: NotificationNewPayload) => void;
  "analytics:refresh": (payload: AnalyticsRefreshPayload) => void;
  "board:error": (payload: { message: string }) => void;
};

export type ClientToServerEvents = {
  "board:join": (payload: BoardEventPayload) => void;
  "board:leave": (payload: BoardEventPayload) => void;
  "workspace:join": (payload: WorkspaceEventPayload) => void;
  "workspace:leave": (payload: WorkspaceEventPayload) => void;
};

export interface JoinBoardPayload {
  boardId: string;
}

export interface LeaveBoardPayload {
  boardId: string;
}
