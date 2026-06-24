"use client";

import { DragDropVerticalIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useState, useTransition } from "react";
import { Draggable } from "@hello-pangea/dnd";

import { archiveCardAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
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
    labels: Array<{ id: string; name: string; color: string }>;
  };
  index: number;
  canEdit: boolean;
  canArchive: boolean;
  canDrag: boolean;
  /** Hidden by the board filter. Stays mounted (CSS display:none) so the
   *  Draggable keeps its index — removing it would corrupt drop positions. */
  hidden?: boolean;
  onOpenCard: (cardId: string) => void;
};

function ListCardItemComponent({
  card,
  index,
  canEdit,
  canArchive,
  canDrag,
  hidden = false,
  onOpenCard,
}: ListCardItemProps) {
  const [error, setError] = useState("");

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [isArchiving, startArchiveTransition] = useTransition();

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
      <Draggable
        draggableId={card.id}
        index={index}
        isDragDisabled={!canDrag}
        disableInteractiveElementBlocking
      >
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            style={{
              ...provided.draggableProps.style,
              ...(hidden ? { display: "none" } : null),
            }}
            aria-hidden={hidden || undefined}
          >
            <Card
              size="sm"
              className={cn("gap-2 py-3 shadow-sm", snapshot.isDragging && "shadow-lg")}
            >
              <CardContent className="space-y-2 px-3">
                {card.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {card.labels.map((label) => (
                      <span
                        key={label.id}
                        className="max-w-full truncate rounded px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: label.color }}
                        title={label.name}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                ) : null}

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
        )}
      </Draggable>

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
              &quot;{card.title}&quot; will be hidden from this board. You can
              restore it later from the board&apos;s Archived cards view.
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

// Memoized: a single drag lifecycle event re-renders BoardContent and every
// ListColumn; without this, all ~90 cards re-render per tick. With stable `card`
// and `onOpenCard` references (preserved by apply-drop + useCallback), only cards
// whose props actually changed re-render.
export const ListCardItem = memo(ListCardItemComponent);
