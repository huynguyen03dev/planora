# US-048 Carry depth with the surface ladder + hairline, not drop shadows

## Status

done — implemented 2026-06-30 on `feat/us-048-depth-by-surface`; manual QA passed
(light + dark, DOM-verified). See Evidence.

## Lane

normal — changes already-shipped presentation across many surfaces and touches a
shadcn-managed primitive (`components/ui/card.tsx`). Flags: existing behavior,
weak proof (manual QA only). **No hard gate** — no schema, auth, Server Action,
external system, or weakened validation. Broad but mechanical blast radius (one
primitive correction propagates to every Card). Part of **IN-03**.

## Product Contract

Depth in Planora is carried by the **neutral surface ladder + 1px
`border-border` hairlines**, not by drop shadows. `DESIGN.md` §95/§273 is
explicit: resting cards, tiles, list columns, and form controls get surface +
hairline; **shadow appears only on genuinely floating layers** (modals,
popovers, dropdowns, sheets — elevation level 2) and on a **dragged** card (a
soft lift + slight scale). Cards are `rounded-lg`, not `rounded-xl`.

- Root cause: `components/ui/card.tsx:15` ships `rounded-xl ... shadow-xs ring-1
  ring-foreground/10` — a resting shadow + ring on every Card, at the wrong
  radius. Consumers add more resting shadow on top.

## Relevant Product Docs

- `DESIGN.md` — Elevation & Depth §273+ (level 0 = surface + hairline; shadow
  only on floating layers), Shapes §289+ (cards `rounded-lg`), Do/Don't §369+
  ("don't lean on drop shadows for hierarchy").
- `docs/product/boards-and-cards.md` — card/board presentation; no contract change.

## Acceptance Criteria

