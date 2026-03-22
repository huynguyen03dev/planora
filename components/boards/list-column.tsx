"use client";

import { useRef, useState, useTransition } from "react";

import {
  updateListAction,
  deleteListAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { CardPlaceholder } from "@/components/boards/card-placeholder";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

type ListColumnProps = {
  list: {
    id: string;
    title: string;
    boardId: string;
  };
  canEdit: boolean;
  canDelete: boolean;
};

export function ListColumn({ list, canEdit, canDelete }: ListColumnProps) {
  const [draftTitle, setDraftTitle] = useState(list.title);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const skipBlurSaveRef = useRef(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  function startEditing() {
    skipBlurSaveRef.current = false;
    setDraftTitle(list.title);
    setError("");
    setEditing(true);
  }

  function handleSave() {
    if (!canEdit) {
      setEditing(false);
      return;
    }

    if (isPending) {
      return;
    }

    const nextTitle = draftTitle.trim();

    if (nextTitle === "") {
      setError("Title is required");
      setEditing(true);
      return;
    }

    if (nextTitle === list.title.trim()) {
      setError("");
      setEditing(false);
      setDraftTitle(list.title);
      return;
    }

    const formData = new FormData();
    formData.set("listId", list.id);
    formData.set("title", nextTitle);

    startTransition(async () => {
      const result = await updateListAction(formData);
      if (!result.success) {
        setError(result.error);
        setEditing(true);
        return;
      } else {
        setError("");
        setEditing(false);
      }
    });
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (skipBlurSaveRef.current) {
      skipBlurSaveRef.current = false;
      return;
    }

    const nextFocused = event.relatedTarget;
    if (nextFocused instanceof Node && actionsMenuRef.current?.contains(nextFocused)) {
      return;
    }

    handleSave();
  }

  function handleDelete() {
    const formData = new FormData();
    formData.set("listId", list.id);

    startDeleteTransition(async () => {
      const result = await deleteListAction(formData);
      if (!result.success) {
        setError(result.error);
      }
      setDeleteDialogOpen(false);
    });
  }

  return (
    <>
      <div className="flex w-80 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-3">
        <div className="flex items-center justify-between gap-2">
          {canEdit && editing ? (
            <Input
              value={draftTitle}
              onChange={(event) => {
                setDraftTitle(event.target.value);
                setError("");
              }}
              onBlur={handleBlur}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSave();
                }

                if (event.key === "Escape") {
                  skipBlurSaveRef.current = true;
                  setDraftTitle(list.title);
                  setError("");
                  setEditing(false);
                }
              }}
              autoFocus
              disabled={isPending}
              className="h-8 text-sm font-semibold"
            />
          ) : canEdit ? (
            <button
              type="button"
              onClick={startEditing}
              className="flex-1 truncate text-left text-sm font-semibold"
            >
              {list.title}
            </button>
          ) : (
            <h3 className="flex-1 truncate text-sm font-semibold">{list.title}</h3>
          )}

          {(canEdit || canDelete) && (
            <div ref={actionsMenuRef}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="List actions"
                    onPointerDown={() => {
                      if (editing) {
                        skipBlurSaveRef.current = true;
                      }
                    }}
                  >
                    <span className="text-base">⋯</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && (
                    <DropdownMenuItem onSelect={startEditing}>
                      Rename
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem
                      onSelect={() => setDeleteDialogOpen(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <div className="flex flex-col gap-2">
          <CardPlaceholder title="Sample card 1" />
          <CardPlaceholder title="Sample card 2" />
        </div>

        <Button type="button" variant="ghost" size="sm" className="justify-start">
          + Add a card
        </Button>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete list?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the list &quot;{list.title}&quot; and all its cards. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
