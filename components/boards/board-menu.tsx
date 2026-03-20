"use client";

import { useState } from "react";

import { BoardSettingsSidebar } from "@/components/boards/board-settings-sidebar";
import { DeleteBoardDialog } from "@/components/boards/delete-board-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BoardMenuProps = {
  board: {
    id: string;
    title: string;
    backgroundColor: string | null;
  };
  canEdit: boolean;
  canDelete: boolean;
};

export function BoardMenu({ board, canEdit, canDelete }: BoardMenuProps) {
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);

  if (!canEdit && !canDelete) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-full border-white/40 bg-white/15 text-white hover:bg-white/25"
            aria-label="Board menu"
          >
            ...
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-72 rounded-xl border-border/80 p-2">
          <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Board Actions
          </div>
          {canEdit ? (
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>Board settings</DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
              Archive board
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <BoardSettingsSidebar
        board={board}
        open={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <DeleteBoardDialog
        boardId={board.id}
        boardTitle={board.title}
        open={isDeleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
}
