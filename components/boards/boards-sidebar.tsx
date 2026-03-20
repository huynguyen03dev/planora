"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { WorkspaceItem } from "./workspace-item";

type BoardsSidebarProps = {
  workspaces: {
    id: string;
    name: string;
    slug: string;
  }[];
};

function BoardsSidebarContent({ workspaces }: BoardsSidebarProps) {
  const searchParams = useSearchParams();
  const isOverview = !searchParams.get("workspace");

  return (
    <aside className="flex w-full shrink-0 flex-col border-b bg-sidebar p-4 md:w-64 md:border-b-0 md:border-r">
      <nav className="space-y-1">
        <Link
          href="/boards"
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent ${
            isOverview ? "bg-sidebar-accent font-medium" : ""
          }`}
        >
          <span>Boards</span>
        </Link>
      </nav>

      <div className="mt-6">
        <h3 className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Workspaces
        </h3>
        <div className="mt-2 space-y-1">
          {workspaces.map((workspace) => (
            <WorkspaceItem key={workspace.id} workspace={workspace} />
          ))}
        </div>
      </div>
    </aside>
  );
}

export function BoardsSidebar(props: BoardsSidebarProps) {
  return (
    <Suspense
      fallback={
        <aside className="w-full shrink-0 border-b bg-sidebar md:w-64 md:border-b-0 md:border-r" />
      }
    >
      <BoardsSidebarContent {...props} />
    </Suspense>
  );
}
