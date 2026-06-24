"use client";

import { DragDropVerticalIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useState, useTransition } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";

import {
  createCardAction,
  updateListAction,
  updateListIsDoneAction,
  deleteListAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";
import { ListCardItem } from "@/components/boards/list-card-item";
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cardMatchesFilter } from "@/lib/board-filter";
import { cn } from "@/lib/utils";

type ListColumnProps = {
  list: {
    id: string;
    title: string;
    boardId: string;
    isDone: boolean;
    cards: Array<{
      id: string;
      listId: string;
      title: string;
      position: number;
      labels: Array<{ id: string; name: string; color: string }>;
    }>;
  };
  index: number;
  canEdit: boolean;
  canDelete: boolean;
  canCreateCard: boolean;
  canEditCard: boolean;
  canArchiveCard: boolean;
  canSortList: boolean;
  canSortCards: boolean;
  onOpenCard: (cardId: string) => void;
};

function ListColumnComponent({
  list,
  index,
  canEdit,
  canDelete,
  canCreateCard,
  canEditCard,
  canArchiveCard,
  canSortList,
  canSortCards,
  onOpenCard,
}: ListColumnProps) {
  // Client-only label filter. Cards are HIDDEN (not removed) when they don't
  // match, so @hello-pangea/dnd's index space stays aligned with the store's
  // `cards` array and drop positions are never corrupted (see lib/dnd/apply-drop).
  const filterLabelIds = useBoardStore((s) => s.filterLabelIds);
  const filter = { labelIds: filterLabelIds };
  const filterActive = filterLabelIds.length > 0;
  const visibleCount = filterActive
    ? list.cards.filter((card) => cardMatchesFilter(card, filter)).length
    : list.cards.length;

  const [newCardTitle, setNewCardTitle] = useState("");
  const [addCardExpanded, setAddCardExpanded] = useState(false);
  const [addCardError, setAddCardError] = useState("");
  const [isCreatingCard, startCreateCardTransition] = useTransition();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isUpdatingDone, startDoneTransition] = useTransition();

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

  function handleToggleDoneList(nextIsDone: boolean) {
    const formData = new FormData();
    formData.set("listId", list.id);
    formData.set("isDone", String(nextIsDone));

    startDoneTransition(async () => {
      const result = await updateListIsDoneAction(formData);
      if (!result.success) {
        setError(result.error);
      }
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
      <Draggable
        draggableId={list.id}
        index={index}
        isDragDisabled={!canSortList || editing}
        disableInteractiveElementBlocking
      >
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            style={provided.draggableProps.style}
            className={cn(
              "flex w-80 shrink-0 flex-col gap-2 rounded-lg bg-muted p-3",
              snapshot.isDragging && "shadow-xl ring-2 ring-primary/30",
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
              {list.isDone ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Done
                </span>
              ) : null}

              {(canEdit || canDelete) && (
                <div ref={actionsMenuRef}>
                  <div className="flex items-center gap-1">
                    {canSortList ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Drag list"
                        className="cursor-grab text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                        onPointerDown={handleActionsMenuPointerDown}
                        {...provided.dragHandleProps}
                      >
                        <HugeiconsIcon
                          icon={DragDropVerticalIcon}
                          size={16}
                          strokeWidth={2}
                          className="text-current transition-colors"
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
                          className="text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <HugeiconsIcon
                            icon={MoreHorizontalIcon}
                            size={16}
                            strokeWidth={2}
                            className="text-current transition-colors"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && (
                          <DropdownMenuItem onSelect={startEditing}>
                            Rename
                          </DropdownMenuItem>
                        )}
                        {canEdit && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem
                              checked={list.isDone}
                              disabled={isUpdatingDone}
                              onCheckedChange={handleToggleDoneList}
                            >
                              Done list
                            </DropdownMenuCheckboxItem>
                          </>
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

            <Droppable droppableId={list.id} type="card" isDropDisabled={!canSortCards}>
              {(dropProvided, dropSnapshot) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  className={cn(
                    "min-h-[2.5rem] rounded-md border border-transparent p-1 transition-colors",
                    dropSnapshot.isDraggingOver
                      ? "border-primary/40 bg-background/80"
                      : "hover:bg-muted/30",
                  )}
                >
                  {list.cards.length === 0 && !dropSnapshot.isDraggingOver ? (
                    <Card
                      size="sm"
                      className="gap-2 border-dashed border-border/60 py-3 shadow-none"
                    >
                      <CardContent className="px-3 py-0">
                        <p className="text-xs text-muted-foreground">No cards yet</p>
                      </CardContent>
                    </Card>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    {list.cards.map((card, cardIndex) => (
                      <ListCardItem
                        key={card.id}
                        card={card}
                        index={cardIndex}
                        canEdit={canEditCard}
                        canArchive={canArchiveCard}
                        canDrag={canSortCards}
                        hidden={filterActive && !cardMatchesFilter(card, filter)}
                        onOpenCard={onOpenCard}
                      />
                    ))}
                  </div>
                  {filterActive && list.cards.length > 0 && visibleCount === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      No cards match the filter
                    </p>
                  ) : null}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>

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
                  className="justify-start text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setAddCardExpanded(true)}
                >
                  + Add a card
                </Button>
              )
            ) : null}
          </div>
        )}
      </Draggable>

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

// Memoized: each drag tick re-renders BoardContent, which would otherwise
// re-render every column. With apply-drop preserving untouched-list references
// and a stable `onOpenCard`, only the source/destination columns re-render on a
// drop; the rest skip.
export const ListColumn = memo(ListColumnComponent);
