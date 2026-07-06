"use client";

import {
  Calendar03Icon,
  CheckmarkSquare01Icon,
  Comment01Icon,
  DragDropVerticalIcon,
  Flag01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useState, useTransition } from "react";
import { Draggable } from "@hello-pangea/dnd";

import { archiveCardAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";
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
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CardCompletionToggle } from "@/components/boards/card-completion-toggle";
import { LabelMark } from "@/components/boards/label-mark";
import { cn, getInitials } from "@/lib/utils";

// How many assignee avatars the card face renders before collapsing the rest
// into a "+N" chip. The store now carries the full assignee set (US-065 filter
// needs it), so the cap is applied here at render rather than in the query.
const MAX_CARD_FACE_AVATARS = 3;

// Priority chip: soft tinted bg + tinted icon/text. Distinct from solid label
// pills (different visual language) and accessible — icon + text, never
// color-only. Colors are Tailwind palette utilities (not raw hex) so the chip
// follows the token system and adapts in dark mode — lighter foreground over a
// slightly stronger tint keeps contrast on the darker card surface (US-036).
const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  URGENT: {
    label: "Urgent",
    className: "bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  },
  HIGH: {
    label: "High",
    className:
      "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  },
  MEDIUM: {
    label: "Medium",
    className:
      "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  },
  LOW: {
    label: "Low",
    className:
      "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  },
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

type DueState = "overdue" | "today" | "soon" | "upcoming" | "done";

// Card-face due-date badge: state + short label + accessible description. A
// completed card (completedAt set) always reads as "done" and never as overdue.
// The visible label alone never carries state by color — the icon + word
// ("Today"/"Tomorrow"/date) and the aria-label do (never color-only).
function describeDueDate(
  dueDate: Date,
  completedAt: Date | null,
): { state: DueState; label: string; a11yLabel: string } {
  const due = new Date(dueDate);
  const now = new Date();
  const dayLabel = due.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(due.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });

  if (completedAt) {
    return { state: "done", label: dayLabel, a11yLabel: `Completed, was due ${dayLabel}` };
  }

  const diffDays = Math.round(
    (startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );

  if (diffDays < 0) {
    return { state: "overdue", label: dayLabel, a11yLabel: `Due ${dayLabel}, overdue` };
  }
  if (diffDays === 0) {
    return { state: "today", label: "Today", a11yLabel: "Due today" };
  }
  if (diffDays === 1) {
    return { state: "soon", label: "Tomorrow", a11yLabel: "Due tomorrow" };
  }
  if (diffDays <= 3) {
    return { state: "soon", label: dayLabel, a11yLabel: `Due ${dayLabel}, soon` };
  }
  return { state: "upcoming", label: dayLabel, a11yLabel: `Due ${dayLabel}` };
}

const DUE_STATE_CLASS: Record<DueState, string> = {
  overdue: "bg-destructive/10 text-destructive",
  today: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  soon: "text-amber-700 dark:text-amber-400",
  upcoming: "text-muted-foreground",
  done: "text-emerald-700 dark:text-emerald-500",
};

type ListCardItemProps = {
  card: {
    id: string;
    title: string;
    listId: string;
    coverImage: string | null;
    priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
    dueDate: Date | null;
    completedAt: Date | null;
    labels: Array<{ id: string; name: string; color: string }>;
    members: Array<{ id: string; name: string; image: string | null }>;
    memberCount: number;
    checklistDone: number;
    checklistTotal: number;
    commentCount: number;
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

  // Board-wide "expand labels" preference (US-044). Read from the store, not local
  // state, so toggling it re-renders every card consistently and it never resets
  // mid-drag (the memo'd card re-renders per drag tick). Trello-style, the toggle
  // lives on the card face: clicking any card's labels flips the whole board
  // between compact bars and named chips (there is no separate header control).
  const expandLabels = useBoardStore((s) => s.expandLabels);
  const toggleExpandLabels = useBoardStore((s) => s.toggleExpandLabels);

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [isArchiving, startArchiveTransition] = useTransition();

  const due = card.dueDate ? describeDueDate(card.dueDate, card.completedAt) : null;
  // `card.members` is the full assignee set (US-065 needs it for filtering); the
  // face shows at most MAX_CARD_FACE_AVATARS and collapses the rest into "+N".
  const visibleMembers = card.members.slice(0, MAX_CARD_FACE_AVATARS);
  const memberOverflow = Math.max(0, card.memberCount - visibleMembers.length);
  const hasMeta =
    Boolean(card.priority) ||
    Boolean(due) ||
    card.checklistTotal > 0 ||
    card.commentCount > 0 ||
    card.memberCount > 0;

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
            // mb-2 (not a parent flex `gap`) is the inter-card spacing: it's
            // part of the card's own box, so @hello-pangea/dnd's placeholder
            // reserves it during a drag and the column height doesn't shift on
            // lift/drop. See the sibling note in list-column.tsx.
            className="mb-2"
            style={{
              ...provided.draggableProps.style,
              ...(hidden ? { display: "none" } : null),
            }}
            aria-hidden={hidden || undefined}
          >
            <Card
              // No size="sm": its data-[size=sm]:py-4 is a variant class that the
              // py-0 override can't win against, padding ~32px back onto every
              // tile. Without it, the explicit gap-0 / py-0 (+ CardContent p-2)
              // take effect, which is what makes the compact tile actually compact
              // (US-044).
              className={cn(
                "gap-0 overflow-hidden py-0 transition-transform",
                snapshot.isDragging && "scale-[1.02] shadow-md",
                // Completed cards stay in place, dimmed (Trello parity) — the
                // filled completion check is the state indicator (US-045), so the
                // dim is decorative, not the sole signal (WCAG 1.4.1). Kept at
                // 0.75 (not 0.65) so small muted-foreground meta text stays close
                // to its AA-secondary contrast; Platform verification measures the
                // composited ratio. No auto-sort, no hiding: reordering would
                // reintroduce the list-position/completion coupling removed in 0020.
                card.completedAt && "opacity-75",
              )}
            >
              {card.coverImage ? (
                // Compact tiles (US-044): the cover shrinks from h-20 so an 80px
                // image can't dominate a now-~48px tile, while still reading as a
                // cover. The drag placeholder carries no cover (it never has), so
                // covered cards are intentionally a touch taller than the ghost.
                <img
                  src={card.coverImage}
                  alt=""
                  className="h-10 w-full object-cover"
                />
              ) : null}
              <CardContent className="space-y-1.5 p-2">
                {card.labels.length > 0 ? (
                  // Trello parity: the labels themselves are the toggle. A plain
                  // click flips the board-wide compact↔named preference. The card
                  // is dragged from its dedicated grip handle (not here), so this
                  // button only ever toggles.
                  <button
                    type="button"
                    onClick={() => toggleExpandLabels()}
                    aria-label={
                      expandLabels
                        ? "Collapse labels to color bars"
                        : "Expand labels to show names"
                    }
                    aria-pressed={expandLabels}
                    className="flex w-fit max-w-full flex-wrap gap-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {card.labels.map((label) => (
                      <LabelMark
                        key={label.id}
                        label={label}
                        variant={expandLabels ? "chip" : "bar"}
                      />
                    ))}
                  </button>
                ) : null}

                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-1.5">
                    <CardCompletionToggle
                      cardId={card.id}
                      completedAt={card.completedAt}
                      canEdit={canEdit}
                      variant="face"
                      onError={setError}
                      className="mt-0.5"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenCard(card.id)}
                      className="h-auto min-w-0 flex-1 justify-start whitespace-normal break-words p-0 text-left text-sm font-normal hover:bg-transparent"
                    >
                      {card.title}
                    </Button>
                  </div>

                  {(canEdit || canArchive || canDrag) && (
                    <div className="flex items-center gap-1">
                      {canDrag ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Drag card"
                          className="cursor-grab text-muted-foreground hover:bg-foreground/10 hover:text-foreground active:cursor-grabbing"
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

                {hasMeta ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {card.priority ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
                            PRIORITY_CONFIG[card.priority].className,
                          )}
                        >
                          <HugeiconsIcon
                            icon={Flag01Icon}
                            size={12}
                            strokeWidth={2}
                            className="text-current"
                          />
                          {PRIORITY_CONFIG[card.priority].label}
                        </span>
                      ) : null}

                      {due ? (
                        <span
                          role="img"
                          aria-label={due.a11yLabel}
                          title={due.a11yLabel}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
                            DUE_STATE_CLASS[due.state],
                          )}
                        >
                          <HugeiconsIcon
                            icon={Calendar03Icon}
                            size={12}
                            strokeWidth={2}
                            className="text-current"
                          />
                          {due.label}
                        </span>
                      ) : null}

                      {card.checklistTotal > 0 ? (
                        <span
                          role="img"
                          aria-label={`${card.checklistDone} of ${card.checklistTotal} checklist items complete`}
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium",
                            card.checklistDone === card.checklistTotal
                              ? "text-emerald-700 dark:text-emerald-500"
                              : "text-muted-foreground",
                          )}
                        >
                          <HugeiconsIcon
                            icon={CheckmarkSquare01Icon}
                            size={12}
                            strokeWidth={2}
                            className="text-current"
                          />
                          {card.checklistDone}/{card.checklistTotal}
                        </span>
                      ) : null}

                      {card.commentCount > 0 ? (
                        <span
                          role="img"
                          aria-label={`${card.commentCount} ${
                            card.commentCount === 1 ? "comment" : "comments"
                          }`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
                        >
                          <HugeiconsIcon
                            icon={Comment01Icon}
                            size={12}
                            strokeWidth={2}
                            className="text-current"
                          />
                          {card.commentCount}
                        </span>
                      ) : null}
                    </div>

                    {card.memberCount > 0 ? (
                      <AvatarGroup className="shrink-0">
                        {visibleMembers.map((member) => (
                          <Avatar key={member.id} size="sm">
                            {member.image ? (
                              <AvatarImage src={member.image} alt={member.name} />
                            ) : null}
                            <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                          </Avatar>
                        ))}
                        {memberOverflow > 0 ? (
                          <AvatarGroupCount
                            className="text-xs"
                            aria-label={`${memberOverflow} more`}
                          >
                            +{memberOverflow}
                          </AvatarGroupCount>
                        ) : null}
                      </AvatarGroup>
                    ) : null}
                  </div>
                ) : null}

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
