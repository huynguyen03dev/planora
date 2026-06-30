# US-054 shadcn primitive conformance: tonal hover, radius literals, arbitrary-px sweep

## Status

done — implemented 2026-06-30 on `feat/us-054-primitive-conformance`; manual QA
passed (light + dark, no console errors). The default button (and the brand badge
link) now hover to a **lighter same-hue tint** via a new `--primary-hover` token
(both themes, AA-measured); all `rounded-[…]` radius literals in `button.tsx` /
`checkbox.tsx` are replaced with `rounded-md` / `rounded-sm`; and the last
arbitrary-px width (`dropdown-menu` `min-w-[96px]`) plus the cleanly-mappable rem
max-widths in `card-detail-sheet` / `list-column` are promoted to spacing-scale
tokens. See Evidence.

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

**Scope note — the px-width inventory had already shrunk.** The story's "Today"
list (`card-detail-sheet` `w-[280px]`/`w-[320px]`/`max-w-[120px]`, `board-header`
`max-w-[200px]`/`w-[260px]`, `board-filter` `w-[320px]`, `list-column` `w-[300px]`)
was written before US-052/US-048 landed; those passes already swept every one of
those px literals to rem/scale values. A fresh grep (`rounded-\[`, `w-\[Npx\]`,
`hover:bg-primary/`) found the genuinely-remaining set, which is what this story
fixes.

**1 — Tonal hover (new `--primary-hover` token).** `button.tsx` default and
`badge.tsx` default-link hover changed from `bg-primary/80` (an opacity fade) to
`bg-primary-hover` (a lighter same-hue step), per DESIGN.md §68 ("Linear lightens
toward the accent"). The token raises L in each theme relative to that theme's
base:

| Theme | `--primary` (base) | `--primary-hover` | Direction | Hover vs `primary-foreground` |
| --- | --- | --- | --- | --- |
| Light | `oklch(0.52 0.2 262)` | `oklch(0.56 0.2 262)` | lighter (+0.04 L) | **4.62:1** (AA) |
| Dark | `oklch(0.54 0.19 262)` | `oklch(0.565 0.19 262)` | lighter still (+0.025 L) | **4.51:1** (AA) |

Both stay AA (≥4.5:1) even on the transient hover. `@theme inline` maps
`--color-primary-hover: var(--primary-hover)`. DOM-verified the token resolves
lighter than base in both themes (light `lab(46.81)` > `lab(42.04)`; dark
`lab(47.60)` > `lab(44.63)`), and the compiled CSS emits the rule
`hover:bg-primary-hover { &:hover { background-color: var(--primary-hover) } }`
for both the button and the `&:is(a)` badge link.

**2 — Radius literals → tokens.** `checkbox.tsx` `rounded-[4px]` → `rounded-sm`
(small-chip token, ≈4.3px). `button.tsx` size variants (`xs`, `sm`, `icon-xs`,
`icon-sm`) `rounded-[min(var(--radius-md),8px|10px)]` → `rounded-md`: the `min()`
guard never clamped (`--radius-md` ≈ 5.76px is already below the 8/10px cap), so
the result is identical. DOM-verified a default-size button renders
`border-radius: 5.76px` (= `--radius-md`). shadcn-CLI files carry a `// customized:`
note (AGENTS.md).

**3 — Arbitrary px / rem widths → scale tokens (pixel-identical).**
`dropdown-menu.tsx` `min-w-[96px]` → `min-w-24` (6rem; the last px-literal width
in the codebase; `// customized:` note). Cleanly-mapping rem max-widths:
`card-detail-sheet` `max-w-[14rem]`→`max-w-56`, `max-w-[15rem]`→`max-w-60` (×2),
`max-w-[10rem]`→`max-w-40` (×2); `list-column` `max-w-[20rem]`→`max-w-80`.

**Documented exceptions (kept):** `scroll-area` `rounded-[inherit]` (a CSS keyword,
inherits the parent radius — not a px literal); `card-detail-sheet`
`max-w-[min(96vw,768px)]` / `h-[min(90vh,820px)]` (the US-052 reading-column /
height composite — no single token expresses it); `list-column` `w-[80vw]` (the
fluid-on-phones width that makes the next column peek — viewport-relative, no
token). The desktop column width is `sm:w-80` — already a named scale token.
Secondary/destructive/ghost button hovers were left as-is (out of this AC, which
names the **default** hover; their tonal-vs-muted treatment is a separate call).

**Post-sweep grep (components/ + app/):** zero `hover:bg-primary/` opacity hovers;
zero `w-[Npx]`/`max-w-[Npx]`/`min-w-[Npx]` literals; the only `rounded-[…]` hits
are `rounded-[inherit]` and the `// customized:` comment lines.

**Automated checks (2026-06-30):** `tsc --noEmit` clean (lone errors are in
untracked `scripts/perf-measure.ts`/`seed-perf-board.ts`, not this branch); ESLint
on the 6 touched component files = 0 errors (3 pre-existing `<img>` LCP warnings on
the card cover, untouched); `npm test` = 523/523 pass.

**Manual QA — light + dark, no console errors:** clean-restarted the dev server
(a new `@theme` token + utility needs a Turbopack rebuild, not just HMR — the
`stale-Turbopack-CSS-cache` gotcha) and reverified. Boards overview, board, and
card-detail dialog all render correctly in both themes; Select triggers at the new
`max-w-60`/`max-w-40` widths and the labels/buttons show no regression. Screenshots
in scratchpad `qa054/`: `01-card-detail-light`, `02-card-detail-dark`.
