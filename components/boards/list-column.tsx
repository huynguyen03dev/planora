"use client";

import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useState, useTransition } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";

import {
  createCardAction,
  updateListAction,
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  cardMatchesAllDimensions,
  cardMatchesQuery,
  isFilterActive,
  isSearchActive,
  type CardFilter,
} from "@/lib/board-filter";
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
      coverImage: string | null;
      priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
      dueDate: Date | null;
      completedAt: Date | null;
      updatedAt: Date;
      labels: Array<{ id: string; name: string; color: string }>;
      members: Array<{ id: string; name: string; image: string | null }>;
      memberCount: number;
      checklistDone: number;
      checklistTotal: number;
      commentCount: number;
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
  // Client-only Trello-style filter + title search (US-065). Cards are HIDDEN
  // (not removed) when they don't match, so @hello-pangea/dnd's index space stays
  // aligned with the store's `cards` array and drop positions are never corrupted
  // (see lib/dnd/apply-drop). Within a dimension options OR; across dimensions
  // they AND. An active keyword SUSPENDS the dimensions and governs visibility on
  // its own (matched on the title alone) — that rule is enforced here.
  const searchQuery = useBoardStore((s) => s.searchQuery);
  const currentUserId = useBoardStore((s) => s.currentUserId);
  const filterLabelIds = useBoardStore((s) => s.filterLabelIds);
  const filterMemberIds = useBoardStore((s) => s.filterMemberIds);
  const filterNoMembers = useBoardStore((s) => s.filterNoMembers);
  const filterAssignedToMe = useBoardStore((s) => s.filterAssignedToMe);
  const filterStatuses = useBoardStore((s) => s.filterStatuses);
  const filterDueBuckets = useBoardStore((s) => s.filterDueBuckets);
  const filterActivityWindows = useBoardStore((s) => s.filterActivityWindows);

  const filter: CardFilter = {
    labelIds: filterLabelIds,
    memberIds: filterMemberIds,
    noMembers: filterNoMembers,
    assignedToMe: filterAssignedToMe,
    statuses: filterStatuses,
    dueBuckets: filterDueBuckets,
    activityWindows: filterActivityWindows,
  };
  const searchActive = isSearchActive(searchQuery);
  const narrowing = searchActive || isFilterActive(filter);
  // A single `now` per render keeps the relative due/activity math consistent
  // across every card in the list.
  const now = new Date();
  const isCardVisible = (card: ListColumnProps["list"]["cards"][number]) => {
    if (searchActive) {
      return cardMatchesQuery(card, searchQuery);
    }
    return cardMatchesAllDimensions(
      {
        labels: card.labels,
        memberIds: card.members.map((member) => member.id),
        completedAt: card.completedAt,
        dueDate: card.dueDate,
        updatedAt: card.updatedAt,
      },
      filter,
      now,
      currentUserId,
    );
  };
  const visibleCount = narrowing
    ? list.cards.filter(isCardVisible).length
    : list.cards.length;

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
              // Fluid on phones (~80vw so the next list peeks → signals
              // horizontal scroll), capped at and reverting to the 20rem desktop
              // width at sm:. Width is the only responsive change — the dnd index
              // space and apply-drop math are untouched.
              // max-h-full caps the column at the board height so the card area
              // (below) scrolls internally instead of growing the page; short
              // lists stay compact (the column sizes to its content under the cap).
              // mr-4 (not a parent flex `gap`) is the inter-list spacing, so
              // @hello-pangea/dnd's horizontal placeholder reserves it and the
              // row doesn't shift when a list is lifted/dropped. The gap-2 here
              // is unrelated: it's this column's internal vertical rhythm.
              "mr-4 flex max-h-full min-h-0 w-[80vw] max-w-80 shrink-0 flex-col gap-2 rounded-lg bg-muted p-3 sm:w-80 sm:max-w-none",
              snapshot.isDragging && "shadow-md ring-2 ring-primary/30",
            )}
          >
            {/* Whole-header drag (US-069): the header bar IS the list drag
                handle — no separate grip. We keep the Draggable's
                `disableInteractiveElementBlocking` (above) so a drag can
                start anywhere on the header *including over the title button*,
                while a plain click still enters inline rename (dnd's movement
                threshold disambiguates). `dragHandleProps` is null while editing
                or when the user can't sort, so spreading it is safe. */}
            <div
              {...provided.dragHandleProps}
              // dnd stamps role="button" on the handle; without an explicit
              // label it would borrow the title text as its accessible name and
              // collide with the title button. Name it for what it does.
              aria-label={
                provided.dragHandleProps ? `Reorder list ${list.title}` : undefined
              }
              className={cn(
                "flex shrink-0 items-center justify-between gap-2",
                canSortList && !editing && "cursor-grab active:cursor-grabbing",
              )}
            >
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="List actions"
                          onPointerDown={handleActionsMenuPointerDown}
                          className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
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
                        {canEdit && canDelete && <DropdownMenuSeparator />}
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
                    // The single vertical scroller: shrinks (min-h-0) within the
                    // capped column and scrolls its own cards when they overflow.
                    // themed-scrollbar keeps the native scrollbar on-theme.
                    // A permanent min-h + an empty-state child (below) keep the
                    // droppable a real, non-collapsed drop target even when empty —
                    // without a child element in the list, @hello-pangea/dnd can't
                    // move a card into it (esp. via keyboard). (fbf98f7 dropped the
                    // "No cards yet" child and collapsed the zone, which broke
                    // dragging a card into an empty list.)
                    "themed-scrollbar min-h-0 overflow-y-auto rounded-md border border-transparent p-1 transition-colors",
                    dropSnapshot.isDraggingOver
                      ? "border-primary/40 bg-background/80"
                      : "hover:bg-muted/30",
                  )}
                >
                  {/* No flex `gap` between cards: @hello-pangea/dnd sizes its
                      drop placeholder from the dragged card's box (margins
                      included) but NOT from the parent's flex gap. With gap,
                      lifting a card removed one gap the placeholder never
                      replaced, so the column shrank ~8px on lift and shoved the
                      neighbor back on drop. Spacing now lives as mb-2 on each
                      card (see list-card-item.tsx), which the placeholder
                      mirrors, so the column height stays put through a drag. */}
                  <div className="flex flex-col">
                    {list.cards.map((card, cardIndex) => (
                      <ListCardItem
                        key={card.id}
                        card={card}
                        index={cardIndex}
                        canEdit={canEditCard}
                        canArchive={canArchiveCard}
                        canDrag={canSortCards}
                        hidden={narrowing && !isCardVisible(card)}
                        onOpenCard={onOpenCard}
                      />
                    ))}
                  </div>
                  {list.cards.length === 0 && !dropSnapshot.isDraggingOver ? (
                    // "No cards yet" is not just a hint: an empty list needs a sized
                    // child inside the droppable so a card can be dropped into it
                    // (without it the collapsed droppable is not a drop target).
                    // (fbf98f7 removed this, which broke dragging into an empty list.)
                    <p className="px-2 py-1.5 text-xs text-muted-foreground/70">
                      No cards yet
                    </p>
                  ) : null}
                  {narrowing && list.cards.length > 0 && visibleCount === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      No cards match
                    </p>
                  ) : null}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>

            {canCreateCard ? (
              addCardExpanded ? (
                <form onSubmit={handleCreateCard} className="shrink-0 space-y-2">
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
                  className="shrink-0 justify-start text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
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
