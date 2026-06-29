"use client";

import { Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";
import { Button } from "@/components/ui/button";

// Board-level control for the compact↔expanded label preference (US-044). One
// toggle for the whole board (not per card) so the decision survives realtime
// re-renders and can't flicker during a drag. Collapsed = compact color bars;
// expanded = full text pills. The pressed state is carried by aria-pressed and
// the filled (secondary) vs outline variant, so it's never color-only.
export function BoardLabelToggle() {
  const lists = useBoardStore((s) => s.lists);
  const expandLabels = useBoardStore((s) => s.expandLabels);
  const toggleExpandLabels = useBoardStore((s) => s.toggleExpandLabels);

  // Nothing to expand if no card carries a label.
  const hasLabels = lists.some((list) =>
    list.cards.some((card) => card.labels.length > 0),
  );
  if (!hasLabels) {
    return null;
  }

  return (
    <Button
      type="button"
      variant={expandLabels ? "secondary" : "outline"}
      size="sm"
      className="gap-1.5"
      aria-pressed={expandLabels}
      aria-label={
        expandLabels
          ? "Collapse labels to color bars"
          : "Expand labels to show names"
      }
      onClick={toggleExpandLabels}
    >
      <HugeiconsIcon icon={Tag01Icon} size={16} />
      Labels
    </Button>
  );
}
