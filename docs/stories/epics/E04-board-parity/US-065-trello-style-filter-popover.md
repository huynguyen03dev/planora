# US-065 Trello-style unified filter popover

## Status

implemented

## Lane

normal

Spec slice from `docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md`
(Theme B — Daily-use Parity). Extends US-013 (label filter) and US-014 (title
search) into a single Trello-style **Filter** popover with more dimensions.
Risk flags: existing-behavior (the board render path + the shipped filter/search
controls change), weak-proof (board UI has no RTL harness). No hard gate — no
auth/authz change, no migration, and the one payload addition (`updatedAt` on the
board-view card) is an internal read, not a client-visible contract change. The
matcher stays a read-only, per-viewer view filter. 1–2 effective flags → normal
lane.

## Product Contract

Replace the two separate board-header controls (label filter + title search)
with **one "Filter" popover** modeled on Trello. The standalone header search box
is **removed**; its keyword search moves inside the popover. The popover narrows
the visible cards, client-side and per-viewer, live with no reload, no server
round-trip, and no Server Action; it never mutates data and is not shared with
other viewers.

The popover offers a keyword search plus five filter dimensions:

- **Keyword search** (top of the popover). Filters the board's cards by **title**
  (case-insensitive substring). The keystrokes are **debounced (~250ms)** so the
  board is not re-filtered on every character; the input itself updates instantly.
  While a keyword is present, the other dimensions are **suspended** — the keyword
  alone governs card visibility — and the popover **collapses to just the search
  box + a short hint** (no greyed, non-interactive dimension list taking up space,
  which previously left an awkward empty gap above "Clear filters"). Clearing the
  keyword restores the dimensions with their prior selections intact.
- **Members** — cards assigned to **any** selected member (OR). Options are the
  members actually assigned to cards on the board (the **current viewer is
  excluded** from the named list — the "Assigned to me" quick option already
  covers them, so a self-entry would be a redundant duplicate), plus two quick
  options: **"Assigned to me"** (cards assigned to the current viewer) and
  **"No members"** (unassigned cards). All member options OR together.
- **Card status** — **Complete** (`completedAt !== null`) or **Not complete**
  (`completedAt === null`), per US-045. Selecting both, or neither, matches all.
- **Due date** — **Overdue**, **Due in the next day**, **Due in the next week**,
  **Due in the next month**, plus **"No due date"** (cards without a due date).
  OR across the selected buckets; buckets are computed by **calendar day**
  (mirroring the card-face badge), so a card due **today** is never "Overdue" —
  it falls into the forward windows. "Overdue" means a strictly past day.
- **Labels** — carried over from US-013: cards carrying **any** selected label (OR).
- **Activity** — cards updated in the **last week / last 2 weeks / last 4 weeks**
  (based on the card's `updatedAt`, relative to now; the shortest selected window
  wins by OR).

