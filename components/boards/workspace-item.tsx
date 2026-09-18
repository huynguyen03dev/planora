"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Analytics01Icon,
  ChevronDown,
  ChevronRight,
  KanbanIcon,
  Settings01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";

import { workspaceBadgeSurface } from "./styles";

type WorkspaceItemProps = {
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
};

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const selectedWorkspaceId = searchParams.get("workspace");
  const isActive = selectedWorkspaceId === workspace.id;
  const base = `/workspace/${workspace.slug}`;
  // Any of this workspace's shell routes is open — used to auto-expand the item.
  const isShellRouteActive = pathname.startsWith(`${base}/`);

  const links = [
    {
      label: "Boards",
      href: `/boards?workspace=${workspace.id}`,
      icon: KanbanIcon,
      active: isActive,
    },
    {
      label: "Analytics",
      href: `${base}/dashboard`,
      icon: Analytics01Icon,
      // Match the dashboard route exactly — startsWith(base) would also light
      // Analytics on the members/settings routes (US-063 nav bleed).
      active: pathname === `${base}/dashboard`,
    },
    {
      label: "Members",
      href: `${base}/members`,
      icon: UserMultipleIcon,
      active: pathname.startsWith(`${base}/members`),
    },
    {
      label: "Settings",
      href: `${base}/settings`,
      icon: Settings01Icon,
      active: pathname.startsWith(`${base}/settings`),
    },
  ];

  const [isManuallyExpanded, setManuallyExpanded] = useState(
    isActive || isShellRouteActive,
  );
  const expanded = isActive || isShellRouteActive || isManuallyExpanded;

  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <div>
      <button
        type="button"
        onClick={() => setManuallyExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex min-h-9 pointer-coarse:min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-sidebar-accent"
      >
        <div
          className={`flex size-6 shrink-0 items-center justify-center rounded ${workspaceBadgeSurface} text-xs font-bold`}
        >
          {initial}
        </div>
        <span className="flex-1 truncate text-left">{workspace.name}</span>
        <span
          className="text-xs text-muted-foreground transition-transform duration-150"
          aria-hidden="true"
        >
          <HugeiconsIcon
            icon={expanded ? ChevronDown : ChevronRight}
            className="size-4"
          />
        </span>
      </button>

      {expanded ? (
        <div className="ml-8 mt-1 space-y-0.5">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              className={cn(
                "flex min-h-9 pointer-coarse:min-h-11 items-center gap-1.5 rounded-md px-2 text-sm transition-colors hover:bg-sidebar-accent",
                link.active
                  ? "bg-sidebar-accent font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <HugeiconsIcon icon={link.icon} className="size-3.5" />
              <span>{link.label}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
