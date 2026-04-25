"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type CollisionDetection,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import {
  moveCardAction,
  reorderCardAction,
  reorderListAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import {
  parseSortableId,
  toCardSortableId,
  toListSortableId,
} from "@/components/boards/board-dnd-types";
import { AddListButton } from "@/components/boards/add-list-button";
import { ListColumn } from "@/components/boards/list-column";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type BoardContentProps = {
  boardId: string;
  lists: Array<{
    id: string;
    title: string;
    boardId: string;
    cards: Array<{
      id: string;
      listId: string;
      title: string;
      position: number;
    }>;
  }>;
  canEdit: boolean;
  canDelete: boolean;
  canCreateList: boolean;
  canCreateCard: boolean;
  canEditCard: boolean;
  canArchiveCard: boolean;
};

export function BoardContent({
  boardId,
  lists,
  canEdit,
  canDelete,
  canCreateList,
  canCreateCard,
  canEditCard,
  canArchiveCard,
}: BoardContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [boardLists, setBoardLists] = useState(lists);
  const [error, setError] = useState("");
  const [activeDrag, setActiveDrag] = useState<{
    kind: "list" | "card";
    id: string;
  } | null>(null);
  const [listDropTargetId, setListDropTargetId] = useState<string | null>(null);
  const [cardDropIndicator, setCardDropIndicator] = useState<{
    listId: string;
    cardId: string | null;
    placement: "before" | "after" | "end";
  } | null>(null);
  const [isPersisting, startPersistTransition] = useTransition();
  const snapshotRef = useRef<typeof lists | null>(null);
  const lastOverId = useRef<string | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  useEffect(() => {
    setBoardLists(lists);
  }, [lists]);

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [boardLists]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const listItems = useMemo(
    () => boardLists.map((list) => toListSortableId(list.id)),
    [boardLists],
  );

  function openCard(cardId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cardId", cardId);

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      const activeParsed = parseSortableId(String(args.active.id));

      // --- List dragging: filter to list-only containers ---
      if (activeParsed.kind === "list") {
        const listOnlyContainers = args.droppableContainers.filter((container) => {
          return parseSortableId(String(container.id)).kind === "list";
        });

        const pointerCollisions = pointerWithin({
          ...args,
          droppableContainers: listOnlyContainers,
        });
        if (pointerCollisions.length > 0) return pointerCollisions;

        return closestCorners({
          ...args,
          droppableContainers: listOnlyContainers,
        });
      }

      // --- Card dragging: official multi-container pattern ---
      const pointerIntersections = pointerWithin(args);
      const intersections =
        pointerIntersections.length > 0
          ? pointerIntersections
          : rectIntersection(args);

      let overId = getFirstCollision(intersections, "id");

      if (overId != null) {
        const overParsed = parseSortableId(String(overId));

        if (overParsed.kind === "list" && overParsed.id) {
          const list = boardLists.find((l) => l.id === overParsed.id);

          if (list && list.cards.length > 0) {
            const cardIds = list.cards.map((c) => toCardSortableId(c.id));
            const closest = closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter((c) =>
                cardIds.includes(String(c.id)),
              ),
            })[0]?.id;

            if (closest) {
              overId = closest;
            }
          }
        }

        lastOverId.current = String(overId);
        return [{ id: overId }];
      }

      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = String(args.active.id);
      }

      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [boardLists],
  );

  function findCardLocation(
    sourceLists: typeof boardLists,
    cardId: string,
  ): { listIndex: number; cardIndex: number } | null {
    for (let listIndex = 0; listIndex < sourceLists.length; listIndex += 1) {
      const cardIndex = sourceLists[listIndex].cards.findIndex((card) => card.id === cardId);
      if (cardIndex !== -1) {
        return { listIndex, cardIndex };
      }
    }
    return null;
  }

  function resolveListDropTargetId(
    sourceLists: typeof boardLists,
    overParsed: { kind: "list" | "card" | null; id: string | null } | null,
  ): string | null {
    if (!overParsed?.kind || !overParsed.id) {
      return null;
    }

    if (overParsed.kind === "list") {
      return overParsed.id;
    }

    const overLocation = findCardLocation(sourceLists, overParsed.id);
    if (!overLocation) {
      return null;
    }

    return sourceLists[overLocation.listIndex].id;
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    const parsed = parseSortableId(activeId);
    if (!parsed.kind || !parsed.id) {
      return;
    }

    if (parsed.kind === "list" && !canEdit) {
      return;
    }

    if (parsed.kind === "card" && !canEditCard) {
      return;
    }

    snapshotRef.current = boardLists;
    lastOverId.current = null;
    recentlyMovedToNewContainer.current = false;
    setActiveDrag({
      kind: parsed.kind,
      id: parsed.id,
    });
  }

  function clearDragVisuals() {
    setActiveDrag(null);
    setListDropTargetId(null);
    setCardDropIndicator(null);
  }

  function restoreSnapshot() {
    if (snapshotRef.current) {
      setBoardLists(snapshotRef.current);
    }
  }

  function finalizeDrag() {
    snapshotRef.current = null;
    clearDragVisuals();
  }

  function handleDragCancel() {
    restoreSnapshot();
    finalizeDrag();
    lastOverId.current = null;
    recentlyMovedToNewContainer.current = false;
  }

  function abortDrag() {
    restoreSnapshot();
    finalizeDrag();
    lastOverId.current = null;
    recentlyMovedToNewContainer.current = false;
  }

  function handleDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const activeParsed = parseSortableId(activeId);
    const overParsed = overId ? parseSortableId(overId) : null;

    if (!activeParsed.kind || !activeParsed.id || !overParsed?.kind || !overParsed.id) {
      setListDropTargetId(null);
      setCardDropIndicator(null);
      return;
    }

    if (activeParsed.kind === "list") {
      setCardDropIndicator(null);

      const targetListId = resolveListDropTargetId(boardLists, overParsed);
      setListDropTargetId(targetListId);

      if (!targetListId) {
        return;
      }

      const activeIndex = boardLists.findIndex((list) => list.id === activeParsed.id);
      const targetIndex = boardLists.findIndex((list) => list.id === targetListId);

      if (activeIndex === -1 || targetIndex === -1 || activeIndex === targetIndex) {
        return;
      }

      setBoardLists(arrayMove(boardLists, activeIndex, targetIndex));
      return;
    }

    const sourceLocation = findCardLocation(boardLists, activeParsed.id);
    if (!sourceLocation) {
      setCardDropIndicator(null);
      setListDropTargetId(null);
      return;
    }

    let targetListId: string | null = null;
    let targetListIndex = -1;
    let targetCardIndex = -1;
    let nextIndicator: {
      listId: string;
      cardId: string | null;
      placement: "before" | "after" | "end";
    } | null = null;

    if (overParsed.kind === "list") {
      targetListId = overParsed.id;
      targetListIndex = boardLists.findIndex((list) => list.id === overParsed.id);
      if (targetListIndex === -1) {
        setCardDropIndicator(null);
        setListDropTargetId(null);
        return;
      }

      targetCardIndex = boardLists[targetListIndex].cards.length;
      nextIndicator = {
        listId: overParsed.id,
        cardId: null,
        placement: "end",
      };
    } else {
      const overLocation = findCardLocation(boardLists, overParsed.id);
      if (!overLocation) {
        setCardDropIndicator(null);
        setListDropTargetId(null);
        return;
      }

      targetListId = boardLists[overLocation.listIndex].id;
      targetListIndex = overLocation.listIndex;

      if (overParsed.id === activeParsed.id) {
        setCardDropIndicator(null);
        setListDropTargetId(targetListId);
        return;
      }

      const overRect = event.over?.rect;
      if (!overRect) {
        setCardDropIndicator(null);
        setListDropTargetId(null);
        return;
      }

      const keyboardDrag = event.activatorEvent instanceof KeyboardEvent;
      let placement: "before" | "after" = "before";

      if (keyboardDrag) {
        const sameList = sourceLocation.listIndex === overLocation.listIndex;
        if (sameList) {
          placement =
            sourceLocation.cardIndex < overLocation.cardIndex ? "after" : "before";
        } else if (event.delta.y > 0) {
          placement = "after";
        }
      } else {
        const activeRect =
          event.active.rect.current.translated ?? event.active.rect.current.initial;
        const activeCenterY = activeRect
          ? activeRect.top + activeRect.height / 2
          : overRect.top;
        const overMidpoint = overRect.top + overRect.height / 2;
        placement = activeCenterY > overMidpoint ? "after" : "before";
      }

      targetCardIndex = overLocation.cardIndex + (placement === "after" ? 1 : 0);
      nextIndicator = {
        listId: targetListId,
        cardId: overParsed.id,
        placement,
      };
    }

    if (!targetListId || targetListIndex === -1 || targetCardIndex === -1) {
      setCardDropIndicator(null);
      setListDropTargetId(null);
      return;
    }

    setListDropTargetId(targetListId);
    setCardDropIndicator(nextIndicator);

    const nextLists = boardLists.map((list) => ({
      ...list,
      cards: [...list.cards],
    }));

    const [movedCard] = nextLists[sourceLocation.listIndex].cards.splice(
      sourceLocation.cardIndex,
      1,
    );

    if (!movedCard) {
      return;
    }

    const adjustedTargetIndex =
      sourceLocation.listIndex === targetListIndex &&
      sourceLocation.cardIndex < targetCardIndex
        ? targetCardIndex - 1
        : targetCardIndex;

    if (
      sourceLocation.listIndex === targetListIndex &&
      sourceLocation.cardIndex === adjustedTargetIndex
    ) {
      return;
    }

    nextLists[targetListIndex].cards.splice(adjustedTargetIndex, 0, {
      ...movedCard,
      listId: nextLists[targetListIndex].id,
    });

    if (sourceLocation.listIndex !== targetListIndex) {
      recentlyMovedToNewContainer.current = true;
    }

    setBoardLists(nextLists);
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const activeParsed = parseSortableId(activeId);
    const overParsed = overId ? parseSortableId(overId) : null;

    if (!activeParsed.kind || !activeParsed.id || !overParsed?.kind || !overParsed.id) {
      abortDrag();
      return;
    }

    if (activeParsed.kind === "list") {
      const overListId = resolveListDropTargetId(boardLists, overParsed);
      if (!canEdit || !overListId) {
        abortDrag();
        return;
      }

      const initialLists = snapshotRef.current;
      const initialIndex = initialLists
        ? initialLists.findIndex((list) => list.id === activeParsed.id)
        : -1;

      let nextLists = boardLists;
      const activeIndex = boardLists.findIndex((list) => list.id === activeParsed.id);
      const overIndex = boardLists.findIndex((list) => list.id === overListId);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        nextLists = arrayMove(boardLists, activeIndex, overIndex);
        setBoardLists(nextLists);
      }

      const finalIndex = nextLists.findIndex((list) => list.id === activeParsed.id);
      clearDragVisuals();

      if (initialIndex === -1 || finalIndex === -1 || initialIndex === finalIndex) {
        snapshotRef.current = null;
        return;
      }

      const movedIndex = nextLists.findIndex((list) => list.id === activeParsed.id);
      const prevListId = movedIndex > 0 ? nextLists[movedIndex - 1].id : null;
      const nextListId =
        movedIndex < nextLists.length - 1 ? nextLists[movedIndex + 1].id : null;

      const formData = new FormData();
      formData.set("listId", activeParsed.id);
      if (prevListId) {
        formData.set("prevListId", prevListId);
      }
      if (nextListId) {
        formData.set("nextListId", nextListId);
      }

      startPersistTransition(async () => {
        const result = await reorderListAction(formData);
        if (!result.success) {
          restoreSnapshot();
          setError(result.error);
          snapshotRef.current = null;
          return;
        }

        setError("");
        snapshotRef.current = null;
      });
      return;
    }

    if (!canEditCard) {
      abortDrag();
      return;
    }

    const finalLocation = findCardLocation(boardLists, activeParsed.id);
    if (!finalLocation) {
      abortDrag();
      return;
    }

    const initialLists = snapshotRef.current;
    const initialLocation = initialLists
      ? findCardLocation(initialLists, activeParsed.id)
      : null;

    clearDragVisuals();
    lastOverId.current = null;
    recentlyMovedToNewContainer.current = false;

    const sourceList = initialLocation ? initialLists?.[initialLocation.listIndex] ?? null : null;
    const targetList = boardLists[finalLocation.listIndex] ?? null;
    if (!sourceList || !targetList) {
      abortDrag();
      return;
    }

    if (
      initialLocation &&
      sourceList.id === targetList.id &&
      initialLocation.cardIndex === finalLocation.cardIndex
    ) {
      snapshotRef.current = null;
      return;
    }

    const finalCards = boardLists[finalLocation.listIndex].cards;
    const prevCardId =
      finalLocation.cardIndex > 0 ? finalCards[finalLocation.cardIndex - 1].id : null;
    const nextCardId =
      finalLocation.cardIndex < finalCards.length - 1
        ? finalCards[finalLocation.cardIndex + 1].id
        : null;
    const movedAcrossLists = sourceList.id !== targetList.id;

    const formData = new FormData();
    formData.set("cardId", activeParsed.id);
    if (prevCardId) {
      formData.set("prevCardId", prevCardId);
    }
    if (nextCardId) {
      formData.set("nextCardId", nextCardId);
    }
    if (movedAcrossLists) {
      formData.set("targetListId", targetList.id);
    }

    startPersistTransition(async () => {
      const result = movedAcrossLists
        ? await moveCardAction(formData)
        : await reorderCardAction(formData);

      if (!result.success) {
        restoreSnapshot();
        setError(result.error);
        snapshotRef.current = null;
        return;
      }

      setError("");
      snapshotRef.current = null;
    });
  }

  const activeCard =
    activeDrag?.kind === "card"
      ? boardLists.flatMap((list) => list.cards).find((card) => card.id === activeDrag.id) ??
        null
      : null;
  const activeList =
    activeDrag?.kind === "list"
      ? boardLists.find((list) => list.id === activeDrag.id) ?? null
      : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <ScrollArea className="flex-1" showHorizontalScrollbar>
        {error ? (
          <p className="px-4 pt-4 text-sm text-destructive">{error}</p>
        ) : null}

        <SortableContext items={listItems} strategy={horizontalListSortingStrategy}>
          <div className="flex w-max min-w-full gap-4 p-4">
            {boardLists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                canEdit={canEdit}
                canDelete={canDelete}
                canCreateCard={canCreateCard}
                canEditCard={canEditCard}
                canArchiveCard={canArchiveCard}
                sortableId={toListSortableId(list.id)}
                canSortList={canEdit && !isPersisting}
                canSortCards={canEditCard && !isPersisting}
                onOpenCard={openCard}
                isListDropTarget={activeDrag?.kind === "list" && listDropTargetId === list.id}
                isCardDropTarget={activeDrag?.kind === "card" && listDropTargetId === list.id}
                cardDropIndicator={
                  activeDrag?.kind === "card" && cardDropIndicator?.listId === list.id
                    ? {
                        cardId: cardDropIndicator.cardId,
                        placement: cardDropIndicator.placement,
                      }
                    : null
                }
              />
            ))}
            <AddListButton boardId={boardId} canCreate={canCreateList} />
          </div>
        </SortableContext>
      </ScrollArea>

      <DragOverlay>
        {activeCard ? (
          <Card size="sm" className="w-72 py-3 shadow-lg">
            <CardContent className="px-3">
              <p className="text-sm break-words whitespace-normal">{activeCard.title}</p>
            </CardContent>
          </Card>
        ) : activeList ? (
          <div className="w-80 rounded-lg border border-primary/30 bg-card p-3 shadow-xl">
            <p className="truncate text-sm font-semibold">{activeList.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
