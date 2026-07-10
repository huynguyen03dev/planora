"use client";

import {
  Archive02Icon,
  Calendar03Icon,
  CheckmarkSquare01Icon,
  Comment01Icon,
  Flag01Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useState } from "react";
import { Draggable } from "@hello-pangea/dnd";

import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArchiveCardDialog } from "@/components/boards/archive-card-dialog";
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

  const completed = card.completedAt !== null;
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
  // Whether any hover quick-action (edit, or archive-on-completed) is offered.
  // Viewers with no edit/archive rights get a clean, action-free card face.
  const showQuickActions = canEdit || (canArchive && Boolean(card.completedAt));

  return (
    <>
      <Draggable draggableId={card.id} index={index} isDragDisabled={!canDrag}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            // Whole-card drag (US-069): the card body IS the drag handle — no
            // separate grip. `dragHandleProps` is null when isDragDisabled, so
            // spreading it is safe for viewers. We intentionally do NOT set
            // `disableInteractiveElementBlocking`: default blocking keeps drags
            // from starting on the nested controls (completion toggle, actions
            // menu, label toggle) so those stay clickable, while the rest of the
            // body initiates a drag.
            {...provided.dragHandleProps}
            role="button"
            tabIndex={0}
            aria-label={`Open card ${card.title}`}
            onClick={() => onOpenCard(card.id)}
            onKeyDown={(event) => {
              // Mid keyboard-drag the card div is still the focused target and
              // dnd only preventDefault()s Enter (no stopPropagation), so this
              // handler would still fire and open the sheet on top of an in-flight
              // drag. Bail while dragging — dropping is Space, not Enter.
              if (snapshot.isDragging) {
                return;
              }
              // Only the card div itself opens on Enter — a keypress on a nested
              // control (target !== currentTarget) must not also open the card.
              // dnd's keyboard sensor (Space to lift, arrows to move) is bound
              // globally, not via this handler, so Enter-to-open is additive and
              // does not collide with Space-lift.
              if (event.target !== event.currentTarget) {
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                onOpenCard(card.id);
              }
            }}
            // mb-2 (not a parent flex `gap`) is the inter-card spacing: it's
            // part of the card's own box, so @hello-pangea/dnd's placeholder
            // reserves it during a drag and the column height doesn't shift on
            // lift/drop. See the sibling note in list-column.tsx.
            className={cn(
              // rounded-lg + focus-visible ring hug the inner Card so the keyboard
              // open affordance (role=button, tabIndex=0) has a visible focus state
              // (WCAG 1.4.11; DESIGN.md focus = ring-ring + glow). Before US-069 the
              // grip button carried focus; the whole-card handle needs its own. Mouse
              // clicks hit :focus (no ring); only keyboard focus shows the ring.
              "mb-2 cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              // cursor-pointer signals the card is clickable (opens detail). We do
              // NOT show cursor-grab on hover: a resting grab cursor over the whole
              // card reads as misleading before a drag actually starts (the surface
              // is also the click-to-open affordance). Grabbing appears only on
              // mousedown (active:) — the moment a drag may begin — and only for
              // users who can drag.
              canDrag && "active:cursor-grabbing",
            )}
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
                // transition covers transform (drag scale), border-color (hover
                // highlight) and box-shadow (drag shadow) so each state eases in
                // over 150ms (DESIGN.md motion). Hover is a border highlight, NOT a
                // bg fill: the list column behind is bg-muted, so a bg-muted /
                // bg-secondary hover would equal the list surface and the card would
                // visually merge into the list (worst in dark, where card / muted /
                // secondary cluster within ~0.06 lightness). A neutral border lift is
                // the DESIGN.md hierarchy tool and sidesteps the collision. Gated off
                // while dragging. motion-reduce disables the transition.
                "group gap-0 overflow-hidden py-0 transition-[transform,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
                !snapshot.isDragging && "hover:border-muted-foreground/40",
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
              <CardContent className="relative space-y-1.5 p-2">
                {/* Hover-only quick actions, overlaid top-right and kept OUT of
                    flow so they never inflate the title row. That is what keeps a
                    title-only card vertically balanced: the old always-visible
                    size-8 "..." menu forced the row to 32px while title text is
                    ~20px, leaving ~12px of dead space below the title (bottom
                    heavier than top). Edit (pencil) opens the card; Archive is
                    offered only on completed cards. opacity-0 (not display:none)
                    keeps them focusable/clickable for keyboard — focus-within
                    reveals them, group-hover reveals them on mouse hover. */}
                {showQuickActions ? (
                  <div
                    className="absolute right-0.5 top-0.5 z-10 flex items-center gap-0.5 rounded-md bg-card/85 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit card ${card.title}`}
                        title="Edit"
                        onClick={() => onOpenCard(card.id)}
                        className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                      >
                        <HugeiconsIcon
                          icon={PencilEdit01Icon}
                          size={16}
                          strokeWidth={2}
                          className="text-current transition-colors"
                        />
                      </Button>
                    ) : null}
                    {canArchive && card.completedAt ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Archive card"
                        title="Archive"
                        onClick={() => setArchiveDialogOpen(true)}
                        className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                      >
                        <HugeiconsIcon
                          icon={Archive02Icon}
                          size={16}
                          strokeWidth={2}
                          className="text-current transition-colors"
                        />
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {card.labels.length > 0 ? (
                  // Trello parity: the labels themselves are the toggle. A plain
                  // click flips the board-wide compact↔named preference. The card
                  // is dragged from its dedicated grip handle (not here), so this
                  // button only ever toggles.
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleExpandLabels();
                    }}
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

                <div className="flex items-start">
                  {/* Trello-style completion reveal: an unfinished card keeps
                      the check collapsed (w-0/opacity-0) so a title-only tile
                      reads clean; hovering the card — or focusing the check with
                      the keyboard (group-focus-within) — slides it in (width +
                      mr transition) and nudges the title right. A completed card
                      always shows the filled check: it's the state indicator
                      (US-045), so it's never hidden. Collapsing by width/opacity
                      (not display:none) keeps the checkbox tab-reachable, mirroring
                      the hover quick-actions overlay above. stopPropagation: a
                      click on the toggle must not also open the card (the whole
                      body is the open surface now). */}
                  <span
                    className={cn(
                      "mt-0.5 flex shrink-0 overflow-hidden transition-[width,margin,opacity] duration-150 ease-out motion-reduce:transition-none",
                      completed
                        ? "mr-1.5 w-[18px] opacity-100"
                        : // Collapsed until the card is hovered or the check is
                          // keyboard-focused. On touch (no :hover, and a tap
                          // resolves before focus-within) that would leave the
                          // check unreachable — a US-045 regression — so
                          // coarse-pointer devices keep it always shown.
                          "w-0 opacity-0 group-hover:mr-1.5 group-hover:w-[18px] group-hover:opacity-100 group-focus-within:mr-1.5 group-focus-within:w-[18px] group-focus-within:opacity-100 [@media(hover:none)]:mr-1.5 [@media(hover:none)]:w-[18px] [@media(hover:none)]:opacity-100",
                    )}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <CardCompletionToggle
                      cardId={card.id}
                      completedAt={card.completedAt}
                      canEdit={canEdit}
                      variant="face"
                      onError={setError}
                    />
                  </span>
                  {/* Title is plain text (US-069): the whole card is the
                      click/keyboard open + drag surface, so the title is no
                      longer its own button. The hover quick-actions live in the
                      absolute overlay above (out of flow), so this row no longer
                      needs a right-side actions column — which is what keeps the
                      tile vertically balanced when there's nothing else on it. */}
                  <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-normal">
                    {card.title}
                  </span>
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

      <ArchiveCardDialog
        cardId={card.id}
        cardTitle={card.title}
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onError={setError}
      />
    </>
  );
}

// Memoized: a single drag lifecycle event re-renders BoardContent and every
// ListColumn; without this, all ~90 cards re-render per tick. With stable `card`
// and `onOpenCard` references (preserved by apply-drop + useCallback), only cards
// whose props actually changed re-render.
export const ListCardItem = memo(ListCardItemComponent);
