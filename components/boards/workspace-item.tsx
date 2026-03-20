"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { workspaceBadgeGradient } from "./styles";

type WorkspaceItemProps = {
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
};

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  const searchParams = useSearchParams();
  const selectedWorkspaceId = searchParams.get("workspace");
  const isActive = selectedWorkspaceId === workspace.id;
  const [isManuallyExpanded, setManuallyExpanded] = useState(isActive);
  const expanded = isActive || isManuallyExpanded;

  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <div>
      <button
        type="button"
        onClick={() => setManuallyExpanded((value) => !value)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent"
      >
        <div
          className={`flex size-6 shrink-0 items-center justify-center rounded ${workspaceBadgeGradient} text-xs font-bold text-white`}
        >
          {initial}
        </div>
        <span className="flex-1 truncate text-left">{workspace.name}</span>
        <span className="text-xs text-muted-foreground">
          {expanded ? "▼" : "▶"}
        </span>
      </button>

      {expanded ? (
        <div className="ml-8 mt-1 space-y-0.5">
          <Link
            href={`/boards?workspace=${workspace.id}`}
            className={`block rounded-md px-2 py-1 text-sm transition-colors hover:bg-sidebar-accent ${
              isActive ? "bg-sidebar-accent font-medium" : "text-muted-foreground"
            }`}
          >
            Boards
          </Link>
        </div>
      ) : null}
    </div>
  );
}
