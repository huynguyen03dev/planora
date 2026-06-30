# US-051 Tokenize label-chip colors to tint + deeper same-hue text

## Status

done — implemented 2026-06-30 on `feat/us-051-tokenize-label-chips`; manual QA
passed (light + dark, DOM-verified per-hue token resolution + measured contrast).
The `text-white`-on-raw-fill AA defect is retired; the 8 `BOARD_COLORS` hues each
map to an AA-passing tint/foreground pair in both themes (decision 0014). See
Evidence.

## Lane

normal — changes already-shipped label rendering, fixes a real contrast (a11y)
defect, and **extends the token contract** (8 label-hue tint/foreground pairs ×
2 themes = 32 measured values) → carries decision **0014**. Flags: existing
behavior, weak proof (manual QA), design-token-contract. **No hard gate** — no
schema, auth, Server Action, external system, or weakened validation. (Label
colors are data-driven, but this story changes only how a stored hue is
*rendered*, not the stored value or any persistence.) Part of **IN-03**.

## Product Contract

Card labels follow `DESIGN.md`'s **Notion tinted pattern**: a per-hue **tint
background + deeper same-hue text** (modeled on `--selected-tint` /
`--selected-tint-foreground`), `rounded-sm`, with the **name as the non-color
channel**. Each label hue resolves to a tint/foreground *pair* that clears WCAG
AA in **both** themes.

- Today, labels render as the raw stored color via `style={{ backgroundColor:
  label.color }}` with hardcoded `text-white` across **four sites**:
  `label-mark.tsx:56`/`:71` (+ `text-white` at `:68`),
  `card-labels-section.tsx:99–100`/`:107` (attached-label chips, `text-white`),
  `card-labels-section.tsx:141` (toggle-list swatch), and `:249` (admin-list
  swatch). White-on-light-hue **fails AA contrast** in light theme (the stored
  palette includes light hues like Orange `#D29034` / Green `#519839`), and the
  raw color doesn't adapt to dark mode — violating §140–147 / §358–363.
- The stored hues are the fixed 8-color `BOARD_COLORS` palette
  (`lib/constants.ts:1–9`: Blue/Green/Orange/Red/Purple/Pink/Gray/Teal) — a
  closed set, so a per-hue token pair is well-defined.

## Relevant Product Docs

- `DESIGN.md` — `label-chip` §140–147 / §358–363 (per-hue tint + deeper same-hue
  text; name as non-color channel; bar form adds colorblind texture); Colors
  §203+ (the `selected-tint` analogue).
- `docs/decisions/0014-label-hue-token-pairs.md` — durable record for the 8-hue
  label token convention (status Proposed → Accepted on implementation).
- `docs/product/boards-and-cards.md` — labels; presentation only, no contract change.

## Acceptance Criteria

- The **two text-on-color chips** — `label-mark.tsx:68` (card face) and
  `card-labels-section.tsx:99` (attached chips) — render as **tint background +
  deeper same-hue text** (not solid fill + `text-white`), `rounded-sm`. These are
  the actual AA defect (white on light hues like Orange/Green). No `text-white` +
  raw `backgroundColor` literal remains (grep: 0 occurrences after).
- The **two color swatches** — `card-labels-section.tsx:141` (toggle list) and
  `:249` (admin list) — carry **no text**, so there is no contrast defect; their
  job is to *show the hue*. They may keep the raw hue, or adopt the tint for
  visual consistency, but that's a style choice, not the AA requirement.
- Each of the **8 `BOARD_COLORS` hues** maps to a **tint/foreground pair** that
  clears **≥4.5:1** text contrast in **both** light and dark (= 32 measured
  values); the mapping is defined **once** (per-hue `--label-<hue>` /
  `--label-<hue>-fg` CSS-var pairs in both themes, or a single hue→pair lookup),
  not inline-per-component. Record the per-hue measured ratios in Evidence and in
  decision **0014**.
- The **bar form** keeps its colorblind texture overlay (already good in
  `label-mark.tsx`) — preserve it.
- The color picker (`color-palette.tsx`) offers hues that all have a defined
  passing pair; its swatch hover uses a tonal shift, not `opacity` (DESIGN.md §68),
  and the active swatch's checkmark/label is the non-color signal.
- No hardcoded `text-white` or raw `backgroundColor` label literal remains; light
  + dark correct; no console errors; unit suite green.

## Design Notes

- **UI surfaces:** `components/boards/label-mark.tsx`,
  `card-labels-section.tsx`, `color-palette.tsx`. The stored `label.color` value
  and label Server Actions are **unchanged** — this maps the stored hue to a
  rendered tint/foreground pair at display time.
- **Mapping approach — locked to (a):** the picker already offers the **fixed**
  8-hue `BOARD_COLORS` set, so define a `--label-<hue>` / `--label-<hue>-fg` token
  pair per hue in both themes (cleanest, matches the spec). Map a stored
  `label.color` hex → its hue's pair via a lookup keyed on the `BOARD_COLORS`
  value; any legacy out-of-set stored color falls back to the nearest hue (or a
  neutral pair) — note the fallback. (Runtime hue-derivation was the rejected
  alternative — see decision 0014.)
- Domain rules / Commands / Queries / API / Tables: none.

## Dependencies

- Conceptually pairs with US-050 (both add token pairs to `globals.css`) but
  independent. If approach (a), reuse the same both-themes + contrast-note
  discipline.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-051 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — presentational; suite stays green (add a small unit if a hue→pair helper is introduced). |
| Integration | n/a. |
| E2E | n/a — no harness. |
| Platform | Labels render tint + deeper text (not white-on-fill); each hue AA-passes light + dark; bar texture preserved; picker hover tonal; no console errors. |
| Release | Manual visual QA on a labeled board (card face + detail), light + dark; measured-contrast table per hue in Evidence. |

