# US-054 shadcn primitive conformance: tonal hover, radius literals, arbitrary-px sweep

## Status

planned

## Lane

tiny — small, mechanical conformance fixes to primitives + a few component
literals. 1 flag (existing behavior — minor restyle); no hard gate, no schema,
no logic. Part of **IN-03**.

## Product Contract

Primitives match the `DESIGN.md` component specs: buttons hover to a **lighter
same-hue tint** (not an opacity step); radii use the named tokens (`rounded-sm`/
`-md`/`-lg`), **not arbitrary px**; and one-off arbitrary widths use a token/scale
value where one fits. §68 (hover tonal), §392 (no hard-coded px when a token
exists), Shapes §289+.

- Today: `button.tsx:12` default hover is `hover:bg-primary/80` (opacity step,
  not a tonal lighter tint). Radius literals: `checkbox.tsx:18` `rounded-[4px]`;
  `button.tsx:24–26` `rounded-[min(var(--radius-md),8px)]` / `...,10px)]`.
  Scattered arbitrary widths: `card-detail-sheet.tsx` `w-[280px]`/`w-[320px]`/
  `max-w-[120px]`, `board-header.tsx` `max-w-[200px]`/`w-[260px]`,
  `board-filter.tsx` `w-[320px]`, `list-column.tsx:289` `w-[300px]` (column width).

## Relevant Product Docs

- `DESIGN.md` — Buttons §309+ (hover/pressed shift tonally on the same hue, not a
  new color/opacity), Shapes §289+ / §301+ (radius tokens), Do/Don't §392 (no
  hard-coded px when a token exists).

## Acceptance Criteria

- `button.tsx` default hover shifts to a **lighter same-hue tint** rather than
  `bg-primary/80` — e.g. a lighter brand shade (define a `--primary-hover` token,
  both themes, or a documented lighter step) so hover reads as Linear's tonal
  lighten, not a fade.
- Radius literals replaced with tokens: `checkbox.tsx` `rounded-[4px]` →
  `rounded-sm`; `button.tsx` size variants `rounded-[min(...)]` → `rounded-md`.
  (Annotate `// customized:` on shadcn-CLI files.)
- Arbitrary `w-[…]`/`max-w-[…]` swept: promote the **list-column width** to a
  named value/token (it's a recurring kanban constant), and align popover/header
  widths to the spacing scale or a small set of named widths where reasonable.
  One-off legitimate widths that have no sensible token may stay — note which and
  why.
- Light + dark correct; no visual regression; no console errors; unit suite green.

## Design Notes

- **UI surfaces:** `components/ui/button.tsx`, `checkbox.tsx`; `components/boards/
  card-detail-sheet.tsx`, `board-header.tsx`, `board-filter.tsx`,
  `list-column.tsx`. shadcn-CLI files (`button`, `checkbox`) get a
  `// customized:` note per AGENTS.md.
- For the tonal hover, prefer a real lighter shade over `brightness-*` filter
  tricks; define `--primary-hover` as a token in **both** themes, contrast-checked.
  **Directionality differs per theme:** light `--primary` is a mid-dark blue
  (`oklch(0.52 0.2 262)`) so hover goes *lighter*; dark `--primary` is already a
  *brighter* blue (`oklch(0.54 0.19 262)`) so its hover goes *lighter still*
  (raise L in each theme relative to that theme's base — "Linear lightens toward
  the accent," per DESIGN.md §68).
- The radius-literal `min()` guards exist to cap radius on small controls — a
  plain `rounded-md` is the intended token; confirm small buttons still look right.
- Commands / Queries / API / Tables / Domain rules: none.

## Dependencies

- **Hard ordering — `button.tsx` collision:** US-048 also edits `button.tsx`
  (outline `shadow-xs`). Whichever lands first, the second **rebases** onto it;
  do not develop both branches in parallel. Cleanest is to **fold both
  `button.tsx` edits into US-048** (it's the keystone and goes first) and have
  US-054 cover only `checkbox.tsx` + the board widths. Decide at sequencing time.
- `--primary-hover` adds to `globals.css` — see IN-03's `globals.css` shared-edit
  hotspot (US-049/050/051/054 all mutate `:root`/`.dark`/`@theme`).

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-054 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a; suite stays green. |
| Integration | n/a. |
| E2E | n/a — no harness. |
| Platform | Button hover is a tonal lighten; no `rounded-[…]` literals in button/checkbox; arbitrary widths reduced to tokens/named values (exceptions noted); light + dark; no console errors. |
| Release | Manual visual QA: button hover states, checkbox, popovers/headers at common widths, light + dark. |

## Harness Delta

- Documents the `button.tsx`/`checkbox.tsx` customizations (tonal hover, radius
  tokens) so a shadcn re-sync doesn't revert them.

## Evidence

_Pending implementation._
