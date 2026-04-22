"use client";

import { DragDropVerticalIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, useTransition } from "react";
import {
  defaultAnimateLayoutChanges,
  useSortable,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { archiveCardAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { toCardSortableId } from "@/components/boards/board-dnd-types";
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
import { cn } from "@/lib/utils";

type ListCardItemProps = {
  card: {
    id: string;
    title: string;
    listId: string;
  };
  canEdit: boolean;
  canArchive: boolean;
  canDrag: boolean;
  onOpenCard: (cardId: string) => void;
};

const animateCardLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({
    ...args,
    wasDragging: true,
  });

export function ListCardItem({
  card,
  canEdit,
  canArchive,
  canDrag,
  onOpenCard,
}: ListCardItemProps) {
  const [error, setError] = useState("");

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [isArchiving, startArchiveTransition] = useTransition();

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
    animateLayoutChanges: animateCardLayoutChanges,
    disabled: !canDrag,
  });
  const cardTransform = transform
    ? CSS.Transform.toString({ ...transform, x: 0 })
    : undefined;
  const cardStyle = {
    transform: cardTransform,
    transition: cardTransform ? transition : undefined,
    opacity: isDragging ? 0.65 : 1,
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
        <Card
          size="sm"
          className={cn(
            "gap-2 py-3 shadow-sm transition",
            isDragging && "ring-2 ring-primary/25",
          )}
        >
          <CardContent className="space-y-2 px-3">
            <div className="flex items-start justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenCard(card.id)}
                className="h-auto flex-1 justify-start whitespace-normal break-words p-0 text-left text-sm font-normal hover:bg-transparent"
              >
                {card.title}
              </Button>

              {(canEdit || canArchive || canDrag) && (
                <div className="flex items-center gap-1">
                  {canDrag ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Drag card"
                      className="cursor-grab text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                      {...dragAttributes}
                      {...dragListeners}
                    >
                      <HugeiconsIcon
                        icon={DragDropVerticalIcon}
                        size={16}
                        strokeWidth={2}
                        className="text-current transition-colors"
                      />
                    </Button>
                  ) : null}

                  {(canEdit || canArchive) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Card actions"
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
                        <DropdownMenuItem onSelect={() => onOpenCard(card.id)}>
                          Open details
                        </DropdownMenuItem>
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
                  )}
                </div>
              )}
            </div>

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
