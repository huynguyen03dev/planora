"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/lib/notification-actions";

import { Button } from "@/components/ui/button";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
};

type NotificationsListClientProps = {
  notifications: NotificationItem[];
  // Whether more notifications may exist behind the initial batch (the first
  // page filled its limit). Later pages infer it from the fetched batch size.
  hasMore: boolean;
};

// Inbox cursor pagination page size — matches the server default limit (50)
// in lib/notification.ts and the /api/notifications route.
const PAGE_SIZE = 50;

export function NotificationsListClient({
  notifications: initialNotifications,
  hasMore: initialHasMore,
}: NotificationsListClientProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const router = useRouter();

  async function handleMarkAllRead() {
    await markAllNotificationsReadAction();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: new Date() })),
    );
  }

  async function handleNotificationClick(notification: NotificationItem) {
    if (!notification.isRead) {
      await markNotificationReadAction(notification.id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, isRead: true, readAt: new Date() } : n,
        ),
      );
    }

    if (notification.linkUrl) {
      router.push(notification.linkUrl);
    }
  }

  const hasUnread = notifications.some((n) => !n.isRead);

  // Fetches the next page behind the last loaded notification (cursor
  // pagination via /api/notifications?cursor=…). Appends with an id dedupe so
  // a load racing a mark-read re-render can never double-list a row.
  async function handleLoadMore() {
    const cursor = notifications[notifications.length - 1]?.id;
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(
        `/api/notifications?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}`,
      );
      if (!res.ok) throw new Error("Failed to load more notifications");
      const data = (await res.json()) as { notifications: NotificationItem[] };
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...data.notifications.filter((n) => !seen.has(n.id))];
      });
      // A short batch means the end of the feed; a full batch may hide more.
      setHasMore(data.notifications.length >= PAGE_SIZE);
    } catch {
      // Leave the button in place on failure so the user can retry.
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <div className="space-y-2">
      {hasUnread && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={handleMarkAllRead}
            className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground hover:no-underline font-normal"
          >
            Mark all as read
          </Button>
        </div>
      )}

      <div className="divide-y rounded-lg border">
        {notifications.map((notification) => (
          <button
            key={notification.id}
            type="button"
            onClick={() => handleNotificationClick(notification)}
            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${
              notification.isRead ? "opacity-60" : "bg-accent/50"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm ${
                  notification.isRead ? "font-normal" : "font-semibold"
                }`}
              >
                {/* Non-color unread signal (WCAG 1.4.1 / DESIGN.md §393): the
                    title weight (semibold vs normal) carries the unread state in
                    grayscale, alongside the color dot; sr-only label for AT. */}
                {!notification.isRead && <span className="sr-only">Unread: </span>}
                {notification.title}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {notification.message}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatRelativeTime(notification.createdAt)}
              </p>
            </div>
            {!notification.isRead && (
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
              />
            )}
          </button>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
}
