/**
 * Unified inbox: merges activity notifications and pending workspace
 * invitations into a single ordered list for the notification dropdown.
 *
 * Invitations are action items (Accept / Decline) rather than read/unread
 * events, so they are pinned above notifications, soonest-to-expire first.
 * Notifications follow, most recent first.
 */

export type InboxNotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

export type InboxInvitationItem = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  inviterName: string;
  expiresAt: string;
  createdAt: string;
};

export type InboxItem =
  | ({ kind: "invitation" } & InboxInvitationItem)
  | ({ kind: "notification" } & InboxNotificationItem);

export function buildInboxItems(
  notifications: InboxNotificationItem[],
  invitations: InboxInvitationItem[],
): InboxItem[] {
  const invitationItems: InboxItem[] = [...invitations]
    .sort(
      (a, b) =>
        new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
    )
    .map((invitation) => ({ kind: "invitation", ...invitation }));

  const notificationItems: InboxItem[] = [...notifications]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .map((notification) => ({ kind: "notification", ...notification }));

  return [...invitationItems, ...notificationItems];
}

/**
 * Badge count surfaced on the global bell: unread activity notifications plus
 * pending invitations, so a standing decision signals everywhere — not just on
 * the boards page where the old sidebar entry lived.
 */
export function computeInboxBadgeCount(
  unreadNotificationCount: number,
  pendingInvitationCount: number,
): number {
  return Math.max(0, unreadNotificationCount) + Math.max(0, pendingInvitationCount);
}
