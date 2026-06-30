"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/lib/notification-actions";

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
};

export function NotificationsListClient({ notifications: initialNotifications }: NotificationsListClientProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
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

  return (
    <div className="space-y-2">
      {hasUnread && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Mark all as read
          </button>
        </div>
      )}

      <div className="divide-y rounded-lg border">
        {notifications.map((notification) => (
          <button
            key={notification.id}
            type="button"
            onClick={() => handleNotificationClick(notification)}
            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent ${
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
