"use client";

import { useCallback } from "react";

import { Notification02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type NotificationBellProps = {
  count: number;
  onClick: () => void;
  isOpen: boolean;
};

export function NotificationBell({ count, onClick, isOpen }: NotificationBellProps) {
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
      aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
    >
      <HugeiconsIcon icon={Notification02Icon} className="size-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white ring-2 ring-background">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
