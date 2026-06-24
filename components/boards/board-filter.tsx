"use client"

import { FilterIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { availableLabels } from "@/lib/board-filter"
import { cn } from "@/lib/utils"

// Toolbar control for the client-only board card filter (US-013 slice 1: labels).
// Options are derived from the labels actually in use on the board (read from the
// store), so there is no extra fetch and no prop drilling. Selection lives in the
// store; ListColumn hides non-matching cards.
export function BoardFilter() {
  const lists = useBoardStore((s) => s.lists)
  const filterLabelIds = useBoardStore((s) => s.filterLabelIds)
  const toggleLabelFilter = useBoardStore((s) => s.toggleLabelFilter)
  const clearFilters = useBoardStore((s) => s.clearFilters)

  const labels = availableLabels(lists)
  const activeCount = filterLabelIds.length

  // No labels exist on the board yet — nothing to filter by.
  if (labels.length === 0) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={activeCount > 0 ? "secondary" : "outline"}
          size="sm"
          className="gap-1.5"
          aria-label="Filter cards by label"
        >
          <HugeiconsIcon icon={FilterIcon} size={16} />
          Filter
          {activeCount > 0 ? (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Filter by label</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {labels.map((label) => (
          <DropdownMenuCheckboxItem
            key={label.id}
            checked={filterLabelIds.includes(label.id)}
            // Keep the menu open so multiple labels can be toggled in one pass.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => toggleLabelFilter(label.id)}
          >
            <span className="flex items-center gap-2">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              <span className="truncate">{label.name}</span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={activeCount === 0}
          onSelect={() => clearFilters()}
          className={cn(activeCount === 0 && "text-muted-foreground")}
        >
          Clear filters
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
