"use client";

import { BoardsOverview } from "@/components/boards/boards-overview";
import { BoardsSidebar } from "@/components/boards/boards-sidebar";
import { EmptyBoardsState } from "@/components/boards/empty-boards-state";
import { WorkspaceBoardsView } from "@/components/boards/workspace-boards-view";
import type { WorkspaceBoard } from "@/lib/workspace";

type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: string;
  canCreateBoard: boolean;
};

type BoardsPageClientProps = {
  workspaces: WorkspaceSummary[];
  boards: WorkspaceBoard[];
  selectedWorkspaceId: string | null;
  onOpenModal: () => void;
};

export function BoardsPageClient({
  workspaces,
  boards,
  selectedWorkspaceId,
  onOpenModal,
}: BoardsPageClientProps) {
  if (workspaces.length === 0) {
    return (
      <>
        <EmptyBoardsState onCreateWorkspace={onOpenModal} />
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
              canCreateBoard={selectedWorkspace.canCreateBoard}
            />
          ) : (
            <BoardsOverview workspaces={workspaces} boards={boards} />
          )}
        </main>
      </div>
    </>
  );
}
