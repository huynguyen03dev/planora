# US-013 In-board card filtering

## Status

implemented

## Lane

normal

Spec slice from `docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md`
(Theme B — Daily-use Parity, P1; first child of the new epic `E04-board-parity`).
Risk flags: existing-behavior (board render path), weak-proof (board UI has no
RTL harness). No hard gate — no schema/migration, no auth/authz change (a
read-only view filter), no external systems, no public-contract change (Server
Action payloads untouched). 0–1 effective flags → normal lane.

## Product Contract

On a board, a user can narrow the visible cards by **label**: selecting one or
more labels shows only cards carrying at least one of them (OR), live and
client-side, with no reload and no server round-trip. Clearing the filter
restores every card. The filter is a per-viewer view concern — it never mutates
data and is not shared with other viewers.

Scope: **slice 1 is label-only.** The board-view card payload carries `labels`
but not `dueDate`/`assignees` (those live in the card detail sheet), so filtering
by assignee and due date is a follow-up slice that first enriches the card
payload (and the realtime card snapshot). The toolbar is built so those
dimensions slot in without rework.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` (new "Filtering" section)

## Acceptance Criteria

- A "Filter" control in the board header lists the labels actually in use on the
  board; selecting labels hides every card that has none of them, live.
- Label selection is OR: a card stays visible if it has any selected label.
- An empty selection shows all cards; "Clear filters" resets to that state.
- The active filter shows a count badge; the control is hidden entirely when the
  board has no labels yet.
- Filtering must not corrupt drag-and-drop: a card hidden by the filter stays
  mounted (CSS `display:none`) so `@hello-pangea/dnd`'s index space stays aligned
  with the store's `cards` array. Cards are never removed from the array.
- A list whose cards are all filtered out shows a "No cards match the filter"
  hint (not the empty "No cards yet" placeholder).

## Design Notes

- Commands: none (read-only view filter).
- Queries: none changed (operates on cards already in the store).
- API: none changed (no Server Action touched).
- Tables: none.
- Domain rules: unchanged.
- UI surfaces: new `components/boards/board-filter.tsx` (header control);
  `board-header.tsx` (mounts it); `list-column.tsx` (applies the hide + hint);
  `list-card-item.tsx` (new `hidden` prop → CSS `display:none`).
- Pure logic: `lib/board-filter.ts` — `cardMatchesFilter`, `isFilterActive`,
  `availableLabels` (the distinct in-use labels, derived from the store so there
  is no extra fetch and no prop drilling). Unit-tested in isolation.
- Store: `filterLabelIds: string[]` + `toggleLabelFilter` / `clearFilters` on the
  board store (client UI state, never server-synced; cleared on `reset`).
- **Drop-correctness invariant (non-obvious):** non-matching cards are HIDDEN,
  not removed. `translateCardDrop` (`lib/dnd/apply-drop.ts`) keys off
  `source.index` into the full store `cards` array; removing filtered cards from
  the render would desync the rendered Draggable indices from that array and
  corrupt drop positions. CSS-hiding keeps all Draggables mounted at their true
  indices.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-013 --unit 1 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | `lib/board-filter.test.ts` — `cardMatchesFilter` (empty matches all, OR semantics, no-match rejects), `isFilterActive`, `availableLabels` (dedupe, name-sort, first-seen snapshot, empty). |
| Integration | n/a — no DB/Server Action behavior. |
| E2E | Manual browser QA (below); automated E2E deferred — the board view has no RTL/Playwright coverage of card rendering yet (same tracked debt as US-005). |
| Platform | n/a |
| Release | `npx tsc --noEmit`, `npm run lint`, `npm test` green. |

## Harness Delta

Introduces epic `E04-board-parity` (first Theme B child of IN-01).

## Evidence

- Unit: `npx vitest run lib/board-filter.test.ts` → 9 passing. Full suite
  `npm test` → 378 passing (was 369; +9). `npx tsc --noEmit` + `npm run lint`
  clean.
- Manual browser QA (2026-06-24, dev server + Chrome DevTools MCP, fresh signup
  → workspace "Filter WS" → board "Filter Board" → list "To Do" → cards "Card A"
  (label **Urgent**) and "Card B" (no label)):
  - **Hidden when empty:** before any label existed the header had no Filter
    control (component returns null on zero available labels).
  - **Appears with labels:** after creating + attaching "Urgent", the "Filter
    cards by label" control rendered in the header.
  - **Filter hides non-matching:** selecting "Urgent" left only Card A visible,
    hid Card B, and the button showed an active count badge "1".
  - **Multi-toggle:** the menu stayed open while toggling (onSelect preventDefault).
  - **Clear restores:** "Clear filters" brought Card B back and cleared the badge.
