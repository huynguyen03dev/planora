"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { WorkspaceBoard } from "@/lib/workspace";

import { BoardsPageClient } from "./boards-page-client";

type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: string;
  canCreateBoard: boolean;
};

type BoardsPageWrapperProps = {
  workspaces: WorkspaceSummary[];
  boards: WorkspaceBoard[];
  selectedWorkspaceId: string | null;
};

export function BoardsPageWrapper({
  workspaces,
  boards,
  selectedWorkspaceId,
}: BoardsPageWrapperProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleOpenModal() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("createWorkspace", "1");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <BoardsPageClient
        workspaces={workspaces}
        boards={boards}
        selectedWorkspaceId={selectedWorkspaceId}
        onOpenModal={handleOpenModal}
      />
    </>
  );
}
