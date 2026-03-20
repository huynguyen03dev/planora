"use client";

import { BoardsOverview } from "@/components/boards/boards-overview";
import { BoardsSidebar } from "@/components/boards/boards-sidebar";
import { CreateWorkspaceModal } from "@/components/boards/create-workspace-modal";
import { EmptyBoardsState } from "@/components/boards/empty-boards-state";
import { WorkspaceBoardsView } from "@/components/boards/workspace-boards-view";
import type { WorkspaceBoard } from "@/lib/workspace";

type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
};

type BoardsPageClientProps = {
  workspaces: WorkspaceSummary[];
  boards: WorkspaceBoard[];
  selectedWorkspaceId: string | null;
  modalOpen: boolean;
  onOpenModal: () => void;
  onCloseModal: () => void;
};

export function BoardsPageClient({
  workspaces,
  boards,
  selectedWorkspaceId,
  modalOpen,
  onOpenModal,
  onCloseModal,
}: BoardsPageClientProps) {
  if (workspaces.length === 0) {
    return (
      <>
        <EmptyBoardsState onCreateWorkspace={onOpenModal} />
        <CreateWorkspaceModal open={modalOpen} onClose={onCloseModal} />
      </>
    );
  }

  const selectedWorkspace = selectedWorkspaceId
    ? workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null
    : null;

  return (
    <>
      <div className="flex flex-1 flex-col md:flex-row">
        <BoardsSidebar workspaces={workspaces} />
        <main className="flex-1 p-6">
          {selectedWorkspace ? (
            <WorkspaceBoardsView
              workspace={selectedWorkspace}
              boards={boards.filter(
                (board) => board.workspaceId === selectedWorkspace.id,
              )}
            />
          ) : (
            <BoardsOverview workspaces={workspaces} boards={boards} />
          )}
        </main>
      </div>

      <CreateWorkspaceModal open={modalOpen} onClose={onCloseModal} />
    </>
  );
}