**Composition:** within a dimension the options combine via **OR**; across
dimensions they combine via **AND** (Trello's model) — a card is visible only if
it satisfies every active dimension. Exception: while a keyword is active, only
the keyword governs card visibility (the AND dimensions are suspended, per above).

**Empty state:** when a keyword matches **no card titles**, the popover shows
*"No cards match your search. Try another keyword."*

**Clear:** a single "Clear filters" action resets every dimension and the keyword.
An active-filter count badge on the trigger reflects the number of active
constraints (dimensions + keyword).

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — the "Filtering & search" section (rewritten
  for the unified popover).

## Acceptance Criteria

- The board header shows a single **Filter** popover; the standalone `BoardSearch`
  box is gone. Its keyword search now lives at the top of the popover.
- Typing a keyword hides cards whose **title** does not contain it (debounced
  ~250ms).
- While a keyword is present, the Members / Card status / Due date / Labels /
  Activity groups are **hidden** (the popover collapses to the search box + hint)
  and do not affect card visibility; clearing the keyword restores them with their
  prior selections intact.
- **Members:** selecting members hides every card assigned to none of them (OR).
- **Card status:** "Complete" shows only cards with a `completedAt`; "Not
  complete" shows only cards without one; both/neither shows all.
- **Due date:** each bucket (Overdue / next day / next week / next month) is
  computed by **calendar day** relative to today; a card due **today** reads as
  "next day/week/month", never "Overdue" (Overdue = a strictly past day). Selected
  buckets OR together.
- **Activity:** each window (last 1/2/4 weeks) filters on the card's `updatedAt`;
  selected windows OR together.
- **Across dimensions is AND:** e.g. member "Ana" + label "Urgent" shows only
  cards assigned to Ana **and** carrying Urgent.
- The trigger shows an active-constraint count badge; "Clear filters" resets
  everything (keyword included).
- When the keyword matches no card titles, the popover shows the "No cards match
  your search. Try another keyword." empty state.
- Filtering must not corrupt drag-and-drop: a hidden card stays mounted (CSS
  `display:none`) so `@hello-pangea/dnd`'s index space stays aligned with the
  store's `cards` array. Cards are never removed from the array.
- A list whose cards are all narrowed out shows the "No cards match" hint, not the
  empty "No cards yet" placeholder.

## Design Notes

- Commands: none (read-only view filter).
- Queries: the board list-card query gains **one field** — `updatedAt` — needed
  for the Activity dimension. `dueDate`, `completedAt`, `members`, and `labels`
  are already on the board-view card, so Members / Card status / Due date / Labels
  need no payload change.
- API: no Server Action touched.
- Tables: none.
- Domain rules: unchanged. Completion semantics follow US-045 (`completedAt`
  null-ness is the single source of truth; no `isDone`).
- Pure logic — `lib/board-filter.ts` (extend, keep pure/no-React so it stays
  unit-tested in isolation):
  - Extend `CardFilter` to `{ labelIds, memberIds, statuses, dueBuckets, activityWindows }`.
  - `FilterableCard` gains `completedAt`, `dueDate`, `updatedAt`, `members`.
  - Add matchers: `cardMatchesMembers`, `cardMatchesStatus`, `cardMatchesDue(card, buckets, now)`,
    `cardMatchesActivity(card, windows, now)`. **`now` is a parameter, not
    `Date.now()` inside** — keeps the functions deterministic under Vitest (repo
    convention: no `Date.now()` in testable core).
  - A combined `cardMatchesAllDimensions(card, filter, now)` ANDs the dimensions;
    the call site suspends it when a keyword is active.
  - `availableMembers(lists)` — distinct members in use, sorted (mirrors
    `availableLabels`).
  - The empty state is driven by a single `cardMatchesQuery` sweep — when a
    keyword matches no card titles, the dimension list is hidden and the "no
    match" message shown. (An earlier `filterOptionsByText` option-narrowing
    helper was removed: with the dimensions suspended during search, narrowing a
    non-interactive list was dead weight and left an empty gap.)
  - Update `isFilterActive` to consider every dimension (drives the count badge).
- Store — `board-store.ts`: extend the filter state alongside `filterLabelIds`:
  add `filterMemberIds: string[]`, `filterStatuses: CardStatus[]`,
  `filterDueBuckets: DueBucket[]`, `filterActivityWindows: ActivityWindow[]`; keep
  `searchQuery`. Add toggle actions per dimension; `clearFilters` resets **all**
  of them + the keyword. All are client UI state, never server-synced, cleared on
  `reset`. Add `updatedAt` to the `ListWithCards` card type + the realtime card
  snapshot so socket-delivered/created cards carry it (else Activity would go
  stale on live updates).
