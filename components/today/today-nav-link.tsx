"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * US-083 W6 — the discoverable Today entry in the authenticated global
 * chrome. A real link from every authenticated route; the active state is
 * carried by `aria-current="page"` plus a surface change — never color-only
 * (WCAG 1.4.1). top-nav voice per DESIGN.md: body-sm, muted until hover/active.
 */
export function TodayNavLink() {
  const pathname = usePathname();
  const isCurrent = pathname === "/today";

  return (
    <Link
      href="/today"
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        "flex min-h-9 pointer-coarse:min-h-11 items-center rounded-md px-2 text-sm font-medium transition-colors",
        isCurrent
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      Today
    </Link>
  );
}
