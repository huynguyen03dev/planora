"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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
  const pathname = usePathname();
  const isOverview = !searchParams.get("workspace") && pathname === "/boards";

  return (
    <aside className="themed-scrollbar flex max-h-[40dvh] w-full shrink-0 flex-col overflow-y-auto border-b bg-sidebar p-4 md:max-h-none md:w-64 md:overflow-visible md:border-b-0 md:border-r">
      <nav className="space-y-1">
        <Link
          href="/boards"
          className={`flex min-h-9 pointer-coarse:min-h-11 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-sidebar-accent ${
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
        <aside className="max-h-[40dvh] w-full shrink-0 overflow-y-auto border-b bg-sidebar md:max-h-none md:w-64 md:overflow-visible md:border-b-0 md:border-r" />
      }
    >
      <BoardsSidebarContent {...props} />
    </Suspense>
  );
}