- **Base `card.tsx`**: `rounded-xl` → `rounded-lg` (and `rounded-t-xl`/`-b-xl` →
  `-lg`); remove the resting `shadow-xs`; replace `ring-1 ring-foreground/10`
  with `border border-border` (the spec's hairline). Annotate the deviation with
  `// customized: DESIGN.md depth-by-surface (US-048)` per AGENTS.md (shadcn-CLI
  file).
- **Resting shadows removed** from: `list-card-item.tsx:219` (`shadow-sm`),
  `card-placeholder.tsx:11` (`shadow-sm hover:shadow-md`), `board-card.tsx:61`
  (`hover:shadow-md`). Hover communicates via `bg-muted` / one-step surface lift,
  not shadow.
- **Form controls** `input.tsx` / `textarea.tsx`: remove resting `shadow-xs`
  (border + focus-ring only, per DESIGN.md §342–346). The `button.tsx` outline
  variant's `shadow-xs` (`:14`) is removed too.
- **Drag affordance preserved/improved**: a *dragged* card lifts to a **soft**
  shadow + slight scale (`list-card-item.tsx` dragging branch) — replace heavy
  `shadow-lg` with a softer step (`shadow-md`) + `scale-[1.02]`; list-column drag
  (`list-column.tsx:216` `shadow-xl`) softened similarly. The drag/hover shadow is
  the one sanctioned card shadow (DESIGN.md §330–331).
- **Floating layers untouched**: dialog/popover/dropdown/select/sheet shadows
  remain (elevation level 2 — explicitly allowed).
- Light + dark render correctly; in dark, depth leans on the surface ladder +
  brighter borders (shadows read weakly on dark per §285). No console errors;
  unit suite green.

## Design Notes

- **UI surfaces:** `components/ui/card.tsx`, `input.tsx`, `textarea.tsx`,
  `button.tsx` (outline `shadow-xs`); `components/boards/list-card-item.tsx`,
  `card-placeholder.tsx`, `board-card.tsx`, `list-column.tsx`.
- Audit every Card consumer after the base change — some may have been visually
  compensating for the shadow; verify tiles/feature cards still separate from the
  canvas via border alone (they will, since the canvas is `bg-background` and
  cards are `bg-card` — one ladder step + hairline).
- **Box-model watch:** `ring-1` draws *outside* the box (no layout shift);
  `border` adds 1px to the box. Swapping `ring-1 ring-foreground/10` → `border
  border-border` can nudge tight layouts by 1px — verify dense rows/grids don't
  reflow (or use `ring-1 ring-border` if a hairline-without-layout-cost is needed
  anywhere, though `border` is the spec's literal "1px border").
- Consider defining a `--shadow-drag` token (both themes) for the single
  sanctioned card shadow — make it a **distinctly softer** step than the modal
  shadow (DESIGN.md §282 sets the modal at `rgba(15,15,15,0.16) 0 16px 48px -8px`)
  so the two elevation levels don't read identically; optional, note if added.
- Commands / Queries / API / Tables / Domain rules: none.

## Dependencies

- Highest-leverage IN-03 child; sequence **first**. No hard dependency on others.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-048 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — presentational; suite stays green. |
| Integration | n/a. |
| E2E | n/a — no harness. |
| Platform | Resting cards/tiles/inputs show no drop shadow (border + surface only); dragged card lifts with soft shadow + scale; floating layers keep their shadow; cards `rounded-lg`; light + dark; no console errors. |
| Release | Manual visual QA: board (tiles, columns, drag), boards overview, card detail, forms — light + dark, before/after screenshots. |

## Harness Delta

- Documents the `card.tsx` customization (depth-by-surface) so a future shadcn
  re-sync doesn't silently reintroduce `shadow-xs`/`rounded-xl`.

## Evidence

Implemented on `feat/us-048-depth-by-surface` (9 files): base `card.tsx`
(`rounded-xl`+`shadow-xs`+`ring-1 ring-foreground/10` → `rounded-lg` +
`border border-border`; `rounded-t/b-xl` → `-lg`); resting `shadow-xs` dropped
from `input.tsx`, `textarea.tsx`, `checkbox.tsx`, and the `button.tsx` outline
variant; `card-placeholder.tsx` / `board-card.tsx` hover changed from
`hover:shadow-md` to a surface lift (`hover:bg-muted`); dragged-card affordance
`shadow-lg` → `shadow-md scale-[1.02]` (`list-card-item.tsx`) and dragged-column
`shadow-xl` → `shadow-md` (`list-column.tsx`, brand drag ring kept). All
shadcn-managed files carry a `// customized:` note. **Scope note:** `checkbox.tsx`
was not enumerated in the AC by filename but is a form control covered by the
contract (§342–346); only its resting `shadow-xs` was removed — its `rounded-[4px]`
radius literal is left for US-054.

**Automated checks (2026-06-30):** ESLint on the 9 changed files = 0 errors (the
repo-wide error count comes entirely from a stale `.claude/worktrees/` checkout,
pre-existing); `npm test` = 523/523 pass; `npm run build` compiled successfully
(the single TS error is in `scripts/perf-measure.ts`, an untracked pre-existing
script not on this branch).

**Manual QA — DOM-verified `getComputedStyle`, light + dark, no console
errors/warnings (full session, preserved):**

| Surface | Measured | Result |
| --- | --- | --- |
| Board tile (`[data-slot=card]`), light | `boxShadow: none`, border `1px`, radius `7.2px`, bg white | flat surface + hairline ✓ |
| Board tile, dark | `boxShadow: none`, border `1px` = `lab(100 0 0 / 0.1)` (white @ 10%), radius `7.2px` | brighter dark hairline per §285 ✓ |
| Board-overview card (`a[href*=/boards/]`) | `boxShadow: none`, `1px`, `7.2px` | flat tile ✓ |
| Dragged card (classes applied live) | `boxShadow` = `shadow-md` (`rgba(0,0,0,0.1) 0 4px 6px -1px, …0 2px 4px -2px`), `scale: 1.02` | soft lift + slight scale, distinct from resting ✓ |
| Card-detail modal (`[role=dialog]`) | shadow present, radius `7.2px` | floating layer shadow preserved ✓ |
| Description / comment textareas | border-only (no resting shadow) | form-control change applied ✓ |

Screenshots (scratchpad `qa/`): `01-boards-overview-light`, `02-board-light`,
`03b-card-drag-style-light` (lifted card vs flat), `04-board-dark`,
`05-card-detail-dark` (modal floats with shadow; textareas flat).
