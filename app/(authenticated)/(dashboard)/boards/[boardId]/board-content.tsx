"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DragDropContext,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";

import {
  moveCardAction,
  reorderCardAction,
  reorderListAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { AddListButton } from "@/components/boards/add-list-button";
import { ListColumn } from "@/components/boards/list-column";
import { ScrollArea } from "@/components/ui/scroll-area";
import { translateCardDrop, translateListDrop } from "@/lib/dnd/apply-drop";
import { useBoardStore } from "./board-store";

type BoardContentProps = {
  boardId: string;
  lists: Array<{
    id: string;
    title: string;
    boardId: string;
    isDone: boolean;
    position: number;
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

  const storeBoardId = useBoardStore((state) => state.boardId);
  const storeLists = useBoardStore((state) => state.lists);
  const boardLists = storeBoardId === boardId ? storeLists : lists;

  const [error, setError] = useState("");
  const [isPersisting, startPersistTransition] = useTransition();

  function openCard(cardId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cardId", cardId);

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function onDragStart() {
    // Mark a drag as active so the store provider defers structural remote board
    // updates — reordering the list array mid-drag corrupts the drop or breaks
    // @hello-pangea/dnd. Deferred events are reconciled in onDragEnd.
    useBoardStore.getState().setDragging(true);
  }

  function onDragEnd(result: DropResult) {
    // Drag finished (including cancel) — let deferred remote updates flow again,
    // and find out whether any were skipped while this drag was in flight.
    useBoardStore.getState().setDragging(false);
    const needsResync = useBoardStore.getState().consumeResync();
    const reconcile = () => {
      if (needsResync) {
        // Remote board events were deferred during the drag; pull canonical
        // server state so the board folds them in (along with our own move).
        router.refresh();
      }
    };

    const { source, destination, type, draggableId } = result;
    if (!destination) {
      reconcile();
      return;
    }

    const translation =
      type === "list"
        ? translateListDrop(boardLists, draggableId, source, destination)
        : translateCardDrop(boardLists, draggableId, source, destination);

    if (translation.action === "none") {
      reconcile();
      return;
    }

    // Defensive permission re-check (drag is already gated by isDragDisabled /
    // isDropDisabled, but never trust the client-side gate alone).
    if (translation.action === "reorderList" && !canEdit) {
      reconcile();
      return;
    }
    if (
      (translation.action === "reorderCard" || translation.action === "moveCard") &&
      !canEditCard
    ) {
      reconcile();
      return;
    }

    const setLists = useBoardStore.getState().setLists;
    const snapshot = boardLists; // pre-move state for rollback on failure

    // Optimistic commit — the store now holds the final order.
    setLists(translation.nextLists);
    setError("");

    const formData = new FormData();
    switch (translation.action) {
      case "reorderList": {
        formData.set("listId", translation.fields.listId);
        if (translation.fields.prevListId) {
          formData.set("prevListId", translation.fields.prevListId);
        }
        if (translation.fields.nextListId) {
          formData.set("nextListId", translation.fields.nextListId);
        }
        break;
      }
      case "reorderCard": {
        formData.set("cardId", translation.fields.cardId);
        if (translation.fields.prevCardId) {
          formData.set("prevCardId", translation.fields.prevCardId);
        }
        if (translation.fields.nextCardId) {
          formData.set("nextCardId", translation.fields.nextCardId);
        }
        break;
      }
      case "moveCard": {
        formData.set("cardId", translation.fields.cardId);
        formData.set("targetListId", translation.fields.targetListId);
        if (translation.fields.prevCardId) {
          formData.set("prevCardId", translation.fields.prevCardId);
        }
        if (translation.fields.nextCardId) {
          formData.set("nextCardId", translation.fields.nextCardId);
        }
        break;
      }
    }

    const action = translation.action;
    startPersistTransition(async () => {
      const res =
        action === "reorderList"
          ? await reorderListAction(formData)
          : action === "reorderCard"
            ? await reorderCardAction(formData)
            : await moveCardAction(formData);

      if (!res.success) {
        setLists(snapshot); // roll back optimistic move
        setError(res.error);
      }
      // Cross-user card moves normally sync via the card:moved socket event, so
      // no refresh is needed — unless we deferred remote events during the drag.
      reconcile();
    });
  }

  return (
    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <ScrollArea className="flex-1" showHorizontalScrollbar>
        {error ? (
          <p className="px-4 pt-4 text-sm text-destructive">{error}</p>
        ) : null}

        <Droppable
          droppableId="board"
          type="list"
          direction="horizontal"
          isDropDisabled={!canEdit || isPersisting}
        >
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex w-max min-w-full items-start gap-4 p-4"
            >
              {boardLists.map((list, index) => (
                <ListColumn
                  key={list.id}
                  list={list}
                  index={index}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canCreateCard={canCreateCard}
                  canEditCard={canEditCard}
                  canArchiveCard={canArchiveCard}
                  canSortList={canEdit && !isPersisting}
                  canSortCards={canEditCard && !isPersisting}
                  onOpenCard={openCard}
                />
              ))}
              {provided.placeholder}
              <AddListButton boardId={boardId} canCreate={canCreateList} />
            </div>
          )}
        </Droppable>
      </ScrollArea>
    </DragDropContext>
  );
}
