# US-014 In-board card search

## Status

implemented

## Lane

normal

Spec slice from `docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md`
(Theme B — Daily-use Parity, P1; second child of epic `E04-board-parity`, after
US-013 label filtering). Risk flags: existing-behavior (board render path),
weak-proof (board UI has no RTL harness). No hard gate — no schema/migration, no
auth/authz change (a read-only client-side view filter), no external systems, no
public-contract change (Server Action payloads untouched). 0–1 effective flags →
normal lane.

## Product Contract

On a board, a user can type into a header **search** box to narrow the visible
cards to those whose **title** contains the query (case-insensitive substring),
live and client-side, with no reload and no server round-trip. Clearing the box
restores every card. Search composes with the US-013 label filter via **AND**: a
card is visible only if it matches the search query *and* the active label
filter. Search is a per-viewer view concern — it never mutates data and is not
shared with other viewers.

Scope: **slice 1 is title-only.** The board-view card payload carries `title` and
`labels` but not `description`/`dueDate`/`assignees` (those live in the card
detail sheet), so searching `description` (and filtering by assignee/due date) is
a follow-up slice that first enriches the card payload (and the realtime card
snapshot). The control is built so those dimensions slot in without rework.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` ("Filtering & search" section)

## Acceptance Criteria

- A search box in the board header narrows the visible cards to those whose title
  contains the typed text (case-insensitive substring match), live as you type.
- An empty / whitespace-only query shows all cards; clearing the box restores
  every card.
- Search composes with the label filter (AND): with both active, a card is
  visible only if it matches the query *and* carries a selected label.
- Search must not corrupt drag-and-drop: a card hidden by search stays mounted
  (CSS `display:none`) so `@hello-pangea/dnd`'s index space stays aligned with
  the store's `cards` array. Cards are never removed from the array.
- A list whose cards are all narrowed out (by search and/or filter) shows a
  "No cards match" hint (not the empty "No cards yet" placeholder).

## Design Notes

- Commands: none (read-only view filter).
- Queries: none changed (operates on cards already in the store).
- API: none changed (no Server Action touched).
- Tables: none.
- Domain rules: unchanged.
- UI surfaces: new `components/boards/board-search.tsx` (header control);
  `board-header.tsx` (mounts it before `BoardFilter`); `list-column.tsx` (ANDs
  the search predicate into the existing hide + hint logic).
- Pure logic: extends `lib/board-filter.ts` with `cardMatchesQuery` and
  `isSearchActive` (title substring, trimmed + lower-cased). Unit-tested in
  isolation alongside the existing label helpers.
- Store: `searchQuery: string` + `setSearchQuery` on the board store (client UI
  state, never server-synced; cleared on `reset`). Kept separate from
  `filterLabelIds`/`clearFilters` so the two narrowing controls stay independent.
- **Drop-correctness invariant (non-obvious, shared with US-013):** non-matching
  cards are HIDDEN, not removed. `translateCardDrop` (`lib/dnd/apply-drop.ts`)
  keys off `source.index` into the full store `cards` array; removing
  search-hidden cards from the render would desync the rendered Draggable indices
  from that array and corrupt drop positions. CSS-hiding keeps all Draggables
  mounted at their true indices.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-014 --unit 1 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | `lib/board-filter.test.ts` — `cardMatchesQuery` (empty/whitespace matches all, case-insensitive substring, no-match rejects), `isSearchActive`. |
| Integration | n/a — no DB/Server Action behavior. |
| E2E | Manual browser QA (below); automated E2E deferred — the board view has no RTL/Playwright coverage of card rendering yet (same tracked debt as US-005/US-013). |
| Platform | n/a |
| Release | `npx tsc --noEmit`, `npm run lint`, `npm test` green. |

## Harness Delta

Second child of epic `E04-board-parity` (Theme B of IN-01). No new artifact
locations.

## Evidence

- Unit: `npx vitest run lib/board-filter.test.ts` → 14 passing (was 9; +5 for
  `isSearchActive` ×2 and `cardMatchesQuery` empty/whitespace, case-insensitive
  substring, no-match). Full suite `npm test` → 383 passing (was 378). `npx tsc
  --noEmit` + `npm run lint` clean.
- Manual browser QA (2026-06-24, dev server + Chrome DevTools MCP, reused the
  US-013 "Filter Board" fixture: list "To Do" with "Card A" (label **Urgent**)
  and "Card B" (no label)):
  - **Search box present:** the header rendered a "Search cards by title" box.
  - **Live title narrowing + case-insensitive:** typing `card a` left only Card A
    visible and hid Card B (lowercase query matched "Card A").
  - **No-match hint:** typing `zzz` hid both cards and showed the "No cards match"
    hint (not "No cards yet").
  - **Clear restores:** the clear (✕) button emptied the box and brought Card B
    back; the ✕ hides when the box is empty.
  - **AND with label filter:** with search `card` (matches both) plus the Urgent
    label filter active, only Card A stayed visible — confirming the two
    narrowing controls compose via AND.
  - **Drop-correctness:** hidden cards leave the accessibility tree (CSS
    `display:none`) while the `Draggable` stays mounted at its true index — same
    pattern proven for US-013.
