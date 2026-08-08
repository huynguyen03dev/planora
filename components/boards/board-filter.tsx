"use client"

import { useEffect, useState } from "react"
import { Cancel01Icon, FilterIcon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store"
import {
  boardHeaderControlActiveClass,
  boardHeaderControlClass,
} from "@/components/boards/board-header-controls"
import { MemberAvatar } from "@/components/member-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  activeFilterCount,
  availableLabels,
  availableMembers,
  cardMatchesQuery,
  isFilterActive,
  isSearchActive,
  type ActivityWindow,
  type CardFilter,
  type CardStatus,
  type DueBucket,
} from "@/lib/board-filter"
import { labelSwatchStyle } from "@/lib/label-colors"
import { cn } from "@/lib/utils"

// Static filter options. `name` is the row's display label.
const STATUS_OPTIONS: { value: CardStatus; name: string }[] = [
  { value: "complete", name: "Complete" },
  { value: "incomplete", name: "Not complete" },
]
const DUE_OPTIONS: { value: DueBucket; name: string }[] = [
  { value: "overdue", name: "Overdue" },
  { value: "day", name: "Due in the next day" },
  { value: "week", name: "Due in the next week" },
  { value: "month", name: "Due in the next month" },
  { value: "none", name: "No due date" },
]
const ACTIVITY_OPTIONS: { value: ActivityWindow; name: string }[] = [
  { value: "1w", name: "Active in the last week" },
  { value: "2w", name: "Active in the last 2 weeks" },
  { value: "4w", name: "Active in the last 4 weeks" },
]

// A checkbox + label row.
function CheckRow({
  id,
  checked,
  onToggle,
  children,
}: {
  id: string
  checked: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
    >
      <Checkbox id={id} checked={checked} onCheckedChange={() => onToggle()} />
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
    </label>
  )
}

// A titled group of filter rows. Consecutive sections are divided by a hairline
// (DESIGN.md: hierarchy by surface ladder + 1px borders, not heavy chrome), and
// the title is an eyebrow — uppercase, tracked, muted — so each group reads as a
// distinct block instead of a cramped run-on list.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border px-1 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  )
}

