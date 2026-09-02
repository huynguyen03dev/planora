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
import { useClickOutside } from "@/components/boards/use-click-outside";
import { useInlineTitleEditor } from "@/components/boards/use-inline-title-editor";
import { useUndo } from "@/components/undo/undo-snackbar";
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
  const { offerUndo } = useUndo();

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
    cancelEditing,
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
      // US-083 W8: list archive is the second of exactly two undo offer points
      // (decision 0031). deleteListAction is the legacy alias for the soft
      // archive (US-074 Slice A) — eligibility follows this intended archive UI
      // call site, not the action's name.
      offerUndo({ kind: "list", id: list.id, label: list.title });
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

  const addCardOutsideProps = useClickOutside(
    addCardExpanded,
    handleCancelCreateCard,
  );

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
              // Fluid on phones (~80vw so the next list peeks → signals horizontal
              // scroll), capped at and reverting to the 20rem desktop width at sm:.
              // Width is the only responsive change — the dnd index space and
              // apply-drop math are untouched.
              // max-h-full caps the column at the board height so the card area
              // (below) scrolls internally instead of growing the page; short
              // lists stay compact (the column sizes to its content under the cap).
              // mr-4 (not a parent flex `gap`) is the inter-list spacing, so
              // @hello-pangea/dnd's horizontal placeholder reserves it and the
              // row doesn't shift when a list is lifted/dropped. The gap-2 here
              // is unrelated: it's this column's internal vertical rhythm.
              "mr-4 flex max-h-full min-h-0 w-[80vw] max-w-80 shrink-0 flex-col gap-2 rounded-lg bg-muted p-3 transition-[box-shadow] duration-150 ease-out motion-reduce:transition-none sm:w-80 sm:max-w-none",
              // transition-[box-shadow] only — NOT transform: @hello-pangea/dnd
              // writes a continuous transform onto this div during a drag, so
              // animating transform would lag/jitter the dragged column. The drag
              // shadow + ring (both box-shadows) still fade in/out smoothly.
              snapshot.isDragging && "shadow-md ring-2 ring-primary/30",
            )}
          >
            {/* Whole-header drag (US-069): the header bar IS the list drag handle.
                The actions menu button sits OUTSIDE the handle because dnd's
                window-bound keyboard sensor would otherwise resolve a Space press
                on the focused button to the handle (lifting the list instead of
                opening the menu) — not fixable with stopPropagation since the
                sensor runs on window in the capture phase. The Draggable keeps
                `disableInteractiveElementBlocking` so a drag still starts over the
                title button while a plain click enters inline rename (dnd's
                movement threshold disambiguates). `dragHandleProps` is null while
                editing or when the user can't sort, so spreading is safe. */}
            <div className="flex shrink-0 items-center justify-between gap-2">
              <div
                {...provided.dragHandleProps}
                // dnd stamps role="button" on the handle; without an explicit
                // label it would borrow the title text as its accessible name and
                // collide with the title button. Name it for what it does.
                aria-label={
                  provided.dragHandleProps ? `Reorder list ${list.title}` : undefined
                }
                className={cn(
                  "flex min-w-0 flex-1 items-center",
                  // No resting grab cursor on the header: like the card, a
                  // hovering grab cursor over the whole header bar misreads before
                  // a drag starts. Grabbing appears only on mousedown (active:).
                  // The title button and actions menu keep their own cursors.
                  canSortList && !editing && "active:cursor-grabbing",
                )}
              >
                {canEdit && editing ? (
                  <Input
                    aria-label="List title"
                    aria-invalid={Boolean(error)}
                    aria-describedby={
                      error ? `list-title-error-${list.id}` : undefined
                    }
                    value={draftTitle}
                    onChange={(event) => {
                      setDraftTitle(event.target.value);
                      clearError();
                    }}
                    onBlur={handleBlur}
                    onKeyDown={handleInputKeyDown}
                    autoFocus
                    disabled={isPending}
                    className="h-8 w-full text-sm font-semibold"
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
              </div>

              {(canEdit || canDelete) && (
                <div ref={actionsMenuRef}>
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
                        >
                          Archive list
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            {error ? (
              <p
                id={`list-title-error-${list.id}`}
                role="alert"
                className="text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}

            {canEdit && editing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onPointerDown={handleActionsMenuPointerDown}
                onClick={cancelEditing}
                className="self-start text-muted-foreground"
              >
                Cancel
              </Button>
            ) : null}

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
                    // droppable a real, non-collapsed drop target even when empty
                    // — without a child element in the list, @hello-pangea/dnd
                    // can't move a card into it (esp. via keyboard). (fbf98f7
                    // dropped the "No cards yet" child and collapsed the zone,
                    // which broke dragging a card into an empty list.)
                    "themed-scrollbar min-h-0 overflow-y-auto rounded-md border border-transparent p-1 transition-colors",
                    dropSnapshot.isDraggingOver
                      ? "border-primary/40 bg-background/80"
                      : "hover:bg-muted/30",
                  )}
                >
                  {/* No flex `gap` between cards: @hello-pangea/dnd sizes its drop
                      placeholder from the dragged card's box (margins included)
                      but NOT from the parent's flex gap, so lifting a card would
                      remove a gap the placeholder never replaced and the column
                      would shrink ~8px on lift, shoving the neighbor back on
                      drop. Spacing lives as mb-2 on each card (see
                      list-card-item.tsx), which the placeholder mirrors, so the
                      column height stays put through a drag. */}
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
                <form {...addCardOutsideProps} onSubmit={handleCreateCard} className="shrink-0 space-y-2">
                  <Input
                    aria-label="Card title"
                    aria-invalid={Boolean(addCardError)}
                    aria-describedby={
                      addCardError ? `add-card-error-${list.id}` : undefined
                    }
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
                    <p
                      id={`add-card-error-${list.id}`}
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      {addCardError}
                    </p>
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
            <AlertDialogTitle>Archive list?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the list &quot;{list.title}&quot; and hide it from the active board. The list and its cards remain intact.
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
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? "Archiving..." : "Archive list"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Memoized: each drag tick re-renders BoardContent; with apply-drop preserving
// untouched-list references and a stable `onOpenCard`, only the source/destination
// columns re-render on a drop; the rest skip.
export const ListColumn = memo(ListColumnComponent);
