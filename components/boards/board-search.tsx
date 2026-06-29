"use client"

import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store"
import { Input } from "@/components/ui/input"

// Header control for the client-only board card search (US-014 slice 1: title).
// The query lives in the store; ListColumn hides cards whose title does not
// contain it, ANDed with the US-013 label filter. No server round-trip.
export function BoardSearch() {
  const searchQuery = useBoardStore((s) => s.searchQuery)
  const setSearchQuery = useBoardStore((s) => s.setSearchQuery)

  return (
    <div className="relative">
      <HugeiconsIcon
        icon={Search01Icon}
        size={16}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="text"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search cards…"
        aria-label="Search cards by title"
        className="h-8 w-40 bg-white/90 pl-8 pr-8 sm:w-56"
      />
      {searchQuery ? (
        <button
          type="button"
          onClick={() => setSearchQuery("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
        </button>
      ) : null}
    </div>
  )
}
