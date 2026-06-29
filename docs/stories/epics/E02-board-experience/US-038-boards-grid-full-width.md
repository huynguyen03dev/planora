# US-038 Boards-overview grid uses the full row width

## Status

implemented — 2026-06-29 (manual QA). Theme E, IN-02. Intake #27.

## Lane

tiny — layout-only. Touches already-shipped presentation (existing-behavior)
but no data, no contract, no auth, no Server Action. Pure Tailwind class
changes to the boards-overview card grid.

## Product Contract

On the boards overview (and the per-workspace boards view), the board tiles lay
out in a **responsive grid that fills the available row width** instead of a
fixed-width flex row that clung to a narrow left column on wide screens
(≥1440px). The grid auto-fills as many equal columns as fit (min ~13rem each),
so tiles grow to a comfortable size and align in clean columns; more boards fill
more of the row. No board data, ordering, navigation, or starring behavior
changes.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — Boards. Presentation note only; the board
  list/star/create contracts are unchanged.

## Acceptance Criteria

- The three board-tile containers (starred row, per-workspace section, and the
  single-workspace view) use a responsive auto-fill grid, not a fixed-width
  `flex flex-wrap` row.
- Board tiles and the "+ Create board" tile are fluid-width (`w-full`) and grow
  to fill their grid column; the fixed `w-44` (176px) cap is removed.
- At ≥1440px the grid spans the full content width with evenly-sized columns
  (measured: 5 columns of ~229px in a 1208px content area; up from fixed 176px
  tiles clinging to the left).
- No horizontal page overflow at 375px (single full-width column); 768px and
  1024px scale the column count down sensibly.
- The loading skeleton matches the new grid template and tile height so the
  load→render transition does not jump.
- Light + dark mode render correctly; no console errors; unit suite stays green.

## Design Notes

- Commands / Queries / API / Tables / Domain rules: none — presentation only.
- UI surfaces:
  - `components/boards/board-card.tsx` — tile root `h-24 w-44` → `h-24 w-full`.
  - `components/boards/boards-overview.tsx` — starred row container
    `flex flex-wrap gap-4` → `grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4`.
  - `components/boards/workspace-section.tsx` — same grid swap; create-board
    button `w-44` → `w-full`.
  - `components/boards/workspace-boards-view.tsx` — same grid swap; create-board
    button `w-44` → `w-full`.
  - `app/(authenticated)/(dashboard)/boards/loading.tsx` — skeleton grid matched
    to the new template, placeholder height `h-32` → `h-24`.
- Why auto-fill (not auto-fit): auto-fill keeps tile width bounded near the
  ~13rem min and adds columns as width grows, so a workspace with few boards
  keeps sensibly-sized tiles rather than stretching 2 cards across the whole
  monitor. The residual right-side gap with 2–3 boards is the seed data, not the
  layout — with ≥5 boards the row fills.

## Validation

`scripts/bin/harness-cli story update --id US-038 --unit 0 --integration 0 --e2e 0 --platform 1`

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — pure CSS/layout, no logic. Full suite (514) stays green. |
| Integration | n/a — no Server Action touched. |
| E2E | n/a — no harness. |
| Platform | Grid fills full width at 1512px (5 even columns); no horizontal overflow at 375px (1 column); light + dark; no console errors. |
| Release | Manual QA on the seeded demo board overview. |

## Harness Delta

None.

## Evidence

Verified on the seeded boards overview, 2026-06-29, desktop + mobile.

- **Gate:** `tsc --noEmit` clean (excl. pre-existing untracked
  `scripts/perf-measure.ts`). `eslint` on the 5 changed files: 0 errors/warnings.
  Unit suite: **514 passed**.
- **Browser QA:**
  - Before: at 1512px, fixed 176px tiles clung to the left ~45% of the content
    area, leaving the right half empty
    (`.ui-review/us038-before-1512.png`).
  - After: responsive grid computes **5 equal columns of ~229px** in a 1208px
    content area; tiles grow and align in clean columns
    (`.ui-review/us038-after-1512.png`).
  - 375px: `scrollWidth === clientWidth` (no horizontal overflow); grid collapses
    to a single full-width column (343px tiles).
  - Dark mode: tile gradients + white text and the dashed create-board tiles all
    theme correctly (`.ui-review/us038-after-dark.png`).
  - No console errors (only the expected `[realtime] Connected` log).
- Screenshots: `.ui-review/us038-before-1512.png`,
  `.ui-review/us038-after-1512.png`, `.ui-review/us038-after-dark.png`.
