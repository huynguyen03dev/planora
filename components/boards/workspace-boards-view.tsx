import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

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
  starredBoardIds?: string[];
  canCreateBoard: boolean;
};

export function WorkspaceBoardsView({
  workspace,
  boards,
  starredBoardIds = [],
  canCreateBoard,
}: WorkspaceBoardsViewProps) {
  const [isCreateBoardOpen, setCreateBoardOpen] = useState(false);
  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
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

        <Link
          href={`/workspace?workspace=${workspace.id}`}
          className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Manage members
        </Link>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4">
        {boards.map((board) => (
          <BoardCard
            key={board.id}
            id={board.id}
            title={board.title}
            backgroundColor={board.backgroundColor}
            starred={starredBoardIds.includes(board.id)}
          />
        ))}

        {canCreateBoard ? (
          <Button
            type="button"
            variant="outline"
            className="h-24 w-full rounded-lg border-2 border-dashed border-muted bg-transparent text-sm font-normal text-muted-foreground shadow-none hover:border-primary/50 hover:bg-transparent hover:text-foreground"
            onClick={() => setCreateBoardOpen(true)}
          >
            + Create board
          </Button>
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
