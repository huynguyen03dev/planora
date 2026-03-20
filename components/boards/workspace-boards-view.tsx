import { useState } from "react";

import { BoardCard } from "./board-card";
import { CreateBoardModal } from "./create-board-modal";
import { workspaceBadgeGradient } from "./styles";

type WorkspaceBoardsViewProps = {
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  boards: {
    id: string;
    title: string;
    backgroundColor?: string | null;
  }[];
  canCreateBoard: boolean;
};

export function WorkspaceBoardsView({
  workspace,
  boards,
  canCreateBoard,
}: WorkspaceBoardsViewProps) {
  const [isCreateBoardOpen, setCreateBoardOpen] = useState(false);
  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-lg ${workspaceBadgeGradient} text-lg font-bold text-white`}
        >
          {initial}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{workspace.name}</h1>
          <p className="text-sm text-muted-foreground">
            {boards.length} {boards.length === 1 ? "board" : "boards"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {boards.map((board) => (
          <BoardCard
            key={board.id}
            id={board.id}
            title={board.title}
            backgroundColor={board.backgroundColor}
          />
        ))}

        {canCreateBoard ? (
          <button
            type="button"
            className="flex h-24 w-44 items-center justify-center rounded-lg border-2 border-dashed border-muted text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            onClick={() => setCreateBoardOpen(true)}
          >
            + Create board
          </button>
        ) : null}
      </div>

      {canCreateBoard ? (
        <CreateBoardModal
          workspaceId={workspace.id}
          open={isCreateBoardOpen}
          onClose={() => setCreateBoardOpen(false)}
        />
      ) : null}
    </div>
  );
}
