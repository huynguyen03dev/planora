"use client";

import type { ComponentProps } from "react";

import { Notification02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NotificationBellProps = ComponentProps<typeof Button> & {
  count: number;
  isOpen: boolean;
};

// Rendered inside <PopoverTrigger asChild>: forwards ref + props (onClick,
// aria-expanded, data-state) to the underlying Button so Radix can anchor the
// popover and own the open state. Do NOT add a self-toggling onClick here — the
// Popover toggles open state, and a second toggle would cancel it out.
export function NotificationBell({ count, isOpen, className, ...props }: NotificationBellProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      {...props}
      className={cn(
        "relative flex h-auto items-center gap-1.5 px-2 py-1.5",
        isOpen ? "bg-accent font-medium text-foreground" : "text-muted-foreground",
        className,
      )}
      aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
    >
      <HugeiconsIcon icon={Notification02Icon} className="size-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-xs font-semibold text-white ring-2 ring-background">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Button>
  );
}
