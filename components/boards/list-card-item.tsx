"use client";

import { useState, useTransition } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  archiveCardAction,
  updateCardAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { toCardSortableId } from "@/components/boards/board-dnd-types";
import { useInlineTitleEditor } from "@/components/boards/use-inline-title-editor";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

type ListCardItemProps = {
  card: {
    id: string;
    title: string;
    listId: string;
  };
  canEdit: boolean;
  canArchive: boolean;
  canDrag: boolean;
};

export function ListCardItem({
  card,
  canEdit,
  canArchive,
  canDrag,
}: ListCardItemProps) {
  const [error, setError] = useState("");

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [isArchiving, startArchiveTransition] = useTransition();

  const titleEditor = useInlineTitleEditor({
    initialTitle: card.title,
    canEdit,
    onSave: async (nextTitle) => {
      const formData = new FormData();
      formData.set("cardId", card.id);
      formData.set("title", nextTitle);
      return updateCardAction(formData);
    },
  });
  const {
    actionsMenuRef,
    draftTitle,
    editing,
    error: editError,
    isPending,
    clearError,
    setDraftTitle,
    startEditing,
    handleBlur,
    handleInputKeyDown,
    handleActionsMenuPointerDown,
  } = titleEditor;
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: toCardSortableId(card.id),
    data: {
      type: "card",
      cardId: card.id,
      listId: card.listId,
    },
    disabled: !canDrag || editing,
  });
  const cardStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  function handleArchive() {
    const formData = new FormData();
    formData.set("cardId", card.id);

    startArchiveTransition(async () => {
      const result = await archiveCardAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setArchiveDialogOpen(false);
    });
  }

  return (
    <>
      <div ref={setNodeRef} style={cardStyle}>
        <Card size="sm" className="gap-2 py-3 shadow-sm">
          <CardContent className="space-y-2 px-3">
          <div className="flex items-start justify-between gap-2">
            {canEdit && editing ? (
              <Input
                value={draftTitle}
                onChange={(event) => {
                  setDraftTitle(event.target.value);
                  clearError();
                  setError("");
                }}
                onBlur={handleBlur}
                onKeyDown={handleInputKeyDown}
                autoFocus
                disabled={isPending}
                className="h-8 text-sm"
              />
            ) : canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={startEditing}
                className="h-auto flex-1 justify-start p-0 text-left text-sm font-normal hover:bg-transparent"
              >
                {card.title}
              </Button>
            ) : (
              <p className="flex-1 text-sm">{card.title}</p>
            )}

            {(canEdit || canArchive) && (
              <div ref={actionsMenuRef}>
                <div className="flex items-center gap-1">
                  {canDrag ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Drag card"
                      className="cursor-grab active:cursor-grabbing"
                      onPointerDown={handleActionsMenuPointerDown}
                      {...dragAttributes}
                      {...dragListeners}
                    >
                      <span className="text-base leading-none">⋮⋮</span>
                    </Button>
                  ) : null}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Card actions"
                        onPointerDown={handleActionsMenuPointerDown}
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
                      {canArchive && (
                        <DropdownMenuItem
                          onSelect={() => setArchiveDialogOpen(true)}
                          className="text-destructive focus:text-destructive"
                        >
                          Archive
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
          </div>

          {editError ? <p className="text-xs text-destructive">{editError}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={archiveDialogOpen}
        onOpenChange={(open) => {
          if (isArchiving) {
            return;
          }
          setArchiveDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this card?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{card.title}&quot; will be hidden from this board. This action
              cannot be undone in the app yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleArchive();
              }}
              disabled={isArchiving}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isArchiving ? "Archiving..." : "Archive card"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
