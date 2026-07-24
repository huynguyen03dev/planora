"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
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
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [markAllReadError, setMarkAllReadError] = useState<string | null>(null);
  const [errorByInvitationId, setErrorByInvitationId] = useState<Record<string, string>>({});
  const [isResolving, startResolving] = useTransition();
  const hasLoadedOnceRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchInbox = useCallback(async () => {
    // Supersede any in-flight fetch: a rapid close→open (or a Retry mid-flight)
    // must not let an older response commit stale data over the newer one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setFetchError(null);
    setMarkAllReadError(null);

    let anyFailure = false;

    try {
      const [notificationsRes, invitationsRes] = await Promise.all([
        fetch("/api/notifications?limit=10", { signal: controller.signal }),
        fetch("/api/invitations/pending", { signal: controller.signal }),
      ]);

      let nextNotifications: InboxNotificationItem[] | undefined;
      let nextInvitations: InboxInvitationItem[] | undefined;

      if (notificationsRes.ok) {
        const data = await notificationsRes.json();
        nextNotifications = data.notifications ?? [];
      } else {
        anyFailure = true;
      }

      if (invitationsRes.ok) {
        const data = await invitationsRes.json();
        nextInvitations = data.invitations ?? [];
      } else {
        anyFailure = true;
      }

      // Commit state atomically — only replace populated data when both
      // endpoints succeeded and this fetch wasn't superseded, preventing a
      // partial failure (or a stale in-flight response) from stitching fresh
      // data onto stale.
      if (!anyFailure && !controller.signal.aborted) {
        setNotifications(nextNotifications ?? []);
        setInvitations(nextInvitations ?? []);
        onInvitationCountChange((nextInvitations ?? []).length);
        hasLoadedOnceRef.current = true;
      }
    } catch {
      anyFailure = true;
    } finally {
      // A superseded (aborted) fetch must not touch shared state — the fetch
      // that replaced it owns the loading/error/data now.
      if (!controller.signal.aborted) {
        // Surface error on first load for both network errors (catch) and
        // non-OK HTTP responses (anyFailure set from ok checks above).
        // When already loaded once, stay quiet — don't replace populated data.
        if (anyFailure && !hasLoadedOnceRef.current) {
          setFetchError("Failed to load notifications. Please try again.");
        }

        setIsLoading(false);
      }
    }
  }, [onInvitationCountChange]);

  useEffect(() => {
    if (isOpen) {
      fetchInbox();
    }
    // Abort the in-flight fetch when the dropdown closes/unmounts so a late
    // response can't commit onto a closed panel.
    return () => abortRef.current?.abort();
  }, [isOpen, fetchInbox]);

  const handleNotificationClick = useCallback(
    async (notification: InboxNotificationItem) => {
      if (!notification.isRead) {
        try {
          const result = await markNotificationReadAction(notification.id);
          if (result.success) {
            onMarkOneRead();
          }
        } catch {
          // Ignore — proceed to navigation even if mark-read fails.
        }
        // On failure the badge stays accurate (parent count unchanged). The
        // user's primary intent — navigate — still proceeds.
      }

      onClose();

      if (notification.linkUrl) {
        router.push(notification.linkUrl);
      }
    },
    [onClose, onMarkOneRead, router],
  );

  async function handleMarkAllRead() {
    setMarkAllReadError(null);
    try {
      const result = await markAllNotificationsReadAction();
      if (!result.success) {
        setMarkAllReadError(result.error);
        return;
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      onMarkAllRead();
    } catch {
      setMarkAllReadError("Failed to mark all as read. Please try again.");
    }
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
        {markAllReadError && (
          <span className="text-xs text-destructive" role="alert">
            {markAllReadError}
          </span>
        )}
        {hasUnreadNotifications && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleMarkAllRead}
            className="flex h-auto items-center gap-1 p-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" aria-hidden="true" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <HugeiconsIcon
              icon={Notification03Icon}
              className="size-8 opacity-50 text-destructive"
              aria-hidden="true"
            />
            <span className="text-sm text-destructive" role="alert">
              {fetchError}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchInbox}
            >
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <HugeiconsIcon icon={Notification03Icon} className="size-8 opacity-50" aria-hidden="true" />
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
                    aria-hidden="true"
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
