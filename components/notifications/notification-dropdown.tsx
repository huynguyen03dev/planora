"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  Notification03Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  acceptInvitationAction,
  declineInvitationAction,
} from "@/lib/invitation-actions";
import {
  buildInboxItems,
  type InboxInvitationItem,
  type InboxNotificationItem,
} from "@/lib/notifications/inbox";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/lib/notification-actions";

type NotificationDropdownProps = {
  isOpen: boolean;
  onClose: () => void;
  onMarkOneRead: () => void;
  onMarkAllRead: () => void;
  onInvitationCountChange: (count: number) => void;
};

export function NotificationDropdown({
  isOpen,
  onClose,
  onMarkOneRead,
  onMarkAllRead,
  onInvitationCountChange,
}: NotificationDropdownProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<InboxNotificationItem[]>([]);
  const [invitations, setInvitations] = useState<InboxInvitationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorByInvitationId, setErrorByInvitationId] = useState<Record<string, string>>({});
  const [isResolving, startResolving] = useTransition();

  const fetchInbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const [notificationsRes, invitationsRes] = await Promise.all([
        fetch("/api/notifications?limit=10"),
        fetch("/api/invitations/pending"),
      ]);

      if (notificationsRes.ok) {
        const data = await notificationsRes.json();
        setNotifications(data.notifications ?? []);
      }

      if (invitationsRes.ok) {
        const data = await invitationsRes.json();
        const pending: InboxInvitationItem[] = data.invitations ?? [];
        setInvitations(pending);
        onInvitationCountChange(pending.length);
      }
    } catch {
      // Silently fail — the bell badge still reflects the last known counts.
    } finally {
      setIsLoading(false);
    }
  }, [onInvitationCountChange]);

  useEffect(() => {
    if (isOpen) {
      fetchInbox();
    }
  }, [isOpen, fetchInbox]);

  const handleNotificationClick = useCallback(
    async (notification: InboxNotificationItem) => {
      if (!notification.isRead) {
        await markNotificationReadAction(notification.id);
        onMarkOneRead();
      }

      onClose();

      if (notification.linkUrl) {
        window.location.href = notification.linkUrl;
      }
    },
    [onClose, onMarkOneRead],
  );

  async function handleMarkAllRead() {
    await markAllNotificationsReadAction();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    onMarkAllRead();
  }

  function setInvitationError(invitationId: string, error: string) {
    setErrorByInvitationId((current) => ({ ...current, [invitationId]: error }));
  }

  function clearInvitationError(invitationId: string) {
    setErrorByInvitationId((current) => {
      const next = { ...current };
      delete next[invitationId];
      return next;
    });
  }

  function removeInvitation(invitationId: string) {
    // Compute the next list outside the state updater: updaters run during
    // render, and notifying the parent there would setState mid-render. This
    // runs only from the async accept/decline handlers (event-driven), so it's
    // safe to call the parent callback directly.
    const next = invitations.filter((invitation) => invitation.id !== invitationId);
    setInvitations(next);
    onInvitationCountChange(next.length);
  }

  function handleAccept(invitationId: string, workspaceId: string) {
    clearInvitationError(invitationId);

    const formData = new FormData();
    formData.set("invitationId", invitationId);

    startResolving(async () => {
      const result = await acceptInvitationAction(formData);

      if (!result.success) {
        setInvitationError(invitationId, result.error);
        return;
      }

      removeInvitation(invitationId);
      onClose();
      router.push(`/boards?workspace=${result.workspaceId ?? workspaceId}`);
    });
  }

  function handleDecline(invitationId: string) {
    clearInvitationError(invitationId);

    const formData = new FormData();
    formData.set("invitationId", invitationId);

    startResolving(async () => {
      const result = await declineInvitationAction(formData);

      if (!result.success) {
        setInvitationError(invitationId, result.error);
        return;
      }

      removeInvitation(invitationId);
    });
  }

  if (!isOpen) return null;

  const items = buildInboxItems(notifications, invitations);
  const hasUnreadNotifications = notifications.some((n) => !n.isRead);

  return (
    <div className="w-full flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-semibold">Notifications</span>
        {hasUnreadNotifications && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleMarkAllRead}
            className="flex h-auto items-center gap-1 p-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <HugeiconsIcon icon={Notification03Icon} className="size-8 opacity-50" />
            <span className="text-sm">No notifications yet</span>
          </div>
        ) : (
          items.map((item) =>
            item.kind === "invitation" ? (
              <div
                key={`invitation-${item.id}`}
                className="border-b bg-accent/30 px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <HugeiconsIcon
                    icon={UserGroupIcon}
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">
                      Invitation to {item.workspaceName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.inviterName} invited you as {item.role}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expires {new Date(item.expiresAt).toLocaleDateString()}
                    </p>

                    {errorByInvitationId[item.id] ? (
                      <p className="mt-2 text-xs text-destructive">
                        {errorByInvitationId[item.id]}
                      </p>
                    ) : null}

                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAccept(item.id, item.workspaceId)}
                        disabled={isResolving}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDecline(item.id)}
                        disabled={isResolving}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <button
                key={`notification-${item.id}`}
                type="button"
                onClick={() => handleNotificationClick(item)}
                className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${
                  item.isRead ? "opacity-60" : "bg-accent/50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm leading-tight ${
                      item.isRead ? "font-normal" : "font-semibold"
                    }`}
                  >
                    {/* Non-color unread signal (WCAG 1.4.1 / DESIGN.md §393): the
                        title weight (semibold vs normal) carries the unread state
                        in grayscale, alongside the color dot. The sr-only label
                        gives the same cue to assistive tech. */}
                    {!item.isRead && <span className="sr-only">Unread: </span>}
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {item.message}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatRelativeTime(item.createdAt)}
                  </p>
                </div>
                {!item.isRead && (
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                  />
                )}
              </button>
            ),
          )
        )}
      </div>

      <div className="border-t px-4 py-2">
        <Link
          href="/notifications"
          onClick={onClose}
          className="text-center text-xs text-muted-foreground hover:text-foreground"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
