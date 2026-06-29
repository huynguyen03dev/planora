"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { BoardCard } from "./board-card";
import { CreateBoardModal } from "./create-board-modal";
import { workspaceBadgeGradient } from "./styles";

type WorkspaceSectionProps = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    canCreateBoard: boolean;
  };
  boards: {
    id: string;
    title: string;
    backgroundColor?: string | null;
  }[];
  starredBoardIds?: string[];
};

export function WorkspaceSection({ workspace, boards, starredBoardIds = [] }: WorkspaceSectionProps) {
  const [isCreateBoardOpen, setCreateBoardOpen] = useState(false);
  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-8 items-center justify-center rounded-md ${workspaceBadgeGradient} text-sm font-bold text-white`}
        >
          {initial}
        </div>
        <h2 className="font-medium">{workspace.name}</h2>
      </div>

      <div className="flex flex-wrap gap-4">
        {boards.map((board) => (
          <BoardCard
            key={board.id}
            id={board.id}
            title={board.title}
            backgroundColor={board.backgroundColor}
            starred={starredBoardIds.includes(board.id)}
          />
        ))}

        {workspace.canCreateBoard ? (
          <Button
            type="button"
            variant="outline"
            className="h-24 w-44 rounded-lg border-2 border-dashed border-muted bg-transparent text-sm font-normal text-muted-foreground shadow-none hover:border-primary/50 hover:bg-transparent hover:text-foreground"
            onClick={() => setCreateBoardOpen(true)}
          >
            + Create board
          </Button>
        ) : null}
      </div>

      {workspace.canCreateBoard ? (
        <CreateBoardModal
          workspaceId={workspace.id}
          open={isCreateBoardOpen}
          onClose={() => setCreateBoardOpen(false)}
        />
      ) : null}
    </section>
  );
}