- UI surfaces:
  - Rework `components/boards/board-filter.tsx` into the full popover. Prefer a
    shadcn **Popover** + **Input** (keyword) + grouped checkbox rows over the
    current `DropdownMenu` (grouped sections + a text input read better than a
    menu). Add the `popover` primitive via `npx shadcn add popover` if absent
    (repo preference: use shadcn primitives, don't hand-roll).
  - Delete `components/boards/board-search.tsx` and its mount in
    `board-header.tsx`; the keyword input now lives in the popover.
  - `list-column.tsx`: compose the new matcher — when `isSearchActive(query)`,
    match on `cardMatchesQuery` alone; otherwise
    `cardMatchesAllDimensions(card, filter, now)`. Keep the hidden-not-removed
    application and the "No cards match" hint. Pass `now` once per render.
  - `page.tsx` / `board-content.tsx` / `board-store.ts`: thread `updatedAt` onto
    the board-view card payload/type.
- **Drop-correctness invariant (non-obvious, carried from US-013):** non-matching
  cards are HIDDEN, not removed. `translateCardDrop` (`lib/dnd/apply-drop.ts`)
  keys off `source.index` into the full store `cards` array; removing filtered
  cards would desync rendered Draggable indices from that array and corrupt drop
  positions. CSS-hiding keeps every Draggable mounted at its true index.

### Included Trello quick-options (confirmed 2026-07-04)

- Members group: **"Assigned to me"** (resolves to the current viewer) and
  **"No members"** (unassigned cards). "Assigned to me" needs the current user's
  id available client-side — thread it to the popover + matcher.
- Due date group: **"No due date"** (cards without a due date).

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-065 --unit 1 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | `lib/board-filter.test.ts` (extend) — each new matcher (`cardMatchesMembers` OR/empty/no-match; `cardMatchesStatus` complete/incomplete/both/neither; `cardMatchesDue` overdue/day/week/month boundaries with a fixed `now`; `cardMatchesActivity` 1/2/4-week windows with a fixed `now`); `cardMatchesAllDimensions` AND across dimensions; keyword-suspends-dimensions rule; `availableMembers` (dedupe, sort, empty); `cardMatchesQuery` (drives the empty state); `isFilterActive` across every dimension. |
| Integration | n/a — no DB/Server Action behavior. |
| E2E | Manual browser QA (record below); automated E2E deferred — the board view has no RTL/Playwright coverage of card rendering yet (same tracked debt as US-013). |
| Platform | n/a |
| Release | `npx tsc --noEmit`, `npm run lint`, `npm test` green. |

## Harness Delta

None (uses existing epic `E04-board-parity`).

## Evidence

- Unit: `npx vitest run lib/board-filter.test.ts` → 36 passing (covering every
  matcher, `activeFilterCount`, `availableMembers`, `cardMatchesQuery`,
  AND-composition, and the day-granular "due today is not overdue" case). Full
  suite `npm test` → **674 passing** (the `filterOptionsByText` tests were removed
  with that now-unused helper — see below).
- Static: `npx tsc --noEmit` clean; `npm run lint` 0 errors in the main tree (1
  pre-existing `<img>` warning in `list-card-item.tsx`, unrelated — errors under
  `.claude/worktrees/` belong to a sibling branch checkout, not this work).
- **Browser QA (chrome-devtools, seeded 17-card demo board, 2026-07-04):** every
  dimension exercised against a known fixture — Card status (Complete → 4 Done
  cards; Not complete → 13), Members (Perf Profiler → 4; No members → 4; Assigned
  to me → 13), Due date (Overdue → 2 past-day cards; Due-in-next-day → today +
  tomorrow), Labels (Blocked → 1), Activity (last week → all 17), AND-composition
  (Perf Profiler ∧ Backend → 1, cross-checked against ground truth), keyword
  (title filter + suspended dimensions + "No cards match" empty state), the "No
  cards match" vs "No cards yet" list hint, and the count badge / Clear filters.
  Hidden-not-removed invariant confirmed (filtered cards are `display:none`; all
  22 Draggables stay mounted).
- **Two bugs found and fixed during QA:**
  1. *Popover overflow* — the `ScrollArea` did not clip in the popover context
     (its viewport grew to full content height and spilled the Labels/Activity
     groups onto the board). Replaced with a plain `max-h-80 overflow-y-auto`
     scroll container; content is now fully contained and scrolls.
  2. *Overdue used raw timestamps* — due dates are stored at **local midnight**
     (day-granular; see `card-detail-sheet` `parseDateInputValue`), so every card
     due **today** had `dueMs < nowMs` and was wrongly caught by "Overdue" all day
     while its face badge read amber "Today". `cardMatchesDue` is now day-granular
     (`startOfDay` diff), matching the card-face badge; today's cards fall into
     the forward windows instead. Locked in by a new unit test.
- **Refinements (per reviewer):** current viewer excluded from the named Members
  list (covered by "Assigned to me"); keyword search debounced ~250ms; popover
  spacing reworked into hairline-divided groups with uppercase eyebrow section
  headers (DESIGN.md surface-ladder + border hierarchy); and the search-active
  view collapses to the search box + hint (dimensions hidden, not greyed) so there
  is no empty gap above "Clear filters" — the option-narrowing behaviour and its
  `filterOptionsByText` helper were dropped as dead weight (dimensions are
  suspended during search, so a narrowed non-interactive list served no purpose).
- Implementation notes:
  - Pure matcher `lib/board-filter.ts`: dimension matchers + `cardMatchesAllDimensions`
    (all take `now`, no `Date.now()`), `availableMembers`, `cardMatchesQuery`.
  - Payload: `updatedAt` added to the board list-card query/type/store (+ a
    `new Date()` default for socket-created cards). `members` **un-capped** in the
    query (was `take: MAX_CARD_FACE_AVATARS`) so the filter matches on and derives
    options from the complete assignee set — the card face now slices to the
    avatar cap at render (`list-card-item.tsx`). This is a deliberate reversal of
    the US-030 payload cap; assignee counts per card are small so the payload
    stays bounded.
  - Store: six new filter fields + toggles + `currentUserId` (from `currentViewer.id`
    in the provider); `clearFilters` now also clears the keyword.
  - UI: `board-filter.tsx` rebuilt as a shadcn `Popover` (keyword `Input` +
    hairline-divided `Checkbox` sections in a plain `max-h-80 overflow-y-auto`
    scroll container + empty state). `board-search.tsx` deleted and unmounted from
    `board-header.tsx`.
- Platform/E2E: manual browser QA pending (board view has no RTL/Playwright card
  coverage — same tracked debt as US-013).
