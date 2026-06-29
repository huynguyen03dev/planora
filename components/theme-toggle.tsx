"use client";

import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun03Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The trigger icon is driven purely by the `.dark` class via CSS (no JS theme
  // read), so it never hydration-mismatches. The dropdown content — the only
  // place the JS `theme` value is read — is portal-rendered on open, well after
  // mount, so `theme` is resolved by then; no `mounted` guard is needed.
  const current = theme ?? "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // Matches the notification bell's hit target and hover treatment so the
        // two header controls read as a set.
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Switch theme"
      >
        {/* Sun in light, moon in dark — the icon swaps via the .dark class so it
            is correct even before the toggle is opened. */}
        <HugeiconsIcon icon={Sun03Icon} className="size-4 dark:hidden" />
        <HugeiconsIcon icon={Moon02Icon} className="hidden size-4 dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setTheme(option.value)}
            className="gap-2"
          >
            <HugeiconsIcon icon={option.icon} className="size-4" />
            <span className="flex-1">{option.label}</span>
            {/* Non-color selection indicator (WCAG 1.4.1). */}
            <span
              aria-hidden
              className={cn("text-xs", current === option.value ? "opacity-100" : "opacity-0")}
            >
              ✓
            </span>
            {current === option.value && <span className="sr-only">(selected)</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
