# US-069 Whole-card & whole-header drag — drop the grip handles

## Status

implemented

## Lane

normal

## Product Contract

Cards and lists currently drag only from a dedicated grip-icon button. This
adds a control to every card face and every list header, and the grip is a
narrow target. Trello (our parity baseline) drags a card from **anywhere on the
card body** and drags a list from **its header bar**, with click-to-open (card)
and click-to-rename (list) coexisting on the same surface.

This story removes the grip buttons and makes the whole card and whole list
header draggable, without regressing the two things the grip pattern gave us:
click-to-open / click-to-rename, and **keyboard-driven drag** (the grip was the
keyboard drag entry point).

## Why this is a real change, not cleanup

`@hello-pangea/dnd` blocks a drag from *starting* on interactive elements
(`button`, `a`, `input`, …) by default. The grip pattern set
`disableInteractiveElementBlocking` on both draggables precisely because the
grip **was** a `<button>` — the prop was needed to let a button be the handle.

Making the whole surface the handle inverts that:

- **Card:** move `dragHandleProps` to the outer draggable `<div>` and **remove**
  `disableInteractiveElementBlocking`. Default blocking then keeps the nested
  controls (completion toggle, actions menu, label toggle) clickable while the
  rest of the card body initiates a drag. The card title stops being a
  `<button>` (it became one only to be the open affordance); the whole card now
  opens on click/Enter, so the title is plain text and part of the drag surface.
  Nested controls call `stopPropagation` so their clicks don't also open the
  card; the card's key handler is gated to `e.target === e.currentTarget` so a
  keypress on a nested control never double-fires open/lift.
- **List:** move `dragHandleProps` to the header bar and **keep**
  `disableInteractiveElementBlocking`, so a drag can start across the whole
  header *including over the title button* while a plain click still
  rename-edits (the library's movement threshold disambiguates). Drag stays
  disabled while the title is in its editing input (`isDragDisabled` already
  covers this).

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — card/list drag + open/rename interaction.
- `docs/ARCHITECTURE.md` — the drag-aware realtime deferral invariant and the
  float-gap ordering are untouched (this is a handle-location change only; the
  `onDragEnd` → apply-drop → Server Action path is unchanged).

## Acceptance Criteria

- A card can be dragged by grabbing anywhere on its body except its interactive
  controls (completion toggle, actions menu, label toggle); those still click.
- Clicking a card body (or focusing it and pressing Enter) opens the card
  detail. There is no grip button on the card.
- A list can be dragged by grabbing its header bar; clicking the list title
  still enters inline rename. There is no grip button on the list header.
- Keyboard drag still works: the card body and the list header are focusable
  drag handles (Space to lift, arrows to move, Space/Escape to drop/cancel) —
  the grip's keyboard role moves to the new handle, not lost.
- `canDrag` / `canSortList` still gate draggability; viewers (no drag perm) can
  still open cards (click/Enter) and the card/header is not a drag handle.
- The dnd index space is unchanged: hidden (filtered) cards still render with
  `display:none`, positions still computed by `lib/dnd/apply-drop`. No Server
  Action, ordering, or realtime change.

## Design Notes

- Files: `components/boards/list-card-item.tsx`,
  `components/boards/list-column.tsx`. No new deps, no schema, no actions.
- Card key handler composes dnd's `onKeyDown` (Space-lift) then adds Enter-open,
  and returns early unless the event originated on the card div itself.
- Cursor: `cursor-grab`/`active:cursor-grabbing` when draggable, else
  `cursor-pointer` (still openable).
- A11y: the card div carries `role="button"` + an `aria-label` naming the card;
  it also carries dnd's drag `aria-describedby`. Nested interactive controls
  under a role=button surface is the accepted Trello-pattern tradeoff.

## Validation

`scripts/bin/harness-cli story update --id US-069 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | RTL: card opens on body click + on Enter; completion/menu/label clicks do NOT open; no "Drag card"/"Drag list" grip button rendered; viewer (canDrag=false) still opens. Update `list-card-item`/`list-column` specs. |
| Integration | n/a |
| E2E | Playwright keyboard-drag harness (per repo DnD testing convention) still reorders a card and a list via the new whole-surface handle. |
| Platform | n/a |

## Harness Delta

- Updated `docs/product/boards-and-cards.md` drag/open wording (grip → whole
  surface). `AGENTS.md` / `DESIGN.md` do not document the grip explicitly, so no
  change needed there.

## Evidence

- Impl: `components/boards/list-card-item.tsx` (dragHandleProps → card body,
  removed `disableInteractiveElementBlocking`, title `<button>` → `<span>`,
  whole-card click/Enter open, stopPropagation on completion/label/menu, keydown
  gated to `target === currentTarget`), `components/boards/list-column.tsx`
  (dragHandleProps → header bar, kept `disableInteractiveElementBlocking`, header
  `aria-label` so the handle name doesn't collide with the title button).
- Unit/component (RTL, happy-dom, new): `list-card-item.test.tsx` (6) +
  `list-column.test.tsx` (3) via a new `DragDropContext`/`Droppable` test wrapper
  — body-click opens, Enter opens, completion/menu clicks do NOT open, no
  grip button, viewer still opens; list has no grip, title-click still renames,
  renders when the viewer can't sort. Full suite: **57 files / 996 tests pass**,
  `tsc --noEmit` 0 errors, eslint clean (pre-existing `<img>` warning only).
- E2E (Playwright keyboard-drag harness): `realtime-card-move.spec.ts` test 1
  (**card keyboard-drag across lists**) **passes** on the new whole-card handle
  — proves the handle relocation didn't break the keyboard sensor. `openCardDetail`
  helper updated to click the card body (`Open card <title>`) since the title is
  no longer a button.
- **Pre-existing, out-of-scope:** `realtime-card-move.spec.ts` test 2
  (mid-drag structural-deferral) fails at its rename-propagation barrier — the
  observer renders a **concatenated** title ("MarkerMarker RENAMED"). Verified by
  stashing US-069 and re-running on clean `dev`: **it fails identically there**,
  so this is a latent realtime rename-reconciliation bug, not a US-069
  regression. Flagged for a separate story.
