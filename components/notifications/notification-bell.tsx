"use client";

import { useState, useEffect, useCallback } from "react";

import { Notification02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { initSocket } from "@/lib/realtime/client";

type NotificationBellProps = {
  initialUnreadCount: number;
  onClick: () => void;
  isOpen: boolean;
};

export function NotificationBell({
  initialUnreadCount,
  onClick,
  isOpen,
}: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  // The socket is owned by SocketLifecycleProvider and stays alive for the whole
  // authenticated session, so a single subscribe-on-mount is sufficient.
  useEffect(() => {
    const socket = initSocket();

    function handleNotificationNew() {
      setUnreadCount((prev) => prev + 1);
    }

    socket.on("notification:new", handleNotificationNew);

    return () => {
      socket.off("notification:new", handleNotificationNew);
    };
  }, []);

  const handleClick = useCallback(() => {
    onClick();
  }, [onClick]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
        isOpen ? "bg-accent font-medium" : "text-muted-foreground"
      }`}
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
    >
      <HugeiconsIcon icon={Notification02Icon} className="size-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
