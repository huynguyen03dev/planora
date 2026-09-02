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
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArchiveCardDialog } from "@/components/boards/archive-card-dialog";
import { CardCompletionToggle } from "@/components/boards/card-completion-toggle";
import { LabelMark } from "@/components/boards/label-mark";
import {
  CardDueState,
  DUE_META_CHIP_CLASS,
  PRIORITY_META_CHIP,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

// Cap on assignee avatars before collapsing into "+N"; the store carries the
// full assignee set (US-065 needs it for filtering), so the cap is applied at
// render rather than in the query.
const MAX_CARD_FACE_AVATARS = 3;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

type DueState = CardDueState;

// Card-face due-date badge: completed cards (completedAt set) always read as
// "done" and never overdue. State is carried by icon + word + aria-label, never
// by color alone (WCAG 1.4.1).
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

// Priority/due chips use the shared meta-chip ramp (lib/constants.ts) — token
// pairs (label-*, success, warning, destructive), AA-measured in globals.css.

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

  // Board-wide "expand labels" preference (US-044): read from the store so
  // toggling re-renders every card consistently and never resets mid-drag.
  // Trello-style, clicking any card's labels flips the whole board between
  // compact bars and named chips (no separate header control).
  const expandLabels = useBoardStore((s) => s.expandLabels);
  const toggleExpandLabels = useBoardStore((s) => s.toggleExpandLabels);

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  const completed = card.completedAt !== null;
  const due = card.dueDate ? describeDueDate(card.dueDate, card.completedAt) : null;
  // `card.members` is the full assignee set (US-065 filtering); the face caps
  // at MAX_CARD_FACE_AVATARS and collapses the rest into "+N".
  const visibleMembers = card.members.slice(0, MAX_CARD_FACE_AVATARS);
  const memberOverflow = Math.max(0, card.memberCount - visibleMembers.length);
  const hasMeta =
    Boolean(card.priority) ||
    Boolean(due) ||
    card.checklistTotal > 0 ||
    card.commentCount > 0 ||
    card.memberCount > 0;
  // Hover quick-actions (edit, or archive-on-completed) only for users with the
  // rights; viewers get a clean, action-free card face.
  const showQuickActions = canEdit || (canArchive && Boolean(card.completedAt));

  return (
    <>
      <Draggable draggableId={card.id} index={index} isDragDisabled={!canDrag}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            // Whole-card drag (US-069): the card body IS the drag handle. No
            // `disableInteractiveElementBlocking` — default blocking keeps drags
            // from starting on nested controls (completion toggle, actions menu,
            // label toggle) so those stay clickable. `dragHandleProps` is null
            // when isDragDisabled, so spreading is safe for viewers.
            {...provided.dragHandleProps}
            role="button"
            tabIndex={0}
            aria-label={`Open card ${card.title}`}
            onClick={() => onOpenCard(card.id)}
            onKeyDown={(event) => {
              // Mid keyboard-drag, Enter would open the sheet on top of the
              // in-flight drag — bail while dragging (dropping is Space).
              if (snapshot.isDragging) {
                return;
              }
              // Enter opens only on the card div itself, not nested controls
              // (target !== currentTarget); dnd's keyboard sensor is bound
              // globally, so Enter-to-open is additive and doesn't collide with
              // Space-lift.
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
              // Focus ring on the whole-card open affordance (role=button,
              // tabIndex=0): only keyboard focus shows the ring — mouse clicks
              // hit :focus (WCAG 1.4.11; DESIGN.md focus = ring-ring + glow).
              "mb-2 cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              // cursor-pointer signals click-to-open; no resting grab cursor — a
              // hover grab would misread before a drag starts. Grabbing appears
              // only on mousedown (active:) and only for users who can drag.
              canDrag && "active:cursor-grabbing",
            )}
            style={{
              ...provided.draggableProps.style,
              ...(hidden ? { display: "none" } : null),
            }}
            aria-hidden={hidden || undefined}
          >
            <Card
              // Not size="sm": its data-[size=sm]:py-4 variant class beats the
              // py-0 override, padding ~32px back onto every tile (US-044).
              className={cn(
                // 150ms ease for transform (drag scale), border-color (hover) and
                // box-shadow (drag shadow) — DESIGN.md motion. Hover is a neutral
                // border lift, NOT a bg fill: bg-muted hover would equal the list
                // surface and merge the card into it (worst in dark mode). Gated
                // off while dragging; motion-reduce disables the transition.
                "group gap-0 overflow-hidden py-0 transition-[transform,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
                !snapshot.isDragging && "hover:border-muted-foreground/40",
                snapshot.isDragging && "scale-[1.02] shadow-md",
                // Completed cards stay in place, dimmed (Trello parity, US-045);
                // the dim is decorative, never the sole signal (WCAG 1.4.1), and is
                // kept at 0.75 so small muted meta text stays near AA-secondary
                // contrast. No reorder/hide — that coupling was removed in 0020.
                card.completedAt && "opacity-75",
              )}
            >
              {card.coverImage ? (
                // Compact tiles (US-044): the cover shrinks to h-10 so an 80px
                // image can't dominate a ~48px tile; the drag placeholder carries
                // no cover, so covered cards are intentionally a touch taller.
                <img
                  src={card.coverImage}
                  alt=""
                  className="h-10 w-full object-cover"
                />
              ) : null}
              <CardContent className="relative space-y-1.5 p-2">
                {/* Hover-only quick actions, overlaid top-right and out of flow so
                    they never inflate the title row. opacity-0 (not display:none)
                    keeps them keyboard-focusable: focus-within and group-hover
                    reveal them; coarse-pointer devices (no :hover) keep them always
                    shown. Edit opens the card; Archive only on completed cards. */}
                {showQuickActions ? (
                  <div
                    className="absolute right-0.5 top-0.5 z-10 flex items-center gap-0 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Edit card ${card.title}`}
                        title="Edit"
                        onClick={() => onOpenCard(card.id)}
                        className="size-7 rounded-sm p-0 text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:size-7"
                      >
                        <HugeiconsIcon
                          icon={PencilEdit01Icon}
                          size={14}
                          strokeWidth={2}
                          className="text-current transition-colors"
                        />
                      </Button>
                    ) : null}
                    {canArchive && card.completedAt ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Archive card"
                        title="Archive"
                        onClick={() => setArchiveDialogOpen(true)}
                        className="size-7 rounded-sm p-0 text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:size-7"
                      >
                        <HugeiconsIcon
                          icon={Archive02Icon}
                          size={14}
                          strokeWidth={2}
                          className="text-current transition-colors"
                        />
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {card.labels.length > 0 ? (
                  // Trello parity: the labels themselves are the toggle — a plain
                  // click flips the board-wide compact↔named preference.
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
                  {/* Unfinished cards keep the check collapsed (w-0/opacity-0) so
                      a title-only tile reads clean; hover or keyboard focus
                      (group-focus-within) slides it in. Completed cards always
                      show the filled check — it's the state indicator (US-045).
                      Collapsing by width/opacity (not display:none) keeps it
                      tab-reachable. stopPropagation: toggling must not open the
                      card (the whole body is the open surface). */}
                  <span
                    className={cn(
                      "mt-0.5 flex shrink-0 overflow-hidden transition-[width,margin,opacity] duration-150 ease-out motion-reduce:transition-none",
                      completed
                        ? "mr-1.5 w-[18px] opacity-100"
                        : // Collapsed until hover or keyboard focus; on touch (no
                          // :hover, and a tap resolves before focus-within) the
                          // check would be unreachable — a US-045 regression — so
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
                      click/keyboard open + drag surface, so the title is no longer
                      its own button; the absolute quick-actions overlay (out of
                      flow) keeps the row vertically balanced. */}
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
                            PRIORITY_META_CHIP[card.priority].className,
                          )}
                        >
                          <HugeiconsIcon
                            icon={Flag01Icon}
                            size={12}
                            strokeWidth={2}
                            className="text-current"
                          />
                          {PRIORITY_META_CHIP[card.priority].label}
                        </span>
                      ) : null}

                      {due ? (
                        <span
                          role="img"
                          aria-label={due.a11yLabel}
                          title={due.a11yLabel}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
                            DUE_META_CHIP_CLASS[due.state],
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
                              ? "text-success-foreground"
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
                          <MemberAvatar
                            key={member.id}
                            seed={member.id}
                            name={member.name}
                            image={member.image}
                            size="sm"
                          />
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

// Memoized: a drag lifecycle re-renders BoardContent and every ListColumn per
// tick; with stable `card` and `onOpenCard` references (apply-drop +
// useCallback), only cards whose props actually changed re-render.
export const ListCardItem = memo(ListCardItemComponent);
