# US-044 Compact card tiles so more cards fit on screen

## Status

implemented — 2026-06-29 (manual QA, browser-verified). Builds on US-037.

## Lane

normal (with stronger validation) — changes already-shipped card-tile
presentation (existing-behavior) and client-visible density (public-contract);
proof is manual QA (weak-proof). 3 flags, **no hard gate**: no schema, no
auth/authz, no Server Action, no external system, no weakened validation. Must
not regress the drag-aware realtime invariant when touching card components.

## Product Contract

Board card tiles are **dense** like Trello's (~36–76px) instead of today's ~100px,
so roughly twice as many cards are visible per column without scrolling. The same
information is conveyed — labels, title, priority, due date, checklist/comment
counts, member avatars — but in a tighter layout led by **compact color-bar
labels** that expand to text on demand.

- Today (`list-card-item.tsx`) labels are always full-text pills (`px-2 py-0.5`)
  that wrap to multiple rows, padding is `px-3 py-3` (12px), and priority sits on
  its own row — together driving tall tiles.
- This builds directly on **US-037** (info-density footer): the metadata footer
  pattern stays; this story tightens the labels and spacing around it.

## Relevant Product Docs

- `docs/design/planora-vs-trello-gap-analysis.md` — Gap 3.
- `docs/design/trello-board-ui-reference.md` §5 (card tile: 8px padding, 40×8px
  compact label bars expand-on-click, 4px-gap icon+count footer) and §7.3
  (colorblind label texture).
- `docs/product/boards-and-cards.md` — Cards.

## Acceptance Criteria

- Labels render as **compact color bars** (~`h-2 w-10 rounded`, the 40×8px
  analogue) by default, expandable to text pills (see state AC below).
- **Color is not the sole indicator (WCAG 1.4.1) — required, not optional:**
  compact bars carry a non-color channel. Mandate **one** of: (a) a colorblind
  **texture/pattern overlay** per label color (the reference §7.3 approach), or
  (b) a short text label kept on/over the bar. Plus an accessible name
  (`aria-label`/`title` = label title) for screen readers in all cases.
- **Expand state is a board-level "expand labels" preference** (single decision,
  shared by all cards, **survives realtime re-renders**) — not per-card local
  `useState`, which can flicker on the per-drag-tick `memo` re-render of all cards.
  If a per-card toggle is chosen instead, it must be proven not to reset during a
  drag. Record where the preference is stored.
- The expand **control is the card-face labels themselves** (Trello parity): the
  wrapped labels are a `<button>` — a plain click flips the board-level
  preference, it is **keyboard-operable**, and it must **not hijack** the card's
  open-detail click (the title button) or block the drag. (An earlier standalone
  toolbar "Labels" button was removed in favour of this on-card toggle.)
- Card content padding tightens to **`p-2`** (8px); the label/title/footer stack
  loses the extra vertical room.
- **Priority already lives in the meta footer** (`list-card-item.tsx`) — keep it
  there with the flag icon; ensure it stays in the footer under the denser layout
  (do **not** re-introduce a separate priority row).
- A labeled card with a title and one badge is **noticeably shorter** than today
  (target ≤ ~76px vs ~100px); plain title-only cards approach ~36–48px.
- **Cover behavior on compact tiles is specified:** the `h-20` (80px) cover would
  dominate a 36px tile — decide and document (keep `h-20`, or shrink on compact)
  so a covered card isn't contradictory.
- The US-037 footer (counts + capped avatar stack) and all data shown are
  preserved; nothing is dropped, only made denser.
- **Drag has no reflow:** `card-placeholder.tsx` (today hardcodes `p-3`) is
  updated to match the new compact padding so the placeholder height equals the
  dragged card; the **drag-aware deferral invariant** is verified on a labeled
  multi-card board (no jump on dragstart, no regression while dragging).
- 375px no horizontal overflow; light + dark correct; no console errors; unit
  suite green.

## Design Notes

- Commands/Queries/API/Tables/Domain rules: none.
- **UI surfaces:** `components/boards/list-card-item.tsx` (label rendering,
  padding) and `components/boards/card-placeholder.tsx` (padding must track the
  card). Compact↔expanded is a **board-level preference** (recommended: board
  store, so it survives realtime re-renders and is one decision for all cards) —
  not per-card `useState`.
- **Shared primitive:** extract a `LabelChip`/`LabelBar` component
  (`variant: "bar" | "chip"`) used by both this story (card face) and **US-043**
  (card detail) so the 1.4.1 non-color treatment + accessible name are implemented
  **once** and stay consistent.
- Priority is **already** in the meta footer — leave it; keep the
  due/checklist/comment classes and the `AvatarGroup` from US-037. Layout density,
  not a data change.
- Cover image is `h-20`; decide its compact behavior (AC) and keep the drag
  placeholder height in sync.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-044 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — presentational; any extracted label/meta helper gets a small test. Full suite stays green. |
