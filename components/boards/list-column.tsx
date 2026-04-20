"use client";

import { DragDropVerticalIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, useState, useTransition } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  createCardAction,
  updateListAction,
  deleteListAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { ListCardItem } from "@/components/boards/list-card-item";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ListColumnProps = {
  list: {
    id: string;
    title: string;
    boardId: string;
    cards: Array<{
      id: string;
      listId: string;
      title: string;
      position: number;
    }>;
  };
  canEdit: boolean;
  canDelete: boolean;
  canCreateCard: boolean;
  canEditCard: boolean;
  canArchiveCard: boolean;
  sortableId: string;
  canSortList: boolean;
  canSortCards: boolean;
  isListDropTarget: boolean;
  isCardDropTarget: boolean;
  cardDropIndicator: {
    cardId: string | null;
    placement: "before" | "after" | "end";
  } | null;
};

export function ListColumn({
  list,
  canEdit,
  canDelete,
  canCreateCard,
  canEditCard,
  canArchiveCard,
  sortableId,
  canSortList,
  canSortCards,
  isListDropTarget,
  isCardDropTarget,
  cardDropIndicator,
}: ListColumnProps) {
  const [newCardTitle, setNewCardTitle] = useState("");
  const [addCardExpanded, setAddCardExpanded] = useState(false);
  const [addCardError, setAddCardError] = useState("");
  const [isCreatingCard, startCreateCardTransition] = useTransition();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  const titleEditor = useInlineTitleEditor({
    initialTitle: list.title,
    canEdit,
    onSave: async (nextTitle) => {
      const formData = new FormData();
      formData.set("listId", list.id);
      formData.set("title", nextTitle);
      return updateListAction(formData);
    },
  });
  const {
    actionsMenuRef,
    draftTitle,
    editing,
    error,
    isPending,
    clearError,
    setError,
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
    id: sortableId,
    data: {
      type: "list",
      listId: list.id,
    },
    disabled: !canSortList || editing,
  });
  const listStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function shouldRenderBeforeIndicator(cardId: string): boolean {
    return (
      cardDropIndicator?.cardId === cardId &&
      cardDropIndicator.placement === "before"
    );
  }

  function shouldRenderAfterIndicator(cardId: string): boolean {
    return (
      cardDropIndicator?.cardId === cardId &&
      cardDropIndicator.placement === "after"
    );
  }

  function renderCardDropIndicator() {
    return (
      <div className="h-0 rounded-full border-t-2 border-primary/70 shadow-[0_0_0_1px_var(--color-background)]" />
    );
  }

  function handleDelete() {
    const formData = new FormData();
    formData.set("listId", list.id);

    startDeleteTransition(async () => {
      const result = await deleteListAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDeleteDialogOpen(false);
    });
  }

  function handleCreateCard(event: React.FormEvent) {
    event.preventDefault();

    if (!canCreateCard || isCreatingCard) {
      return;
    }

    const title = newCardTitle.trim();
    if (!title) {
      setAddCardError("Title is required");
      return;
    }

    const formData = new FormData();
    formData.set("listId", list.id);
    formData.set("title", title);

    startCreateCardTransition(async () => {
      const result = await createCardAction(formData);
      if (!result.success) {
        setAddCardError(result.error);
        return;
      }

      setNewCardTitle("");
      setAddCardError("");
      setAddCardExpanded(false);
    });
  }

  function handleCancelCreateCard() {
    setNewCardTitle("");
    setAddCardError("");
    setAddCardExpanded(false);
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={listStyle}
        className={cn(
          "flex w-80 shrink-0 flex-col gap-2 rounded-lg bg-muted p-3 transition",
          isDragging && "opacity-55 ring-2 ring-primary/30",
          isListDropTarget && !isDragging && "ring-2 ring-primary/40",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          {canEdit && editing ? (
            <Input
              value={draftTitle}
              onChange={(event) => {
                setDraftTitle(event.target.value);
                clearError();
              }}
              onBlur={handleBlur}
              onKeyDown={handleInputKeyDown}
              autoFocus
              disabled={isPending}
              className="h-8 text-sm font-semibold"
            />
          ) : canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={startEditing}
              className="h-auto flex-1 justify-start truncate p-0 text-left text-sm font-semibold hover:bg-transparent"
            >
              {list.title}
            </Button>
          ) : (
            <h3 className="flex-1 truncate text-sm font-semibold">{list.title}</h3>
          )}

          {(canEdit || canDelete) && (
            <div ref={actionsMenuRef}>
              <div className="flex items-center gap-1">
                {canSortList ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Drag list"
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={handleActionsMenuPointerDown}
                    {...dragAttributes}
                    {...dragListeners}
                  >
                    <HugeiconsIcon
                      icon={DragDropVerticalIcon}
                      size={16}
                      strokeWidth={2}
                      className="text-muted-foreground"
                    />
                  </Button>
                ) : null}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="List actions"
                      onPointerDown={handleActionsMenuPointerDown}
                    >
                      <HugeiconsIcon
                        icon={MoreHorizontalIcon}
                        size={16}
                        strokeWidth={2}
                        className="text-muted-foreground"
                      />
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
            </div>
          )}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <SortableContext
          items={list.cards.map((card) => toCardSortableId(card.id))}
          strategy={verticalListSortingStrategy}
        >
          <div
            className={cn(
              "rounded-md border border-transparent p-1 transition-colors",
              isCardDropTarget && "border-primary/40 bg-background/80",
            )}
          >
            {list.cards.length === 0 ? (
              <div className="flex flex-col gap-2">
                {cardDropIndicator?.placement === "end" ? renderCardDropIndicator() : null}
                <Card
                  size="sm"
                  className="gap-2 border-dashed border-border/60 py-3 shadow-none"
                >
                  <CardContent className="px-3 py-0">
                    <p className="text-xs text-muted-foreground">No cards yet</p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {list.cards.map((card) => (
                  <Fragment key={card.id}>
                    {shouldRenderBeforeIndicator(card.id)
                      ? renderCardDropIndicator()
                      : null}
                    <ListCardItem
                      card={{
                        id: card.id,
                        title: card.title,
                        listId: card.listId,
                      }}
                      canEdit={canEditCard}
                      canArchive={canArchiveCard}
                      canDrag={canSortCards}
                    />
                    {shouldRenderAfterIndicator(card.id)
                      ? renderCardDropIndicator()
                      : null}
                  </Fragment>
                ))}
                {cardDropIndicator?.placement === "end" ? renderCardDropIndicator() : null}
              </div>
            )}
          </div>
        </SortableContext>

        {canCreateCard ? (
          addCardExpanded ? (
            <form onSubmit={handleCreateCard} className="space-y-2">
              <Input
                value={newCardTitle}
                onChange={(event) => {
                  setNewCardTitle(event.target.value);
                  setAddCardError("");
                }}
                placeholder="Enter card title..."
                autoFocus
                disabled={isCreatingCard}
                className="h-8 text-sm"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    handleCancelCreateCard();
                  }
                }}
              />

              {addCardError ? (
                <p className="text-xs text-destructive">{addCardError}</p>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isCreatingCard || !newCardTitle.trim()}
                >
                  {isCreatingCard ? "Adding..." : "Add card"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelCreateCard}
                  disabled={isCreatingCard}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => setAddCardExpanded(true)}
            >
              + Add a card
            </Button>
          )
        ) : null}
      </div>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }
          setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete list?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the list &quot;{list.title}&quot; and all its cards. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
