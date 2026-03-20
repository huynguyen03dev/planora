"use client";

import { useState, useTransition } from "react";

import { updateBoardAction } from "@/app/(authenticated)/(dashboard)/boards/actions";
import { ColorPalette } from "@/components/boards/color-palette";
import { Button } from "@/components/ui/button";
import {
  SheetClose,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DEFAULT_BOARD_COLOR } from "@/lib/constants";

type BoardSettingsSidebarProps = {
  board: {
    id: string;
    title: string;
    backgroundColor: string | null;
  };
  open: boolean;
  onClose: () => void;
};

export function BoardSettingsSidebar({
  board,
  open,
  onClose,
}: BoardSettingsSidebarProps) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedColor = board.backgroundColor ?? DEFAULT_BOARD_COLOR;

  function handleChangeColor(nextColor: string) {
    setError("");

    const formData = new FormData();
    formData.set("boardId", board.id);
    formData.set("backgroundColor", nextColor);

    startTransition(async () => {
      const result = await updateBoardAction(formData);
      if (!result.success) {
        setError(result.error);
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setError("");
          onClose();
        }
      }}
    >
      <SheetContent side="right">
        <div className="flex items-start justify-between gap-2">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>Update board background color for {board.title}.</SheetDescription>
          </SheetHeader>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="sm">
              Close
            </Button>
          </SheetClose>
        </div>

        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-medium">Background</h3>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <ColorPalette
            value={selectedColor}
            onChange={handleChangeColor}
            disabled={isPending}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