| Integration | n/a. |
| E2E | n/a — no harness. |
| Platform | Cards visibly shorter; labels compact with expand-on-click; priority in the meta footer; all data preserved; drag-drop unaffected; mobile + light/dark; no console errors. |
| Release | Manual QA on a seeded multi-card board (before/after card-count-per-viewport). |

## Evidence

### What shipped

- **Compact label bars by default.** Labels render as `h-2 w-10` color bars
  (the 40×8 analogue) via a new shared primitive `components/boards/label-mark.tsx`
  (`<LabelMark variant="bar" | "chip">`). The board-level "expand labels" toggle
  flips every card to full text pills (`variant="chip"`).
- **Non-color channel (WCAG 1.4.1) — texture, not color alone.** Each bar carries
  a deterministic stripe/dot texture derived from the label color (same color →
  same texture everywhere), so colorblind users distinguish labels by pattern, not
  hue (the reference §7.3 / Trello colorblind-mode analogue). Every bar also has
  `role="img"` + `aria-label`/`title` = the label name for screen readers. Chips
  convey identity via visible text, so they need no overlay.
- **Expand state is a board-level preference**, held in the board store
  (`expandLabels` + `toggleExpandLabels`, `board-store.ts`), **not** per-card
  `useState` — so it survives realtime re-renders and cannot flicker on the
  per-drag-tick `memo` re-render. `ListCardItem` reads it via a store selector;
  the value is constant during a drag, so it adds no drag-time re-renders.
- **The control is the card-face labels themselves (Trello parity).** The wrapped
  labels on each card are a `<button>` (`list-card-item.tsx`) carrying
  `aria-pressed` + a dynamic `aria-label` ("Expand labels to show names" /
  "Collapse labels to color bars") — never color-only — and a
  `focus-visible:ring`. A plain click flips the board-wide `expandLabels`, so
  clicking any card's labels expands/collapses every card at once. It does not
  hijack the card's open-detail click (that lives on the separate title button)
  and it does not block dragging: the `Draggable` sets
  `disableInteractiveElementBlocking`, so a press-drag on the label area still
  moves the card while a click still toggles. (The earlier standalone toolbar
  "Labels" button, `board-label-toggle.tsx`, was removed.)
- **Tighter spacing.** `CardContent` padding `px-3 py-3` → `p-2`, stack
  `space-y-2` → `space-y-1.5`. Removed `size="sm"` from the card `<Card>`: its
  `data-[size=sm]:py-4` is a *variant* class that the `py-0` override could not
  beat, silently padding ~32px back onto every tile — that removal is what makes
  the tile actually compact.
- **Priority stays in the meta footer** (unchanged); no separate priority row was
  re-introduced. The US-037 footer (counts + capped avatar stack) is preserved.
- **Cover behavior (decision):** the cover image shrinks from `h-20` (80px) to
  `h-10` (40px) on the compact tile so an 80px image can't dominate a ~48px tile,
  while still reading as a cover.
- **Drag / no-reflow:** the live drag placeholder is `@hello-pangea/dnd`'s
  `dropProvided.placeholder`, which is sized from the *measured dragged node* — so
  the compact card automatically gets a compact placeholder and the board does not
  reflow on drag. (The custom `card-placeholder.tsx` is **unused dead code**; its
  padding was updated to `p-2` for consistency regardless.)

### Measured (browser, authenticated board over the Blue gradient)

| Tile | Before | After |
| --- | --- | --- |
| Title-only card | ~80px | **48px** |
| Labeled card (2–4 labels, no meta) | ~100px | **62px** |

Both well under the AC targets (~36–48px plain, ≤~76px labeled).

### Verified

- `.ui-review/us-044-collapsed-bars.png` — compact textured bars, distinct
  per-color patterns (green dotted, blue solid, purple/orange diagonal stripes),
  cards visibly shorter.
- `.ui-review/us-044-expanded-pills.png` — clicking one card's labels expands
  **every** card board-wide to text pills (Feature/Backend, Bug/Feature/Design/Urgent).
  (Revised post-US-065: the toggle is now the on-card labels, Trello-style; the
  standalone toolbar "Labels" button was removed.)
- `.ui-review/us-044-dark-bars.png` — dark mode (forced `.dark`, since US-046
  ships the switcher): dark card surfaces, readable text, textures stay legible.
- 375px: no horizontal overflow (`scrollWidth === innerWidth`). No console
  errors/warnings. Unit suite green (523 passing); changed files lint clean
  (only the pre-existing `<img>` cover warning).

## Harness Delta

`expandLabels` board-level preference lives in the board store
(`board-store.ts`). `components/boards/label-mark.tsx` is the shared label
primitive (`bar`/`chip` variants) carrying the 1.4.1 non-color treatment +
accessible name once — **US-043** (card detail) should adopt it rather than
re-roll label rendering.
