"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteBoardAction } from "@/app/(authenticated)/(dashboard)/boards/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

type DeleteBoardDialogProps = {
  boardId: string;
  boardTitle: string;
  open: boolean;
  onClose: () => void;
};

export function DeleteBoardDialog({
  boardId,
  boardTitle,
  open,
  onClose,
}: DeleteBoardDialogProps) {
  const router = useRouter();
  const [toastMessage, setToastMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage("");
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  function handleDelete() {
    setToastMessage("");

    startTransition(async () => {
      const result = await deleteBoardAction(boardId);

      if (!result.success) {
        setToastMessage(result.error);
        return;
      }

      setToastMessage("");
      onClose();
      router.push("/boards");
      router.refresh();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setToastMessage("");
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive &quot;{boardTitle}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will archive the board and hide it from active views.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel className={buttonVariants({ variant: "outline" })} disabled={isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={(event) => {
              event.preventDefault();
              handleDelete();
            }}
            disabled={isPending}
          >
            {isPending ? "Archiving..." : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>

      {toastMessage ? (
        <div className="fixed right-4 top-4 z-[60] rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-md">
          {toastMessage}
        </div>
      ) : null}
    </AlertDialog>
  );
}
