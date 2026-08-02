import type { WorkspaceRole } from "@/lib/authorization";

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
  position: number;
}

export interface ListCreatedPayload extends BoardEventPayload {
  list: ListSnapshot;
}

export interface ListRestoredPayload extends BoardEventPayload {
  list: ListSnapshot;
}

export interface ListUpdatedPayload extends BoardEventPayload {
  listId: string;
  title?: string;
}

export interface ListDeletedPayload extends BoardEventPayload {
  listId: string;
}

export type CardPriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";

export interface CardSnapshot {
  id: string;
  listId: string;
  title: string;
  position: number;
  // US-083 W7: quick-captured cards carry due date + priority fidelity to
  // observer clients. Optional so pre-W7 emitters/payloads stay valid — the
  // receiver falls back to null when absent.
  dueDate?: string | null;
  priority?: CardPriority | null;
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

// In-place / live (not structural): a card's completion flag flipped. Carries
// completedAt (ISO string, or null when reopened) — not a bare boolean — so the
// receiver recomputes due-status. Safe to apply mid-drag: it never reorders the
// list array (mirrors card:labels-updated). US-045.
export interface CardCompletionUpdatedPayload extends BoardEventPayload {
  cardId: string;
  completedAt: string | null;
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

// Minimal, non-sensitive live-arrival signal (US-083 W2): the invitee's own
// user-room event carries only the invitation's public id — the header bumps
// the badge; the inbox re-fetches authoritative state from the invitation
// table when opened. No workspace/inviter details ride the wire.
export interface InvitationNewPayload {
  invitationId: string;
}

// Board-independent display fields, resolved once per socket connection.
export interface UserProfile {
  id: string;
  name: string;
  image: string | null;
}

// A watcher is a profile plus the role it holds in *this board's* workspace, so
// the presence list can mark board admins (US-047). Role is per-board (a user may
// be admin in one workspace and viewer in another), so it is resolved per join,
// not cached with the profile.
export interface Watcher extends UserProfile {
  role: WorkspaceRole;
}

export interface BoardPresencePayload extends BoardEventPayload {
  watchers: Watcher[];
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
  "list:restored": (payload: ListRestoredPayload) => void;
  "list:updated": (payload: ListUpdatedPayload) => void;
  "list:deleted": (payload: ListDeletedPayload) => void;
  "card:created": (payload: CardCreatedPayload) => void;
  "card:updated": (payload: CardUpdatedPayload) => void;
  "card:archived": (payload: CardArchivedPayload) => void;
  "card:completion-updated": (payload: CardCompletionUpdatedPayload) => void;
  "card:labels-updated": (payload: CardLabelsUpdatedPayload) => void;
  "card:members-updated": (payload: CardMembersUpdatedPayload) => void;
  "comment:created": (payload: CommentCreatedPayload) => void;
  "board:presence": (payload: BoardPresencePayload) => void;
  "notification:new": (payload: NotificationNewPayload) => void;
  "invitation:new": (payload: InvitationNewPayload) => void;
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
