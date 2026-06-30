"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { WorkspaceBoard } from "@/lib/workspace";

import { BoardCard } from "./board-card";
import { CreateBoardModal } from "./create-board-modal";
import { workspaceBadgeSurface } from "./styles";

type WorkspaceSectionProps = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    canCreateBoard: boolean;
  };
  boards: WorkspaceBoard[];
  starredBoardIds?: string[];
};

export function WorkspaceSection({ workspace, boards, starredBoardIds = [] }: WorkspaceSectionProps) {
  const [isCreateBoardOpen, setCreateBoardOpen] = useState(false);
  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-8 items-center justify-center rounded-md ${workspaceBadgeSurface} text-sm font-bold`}
        >
          {initial}
        </div>
        <h2 className="font-medium">{workspace.name}</h2>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4">
        {boards.map((board) => (
          <BoardCard
            key={board.id}
            {...board}
            starred={starredBoardIds.includes(board.id)}
          />
        ))}

        {workspace.canCreateBoard ? (
          <Button
            type="button"
            variant="outline"
            className="h-full min-h-32 w-full rounded-lg border-2 border-dashed border-muted bg-transparent text-sm font-normal text-muted-foreground shadow-none hover:border-primary/50 hover:bg-transparent hover:text-foreground"
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