// Trello-style board filter popover (US-065). One keyword search + five filter
// dimensions. A keyword filters cards by title and suspends the dimensions —
// while it is active the dimension list is hidden entirely (the keyword alone
// governs visibility), keeping the popover compact. Options are derived from the
// store (no fetch).
export function BoardFilter() {
  const lists = useBoardStore((s) => s.lists)
  const searchQuery = useBoardStore((s) => s.searchQuery)
  const setSearchQuery = useBoardStore((s) => s.setSearchQuery)
  const filterLabelIds = useBoardStore((s) => s.filterLabelIds)
  const filterMemberIds = useBoardStore((s) => s.filterMemberIds)
  const filterNoMembers = useBoardStore((s) => s.filterNoMembers)
  const filterAssignedToMe = useBoardStore((s) => s.filterAssignedToMe)
  const filterStatuses = useBoardStore((s) => s.filterStatuses)
  const filterDueBuckets = useBoardStore((s) => s.filterDueBuckets)
  const filterActivityWindows = useBoardStore((s) => s.filterActivityWindows)
  const currentUserId = useBoardStore((s) => s.currentUserId)

  const toggleLabelFilter = useBoardStore((s) => s.toggleLabelFilter)
  const toggleMemberFilter = useBoardStore((s) => s.toggleMemberFilter)
  const toggleNoMembers = useBoardStore((s) => s.toggleNoMembers)
  const toggleAssignedToMe = useBoardStore((s) => s.toggleAssignedToMe)
  const toggleStatusFilter = useBoardStore((s) => s.toggleStatusFilter)
  const toggleDueBucket = useBoardStore((s) => s.toggleDueBucket)
  const toggleActivityWindow = useBoardStore((s) => s.toggleActivityWindow)
  const clearFilters = useBoardStore((s) => s.clearFilters)

  // The input reflects keystrokes immediately (feels responsive), but the store
  // query — which drives the board-wide re-filter — is only updated after the
  // user pauses, so we don't re-filter every list on every character.
  const [draftQuery, setDraftQuery] = useState(searchQuery)

  // Sync the draft when the store query changes from elsewhere (e.g. "Clear
  // filters" or reset). No-op while typing, since the store already matches.
  useEffect(() => {
    setDraftQuery(searchQuery)
  }, [searchQuery])

  // Debounce the draft → store push. Cancelled on each keystroke so it fires
  // ~250ms after the last one.
  useEffect(() => {
    if (draftQuery === searchQuery) {
      return
    }
    const timer = setTimeout(() => setSearchQuery(draftQuery), 250)
    return () => clearTimeout(timer)
  }, [draftQuery, searchQuery, setSearchQuery])

  const filter: CardFilter = {
    labelIds: filterLabelIds,
    memberIds: filterMemberIds,
    noMembers: filterNoMembers,
    assignedToMe: filterAssignedToMe,
    statuses: filterStatuses,
    dueBuckets: filterDueBuckets,
    activityWindows: filterActivityWindows,
  }

  const searchActive = isSearchActive(searchQuery)
  const filterActive = isFilterActive(filter)
  const active = searchActive || filterActive
  // While searching, the keyword alone governs visibility (dimensions paused), so
  // the badge reflects that single constraint. Otherwise count the dimensions.
  const displayCount = searchActive ? 1 : activeFilterCount(filter)

  // Dimension option sets, derived from the store (no fetch). The current viewer
  // is dropped from Members — the "Assigned to me" quick option covers them.
  const labels = availableLabels(lists)
  // Exclude the current viewer — the "Assigned to me" quick option covers them.
  const members = availableMembers(lists, currentUserId)

  // A keyword suspends the dimensions, so when one is active we show only whether
  // any card title matched — never a greyed, non-interactive dimension list.
  const anyCardMatch = lists.some((list) =>
    list.cards.some((card) => cardMatchesQuery(card, searchQuery)),
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5",
            boardHeaderControlClass,
            active && boardHeaderControlActiveClass,
          )}
          aria-label="Filter cards"
          // Pairs with the active fill (boardHeaderControlActiveClass) so the
          // applied state is never conveyed by fill alone (see
          // board-header-controls.ts contract). Radix injects aria-expanded.
          aria-pressed={active}
        >
          <HugeiconsIcon icon={FilterIcon} size={16} />
          Filter
          {displayCount > 0 ? (
            <Badge className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 font-semibold text-xs bg-primary text-primary-foreground hover:bg-primary">
              {displayCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        {/* Keyword search — filters cards by title; suspends the dimensions below. */}
        <div className="border-b p-2">
          <div className="relative">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="text"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search cards…"
              aria-label="Search cards by title"
              className="h-8 pl-8 pr-8"
            />
            {draftQuery ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  // Clearing feels instant — skip the debounce.
                  setDraftQuery("")
                  setSearchQuery("")
                }}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} />
              </Button>
            ) : null}
          </div>
          {searchActive ? (
            <p className="px-1 pt-1.5 text-xs text-muted-foreground">
              Filtering by keyword — clear the search to use the filters.
            </p>
          ) : null}
        </div>

        {searchActive ? (
          anyCardMatch ? null : (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              <p>No cards match your search.</p>
              <p className="pt-1">Try another keyword.</p>
            </div>
          )
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <Section title="Members">
              <CheckRow
                id="filter-member-me"
                checked={filterAssignedToMe}
                onToggle={toggleAssignedToMe}
              >
                <span className="truncate">Assigned to me</span>
              </CheckRow>
              <CheckRow
                id="filter-member-none"
                checked={filterNoMembers}
                onToggle={toggleNoMembers}
              >
                <span className="truncate">No members</span>
              </CheckRow>
              {members.map((member) => (
                <CheckRow
                  key={member.id}
                  id={`filter-member-${member.id}`}
                  checked={filterMemberIds.includes(member.id)}
                  onToggle={() => toggleMemberFilter(member.id)}
                >
                  <MemberAvatar seed={member.id} name={member.name} image={member.image} size="sm" />
                  <span className="truncate">{member.name}</span>
                </CheckRow>
              ))}
            </Section>

            <Section title="Card status">
              {STATUS_OPTIONS.map((option) => (
                <CheckRow
                  key={option.value}
                  id={`filter-status-${option.value}`}
                  checked={filterStatuses.includes(option.value)}
                  onToggle={() => toggleStatusFilter(option.value)}
                >
                  <span className="truncate">{option.name}</span>
                </CheckRow>
              ))}
            </Section>

            <Section title="Due date">
              {DUE_OPTIONS.map((option) => (
                <CheckRow
                  key={option.value}
                  id={`filter-due-${option.value}`}
                  checked={filterDueBuckets.includes(option.value)}
                  onToggle={() => toggleDueBucket(option.value)}
                >
                  <span className="truncate">{option.name}</span>
                </CheckRow>
              ))}
            </Section>

            {labels.length > 0 ? (
              <Section title="Labels">
                {labels.map((label) => (
                  <CheckRow
                    key={label.id}
                    id={`filter-label-${label.id}`}
                    checked={filterLabelIds.includes(label.id)}
                    onToggle={() => toggleLabelFilter(label.id)}
                  >
                    <span
                      className="size-3 shrink-0 rounded-full border"
                      style={labelSwatchStyle(label.color)}
                    />
                    <span className="truncate">{label.name}</span>
                  </CheckRow>
                ))}
              </Section>
            ) : null}

            <Section title="Activity">
              {ACTIVITY_OPTIONS.map((option) => (
                <CheckRow
                  key={option.value}
                  id={`filter-activity-${option.value}`}
                  checked={filterActivityWindows.includes(option.value)}
                  onToggle={() => toggleActivityWindow(option.value)}
                >
                  <span className="truncate">{option.name}</span>
                </CheckRow>
              ))}
            </Section>
          </div>
        )}

        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!active}
            onClick={() => {
              // Reset the draft too, so a still-pending search debounce is
              // cancelled and can't re-apply a keyword the user just cleared.
              setDraftQuery("")
              clearFilters()
            }}
            className="w-full justify-center text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
