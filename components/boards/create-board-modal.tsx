"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createBoardAction } from "@/app/(authenticated)/(dashboard)/boards/actions";
import { ColorPalette } from "@/components/boards/color-palette";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_BOARD_COLOR } from "@/lib/constants";

type CreateBoardModalProps = {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
};

export function CreateBoardModal({
  workspaceId,
  open,
  onClose,
}: CreateBoardModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [backgroundColor, setBackgroundColor] = useState<string>(DEFAULT_BOARD_COLOR);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isSubmitDisabled = useMemo(() => {
    return title.trim().length === 0 || isPending;
  }, [title, isPending]);

  function resetState() {
    setTitle("");
    setBackgroundColor(DEFAULT_BOARD_COLOR);
    setError("");
  }

  function handleClose() {
    if (isPending) {
      return;
    }

    resetState();
    onClose();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.currentTarget);
    formData.set("workspaceId", workspaceId);
    formData.set("title", title);
    formData.set("backgroundColor", backgroundColor);

    startTransition(async () => {
      const result = await createBoardAction(formData);

      if (!result.success) {
        setError(result.error);
        return;
      }

      resetState();
      onClose();
      router.push(`/boards/${result.boardId}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? handleClose() : null)}>
      <DialogContent className="w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>Create board</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="space-y-2">
            <Label htmlFor="boardTitle">Board title</Label>
            <Input
              id="boardTitle"
              name="title"
              value={title}
              placeholder="Q2 Planning"
              onChange={(event) => {
                setTitle(event.target.value);
                setError("");
              }}
              autoFocus
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Background</Label>
            <ColorPalette
              value={backgroundColor}
              onChange={(nextColor) => {
                setBackgroundColor(nextColor);
                setError("");
              }}
              disabled={isPending}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
