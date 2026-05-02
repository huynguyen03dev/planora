"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, Notification03Icon } from "@hugeicons/core-free-icons";

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
  createdAt: string;
};

type NotificationDropdownProps = {
  isOpen: boolean;
  onClose: () => void;
  onMarkOneRead: () => void;
  onMarkAllRead: () => void;
};

export function NotificationDropdown({
  isOpen,
  onClose,
  onMarkOneRead,
  onMarkAllRead,
}: NotificationDropdownProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      fetchNotifications();
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  async function fetchNotifications() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }

  const handleNotificationClick = useCallback(async (notification: NotificationItem) => {
    if (!notification.isRead) {
      await markNotificationReadAction(notification.id);
      onMarkOneRead();
    }

    onClose();

    if (notification.linkUrl) {
      window.location.href = notification.linkUrl;
    }
  }, [onClose, onMarkOneRead]);

  async function handleMarkAllRead() {
    await markAllNotificationsReadAction();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true })),
    );
    onMarkAllRead();
  }

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-popover p-0 shadow-lg"
    >
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-semibold">Notifications</span>
        {notifications.some((n) => !n.isRead) && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <HugeiconsIcon icon={Notification03Icon} className="size-8 opacity-50" />
            <span className="text-sm">No notifications yet</span>
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => handleNotificationClick(notification)}
              className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent ${
                notification.isRead ? "opacity-60" : "bg-accent/50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">
                  {notification.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {notification.message}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatRelativeTime(notification.createdAt)}
                </p>
              </div>
              {!notification.isRead && (
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
              )}
            </button>
          ))
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
