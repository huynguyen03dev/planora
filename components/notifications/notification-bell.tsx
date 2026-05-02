"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import { Notification02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { initSocket } from "@/lib/realtime/client";
import type { NotificationNewPayload } from "@/lib/realtime/types";

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
  const handlerRef = useRef<((payload: NotificationNewPayload) => void) | null>(null);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  // Re-register listener on every socket (re)connect to survive disconnectSocket()
  useEffect(() => {
    handlerRef.current = () => {
      setUnreadCount((prev) => prev + 1);
    };

    function attachListener() {
      const socket = initSocket();
      if (!socket || !handlerRef.current) return;
      socket.on("notification:new", handlerRef.current);
    }

    // Attach on mount
    attachListener();

    // Poll for socket changes — the board store calls disconnectSocket() which
    // nullifies the module variable. The next initSocket() creates a fresh socket,
    // but our old listener is gone. We detect this via the socket's active flag.
    const interval = setInterval(() => {
      const socket = initSocket();
      if (socket && handlerRef.current) {
        const listeners = socket.listeners("notification:new");
        if (listeners.length === 0) {
          socket.on("notification:new", handlerRef.current);
        }
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      const socket = initSocket();
      if (socket && handlerRef.current) {
        socket.off("notification:new", handlerRef.current);
      }
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