## Harness Delta

- Records the project's **label-hue token convention** (each `BOARD_COLORS` hue =
  a tint/foreground pair, both themes, AA-noted) via decision **0014**.

## Evidence

**Tokens (decision 0014):** 8 `BOARD_COLORS` hues × (tint + foreground) × 2 themes
= **32 measured values** added to `app/globals.css` (`:root` + `.dark`), with
`--color-label-*` aliases wired in the `@theme inline` block and a measured-AA
comment per theme. Hue angle for each pair is derived from the stored hex; light
tints sit at L≈0.95 + deep text (L≈0.51–0.55), dark tints at L≈0.30 + bright text
(L=0.80, matching `--success-foreground` dark for token-family coherence).

**Mapping defined once:** `lib/label-colors.ts` — `labelHue(color)` maps a stored
`BOARD_COLORS` hex → its hue key (keyed off `BOARD_COLORS` so the palette and the
token set can't drift); `labelChipStyle` returns `{ backgroundColor:
var(--label-<hue>), color: var(--label-<hue>-fg) }` and `labelSwatchStyle` returns
tint bg + deeper-hue `borderColor` for no-text hue indicators. Legacy /
out-of-palette colors **fall back to the neutral gray pair**.

**Migration (4 components):**

| Site | Was | Now |
| --- | --- | --- |
| `label-mark.tsx` chip (card face) | solid fill + `text-white`, `rounded` | `labelChipStyle` tint+text, `rounded-sm` |
| `card-labels-section.tsx:99` attached chips | solid fill + `text-white`, `rounded-md` | `labelChipStyle` tint+text, `rounded-sm`; × inherits text color |
| `card-labels-section.tsx:141`/`:249` swatches | raw `backgroundColor` | `labelSwatchStyle` tint + deeper-hue `border` |
| `board-filter.tsx:82` filter dot | raw `backgroundColor` | `labelSwatchStyle` tint + deeper-hue `border` |
| `color-palette.tsx` picker | `hover:opacity-90`, `border-black/10` | `hover:brightness-95` (tonal, §68), `border-border`; active check keeps the ring as the non-color signal + a drop-shadow for glyph legibility |

The compact **bar** form in `label-mark.tsx` keeps its raw hue + colorblind
texture overlay (the AC preserve). The picker swatches keep the **saturated**
`BOARD_COLORS` hues (selecting the source identity — the AC allows raw hue for
no-text swatches); only the *display* surfaces adopt the tint language. No
`text-white` + raw-`backgroundColor` label **chip** literal remains
(grep-verified; the only residual `text-white` is the picker's checkmark glyph on
its saturated swatch, reinforced by the active ring).

**Note — a 5th site beyond the story's "four":** the board label-filter dot
(`board-filter.tsx:82`) wasn't in the story's enumerated list but is the same
no-text hue-indicator pattern, so it was migrated to `labelSwatchStyle` for
consistency.

**Measured WCAG contrast** (computed oklch→sRGB; AA normal text ≥4.5:1 — text-xs/
text-sm chips are normal, not large, so 4.5:1 applies):

| Hue | OKLCH hue | Light fg/tint | Dark fg/tint |
| --- | --- | --- | --- |
| Blue | 244.95 | 4.61:1 | 7.34:1 |
| Green | 138.64 | 4.66:1 | 7.44:1 |
| Orange | 71.08 | 4.66:1 | 7.23:1 |
| Red | 32.62 | 4.65:1 | 7.18:1 |
| Purple | 313.63 | 4.65:1 | 7.15:1 |
| Pink | 352.70 | 4.61:1 | 7.11:1 |
| Gray | 231.78 | 4.63:1 | 7.37:1 |
| Teal | 215.91 | 4.60:1 | 7.44:1 |

All 16 pairs ≥4.5:1; fg vs the card surface runs higher (light 5.27–5.44, dark
9.05–10.0).

**Manual QA — light + dark, no console errors/warnings:**

- DOM-verified `getComputedStyle` on rendered chips. The QA board's seeded labels
  used legacy Tailwind hex (`#22c55e`, `#3b82f6`…), **not** `BOARD_COLORS` values,
  so they exercised the **gray fallback** — all chips correctly resolved to
  `--label-gray`/`--label-gray-fg` (proving both the tint+text mechanism and the
  fallback). To prove the distinct per-hue pairs end-to-end, four labels were
  recolored through the real picker UI to Red / Green / Orange / Teal (the light
  hues that were the actual white-on-fill AA defect); each chip then resolved to
  its exact `--label-<hue>` / `--label-<hue>-fg` pair, confirmed against the
  document-level token values in both themes (light + `.dark`).
- The attach-list and filter swatches render tint bg + deeper-hue 1px border; the
  card-face bar keeps its texture; the × remove control inherits the chip text
  color. Dark theme: chips show deep tint + bright same-hue text, legible on the
  near-black card. The dark cascade shipped (clean `.next` restart — same stale
  Turbopack cache gotcha as US-049/050 was pre-empted).

**Automated checks (2026-06-30):** ESLint on the 4 changed components +
`lib/label-colors.ts` = 0 errors; `tsc --noEmit` clean (the lone errors are in
untracked `scripts/perf-measure.ts`/`seed-perf-board.ts`, not on this branch);
`npm test` = 523/523 pass. (`npm run build` only fails on the offline Google-Fonts
fetch in `app/layout.tsx` — an environment limitation, not a code error; types are
proven by `tsc`.)

Screenshots (scratchpad `qa051/`): `01-board-light-chips`, `02-picker-light`,
`03-carddetail-light`, `04-carddetail-dark`.
