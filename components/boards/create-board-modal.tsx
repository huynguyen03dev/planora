"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
  // Synchronous same-tick single-flight: `isPending` only flips on the next
  // render, so a double Enter (or Enter + click) in the same tick would create
  // the board twice. The ref guards immediately and releases on completion or
  // failure, so a retry after either always works.
  const submittingRef = useRef(false);

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
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setError("");

    const formData = new FormData(event.currentTarget);
    formData.set("workspaceId", workspaceId);
    formData.set("title", title);
    formData.set("backgroundColor", backgroundColor);

    startTransition(async () => {
      try {
        const result = await createBoardAction(formData);

        if (!result.success) {
          setError(result.error);
          return;
        }

        resetState();
        onClose();
        router.push(`/boards/${result.boardId}`);
        router.refresh();
      } catch {
        // A thrown/rejected action (network blip, unexpected server failure)
        // surfaces a generic actionable error instead of an unhandled
        // rejection; the guard still releases so a retry always works.
        setError("Something went wrong. Please try again.");
      } finally {
        submittingRef.current = false;
      }
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
