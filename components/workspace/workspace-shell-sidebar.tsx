"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AiMagicIcon,
  Analytics01Icon,
  KanbanIcon,
  Settings01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";

type WorkspaceShellSidebarProps = {
  workspaceId: string;
  slug: string;
  workspaceName: string;
};

export function WorkspaceShellSidebar({
  workspaceId,
  slug,
  workspaceName,
}: WorkspaceShellSidebarProps) {
  const pathname = usePathname();
  const base = `/workspace/${slug}`;

  const items = [
    {
      label: "Boards",
      href: `/boards?workspace=${workspaceId}`,
      icon: KanbanIcon,
      // U8 (round-2): the workspace root now exists as a redirect to the board
      // list; the item lights during that redirect frame (the sidebar is not
      // otherwise rendered for /boards).
      active: pathname === base,
    },
    {
      label: "Analytics",
      href: `${base}/dashboard`,
      icon: Analytics01Icon,
      active: pathname.startsWith(`${base}/dashboard`),
    },
    {
      label: "Members",
      href: `${base}/members`,
      icon: UserMultipleIcon,
      active: pathname.startsWith(`${base}/members`),
    },
    {
      label: "Automation",
      href: `${base}/automation`,
      icon: AiMagicIcon,
      active: pathname.startsWith(`${base}/automation`),
    },
    {
      label: "Settings",
      href: `${base}/settings`,
      icon: Settings01Icon,
      active: pathname.startsWith(`${base}/settings`),
    },
  ];

  const initial = workspaceName.charAt(0).toUpperCase();

  return (
    <aside className="flex w-full shrink-0 flex-col border-b bg-sidebar p-4 md:w-64 md:border-b-0 md:border-r">
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
          {initial}
        </div>
        <span className="truncate text-sm font-semibold">{workspaceName}</span>
      </div>

      <nav className="space-y-0.5">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent",
              item.active
                ? "bg-sidebar-accent font-medium text-foreground"
                : "text-muted-foreground",
            )}
          >
            <HugeiconsIcon icon={item.icon} className="size-4" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
