"use client";

import { CheckmarkCircle02Icon, CircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { toggleCardCompletionAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { cn } from "@/lib/utils";

type CardCompletionToggleProps = {
  cardId: string;
  completedAt: Date | null;
  /** Editors/admins can toggle; viewers see a read-only indicator. */
  canEdit: boolean;
  /** "hero" = card-detail header (24px), "face" = board card tile (18px). */
  variant: "hero" | "face";
  /** Surface a blocked/failed toggle (e.g. the estimate gate) to the caller. */
  onError?: (message: string) => void;
  className?: string;
};

// Card-owned completion control (US-045 / decision 0020). A checkbox — not a
// list-membership side-effect — so completion is a property of the card and
// dragging never changes it. State is shown by more than color (a filled check
// vs. an empty ring) for WCAG 1.4.1; it is keyboard-operable with role="checkbox"
// + aria-checked (4.1.2 / 2.1.1). On the card face it stops propagation so a
// click neither opens the detail sheet nor starts a drag.
export function CardCompletionToggle({
  cardId,
  completedAt,
  canEdit,
  variant,
  onError,
  className,
}: CardCompletionToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const completed = completedAt !== null;
  const iconSize = variant === "hero" ? 24 : 18;

  function handleToggle(event: React.MouseEvent | React.KeyboardEvent) {
    // On the card face the control lives inside a clickable/draggable tile;
    // stop the event so toggling neither opens the sheet nor begins a drag.
    event.stopPropagation();
    event.preventDefault();

    if (!canEdit || isPending) {
      return;
    }

    const formData = new FormData();
    formData.set("cardId", cardId);
    formData.set("complete", String(!completed));

    startTransition(async () => {
      const result = await toggleCardCompletionAction(formData);
      // Report the resulting error state either way: "" clears a stale message
      // (e.g. a prior estimate-gate block) once a later toggle succeeds.
      onError?.(result.success ? "" : result.error);
      if (!result.success) {
        return;
      }
      // The socket echo (emitCardCompletionUpdated) updates this and other
      // clients live when connected, but the realtime layer can be down. Refresh
      // so the actor's UI reflects the write regardless — matching every sibling
      // mutation in the card detail sheet, and re-hydrating the board store from
      // fresh server props via BoardStoreProvider's setLists effect.
      router.refresh();
    });
  }

  const label = completed ? "Reopen card (mark incomplete)" : "Mark card complete";

  // Viewers get a static, non-interactive indicator (no role="checkbox", no
  // focus) that still conveys state by icon shape, not color alone.
  if (!canEdit) {
    return (
      <span
        role="img"
        aria-label={completed ? "Completed" : "Not completed"}
        title={completed ? "Completed" : "Not completed"}
        className={cn(
          "inline-flex shrink-0 items-center justify-center",
          completed ? "text-success-foreground" : "text-muted-foreground/60",
          className,
        )}
      >
        <HugeiconsIcon
          icon={completed ? CheckmarkCircle02Icon : CircleIcon}
          size={iconSize}
          strokeWidth={2}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={completed}
      aria-label={label}
      title={label}
      disabled={isPending}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={handleToggle}
      className={cn(
        // p-2 -m-2 grows the pointer/touch target (~34px face, ~40px hero) past
        // the tiny glyph without shifting layout — the negative margin cancels
        // the padding's contribution to flow (DESIGN.md §400 hit-target minimum).
        "inline-flex shrink-0 items-center justify-center rounded-full p-2 -m-2 transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
        completed
          ? "text-success-foreground hover:text-success-foreground/80"
          : "text-muted-foreground/60 hover:text-foreground",
        className,
      )}
    >
      <HugeiconsIcon
        icon={completed ? CheckmarkCircle02Icon : CircleIcon}
        size={iconSize}
        strokeWidth={2}
      />
    </button>
  );
}
