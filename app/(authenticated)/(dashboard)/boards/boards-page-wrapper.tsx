"use client";

import { useState } from "react";

import type { WorkspaceBoard } from "@/lib/workspace";

import { BoardsPageClient } from "./boards-page-client";

type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
};

type BoardsPageWrapperProps = {
  workspaces: WorkspaceSummary[];
  boards: WorkspaceBoard[];
  selectedWorkspaceId: string | null;
  initialModalOpen?: boolean;
};

export function BoardsPageWrapper({
  workspaces,
  boards,
  selectedWorkspaceId,
  initialModalOpen = false,
}: BoardsPageWrapperProps) {
  const [isModalOpen, setModalOpen] = useState(initialModalOpen);

  return (
    <>
      <BoardsPageClient
        workspaces={workspaces}
        boards={boards}
        selectedWorkspaceId={selectedWorkspaceId}
        modalOpen={isModalOpen}
        onOpenModal={() => setModalOpen(true)}
        onCloseModal={() => setModalOpen(false)}
      />
    </>
  );
}
