"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
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
  const [boardLists, setBoardLists] = useState(lists);
  const [error, setError] = useState("");
  const [activeDrag, setActiveDrag] = useState<{
    kind: "list" | "card";
    id: string;
  } | null>(null);
  const [isPersisting, startPersistTransition] = useTransition();
  const snapshotRef = useRef<typeof lists | null>(null);

  useEffect(() => {
    setBoardLists(lists);
  }, [lists]);

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
    setActiveDrag({
      kind: parsed.kind,
      id: parsed.id,
    });
  }

  function restoreSnapshot() {
    if (snapshotRef.current) {
      setBoardLists(snapshotRef.current);
    }
  }

  function finalizeDrag() {
    snapshotRef.current = null;
    setActiveDrag(null);
  }

  function handleDragCancel() {
    restoreSnapshot();
    finalizeDrag();
  }

  function abortDrag() {
    restoreSnapshot();
    finalizeDrag();
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
      if (!canEdit || overParsed.kind !== "list") {
        abortDrag();
        return;
      }

      const activeIndex = boardLists.findIndex((list) => list.id === activeParsed.id);
      const overIndex = boardLists.findIndex((list) => list.id === overParsed.id);

      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
        finalizeDrag();
        return;
      }

      const nextLists = arrayMove(boardLists, activeIndex, overIndex);
      setBoardLists(nextLists);

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
          finalizeDrag();
          return;
        }

        setError("");
        finalizeDrag();
      });
      return;
    }

    if (!canEditCard) {
      abortDrag();
      return;
    }

    const sourceLocation = findCardLocation(boardLists, activeParsed.id);
    if (!sourceLocation) {
      abortDrag();
      return;
    }

    let targetListIndex = -1;
    let targetCardIndex = -1;

    if (overParsed.kind === "card") {
      const targetLocation = findCardLocation(boardLists, overParsed.id);
      if (!targetLocation) {
        abortDrag();
        return;
      }
      targetListIndex = targetLocation.listIndex;
      targetCardIndex = targetLocation.cardIndex;
    } else if (overParsed.kind === "list") {
      targetListIndex = boardLists.findIndex((list) => list.id === overParsed.id);
      if (targetListIndex === -1) {
        abortDrag();
        return;
      }
      targetCardIndex = boardLists[targetListIndex].cards.length;
    }

    if (targetListIndex === -1 || targetCardIndex === -1) {
      abortDrag();
      return;
    }

    const sourceList = boardLists[sourceLocation.listIndex];
    const targetList = boardLists[targetListIndex];

    const nextLists = boardLists.map((list) => ({
      ...list,
      cards: [...list.cards],
    }));

    const [movedCard] = nextLists[sourceLocation.listIndex].cards.splice(
      sourceLocation.cardIndex,
      1,
    );

    if (!movedCard) {
      abortDrag();
      return;
    }

    const adjustedTargetIndex =
      sourceLocation.listIndex === targetListIndex &&
      sourceLocation.cardIndex < targetCardIndex
        ? targetCardIndex - 1
        : targetCardIndex;

    nextLists[targetListIndex].cards.splice(adjustedTargetIndex, 0, {
      ...movedCard,
      listId: nextLists[targetListIndex].id,
    });

    setBoardLists(nextLists);

    const finalLocation = findCardLocation(nextLists, activeParsed.id);
    if (!finalLocation) {
      abortDrag();
      return;
    }

    const finalCards = nextLists[finalLocation.listIndex].cards;
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
        finalizeDrag();
        return;
      }

      setError("");
      finalizeDrag();
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
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
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
              <p className="text-sm">{activeCard.title}</p>
            </CardContent>
          </Card>
        ) : activeList ? (
          <div className="w-80 rounded-lg bg-muted p-3 shadow-lg">
            <p className="truncate text-sm font-semibold">{activeList.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
