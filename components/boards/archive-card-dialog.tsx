"use client";

import { useTransition } from "react";

import { archiveCardAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ArchiveCardDialogProps = {
  cardId: string;
  cardTitle: string;
  /** Controlled by the caller — its trigger sets this true. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Surface a failed archive to the caller's existing error UI (called with
   *  "" first to clear a stale message, then the error string on failure). */
  onError?: (message: string) => void;
};

// Shared archive confirmation used by both the board card face (list-card-item)
// and the card-detail sheet — previously duplicated verbatim in both. Owns the
// archiveCardAction call and its pending transition; the caller owns the trigger
// (via open/onOpenChange) and where errors surface (via onError). A successful
// archive revalidates the board path, so the card drops off the board and the
// detail sheet closes on the next render — the dialog just closes itself here.
//
// Uses Dialog (not AlertDialog) on purpose: this confirmation is dismissible by
// clicking outside or pressing Escape. Radix AlertDialog hard-prevents
// outside-click dismissal, which we explicitly don't want here.
export function ArchiveCardDialog({
  cardId,
  cardTitle,
  open,
  onOpenChange,
  onError,
}: ArchiveCardDialogProps) {
  const [isArchiving, startArchiveTransition] = useTransition();

  function handleArchive() {
    onError?.("");
    const formData = new FormData();
    formData.set("cardId", cardId);

    startArchiveTransition(async () => {
      const result = await archiveCardAction(formData);
      if (!result.success) {
        onError?.(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let a click-away/Escape dismiss the dialog mid-request.
        if (isArchiving) {
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent role="alertdialog">
        <DialogHeader>
          <DialogTitle>Archive this card?</DialogTitle>
          <DialogDescription>
            &quot;{cardTitle}&quot; will be hidden from this board. You can restore
            it later from the board&apos;s Archived cards view.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isArchiving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleArchive}
            disabled={isArchiving}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isArchiving ? "Archiving..." : "Archive card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
