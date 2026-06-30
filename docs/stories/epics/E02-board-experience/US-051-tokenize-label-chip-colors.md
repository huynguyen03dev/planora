# US-051 Tokenize label-chip colors to tint + deeper same-hue text

## Status

planned

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

_Pending implementation. Must include the per-hue measured-contrast table._
