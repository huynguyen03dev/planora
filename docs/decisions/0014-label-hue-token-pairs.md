# 0014 Per-hue label color token pairs

Date: 2026-06-30

## Status

Proposed

## Context

Card labels are rendered as a solid fill of the raw stored hex
(`style={{ backgroundColor: label.color }}`) with hardcoded `text-white`, across
four sites (`label-mark.tsx:56/:68/:71`, `card-labels-section.tsx:99–100/:107`,
`:141`, `:249`). The stored hues are the fixed 8-color `BOARD_COLORS` palette
(`lib/constants.ts:1–9`: Blue `#0079BF`, Green `#519839`, Orange `#D29034`, Red
`#B04632`, Purple `#89609E`, Pink `#CD5A91`, Gray `#838C91`, Teal `#00AECC`).
White-on-fill **fails WCAG AA** on the lighter hues (Orange/Green/Teal) in light
theme, and the raw fill doesn't adapt to dark mode. `DESIGN.md` §140–147 /
§358–363 specifies the **Notion tinted pattern** instead: a per-hue **tint
background + deeper same-hue text**, with the name as the non-color channel.
(Surfaced by the 2026-06-30 north-star audit; story US-051 under IN-03.)

This is a distinct, larger token-contract addition than decision 0013's two
semantic pairs — 8 hues × (tint + foreground) × 2 themes = **32 measured
values** — so it gets its own decision rather than folding under 0013.

## Decision

Define a **tint/foreground token pair per `BOARD_COLORS` hue**, in both `:root`
and `.dark`, modeled on the existing `--selected-tint` /
`--selected-tint-foreground` pattern: `--label-<hue>` (tint background) +
`--label-<hue>-fg` (deeper same-hue text). Labels render via these pairs, mapping
a stored `label.color` value → its hue's pair through a lookup keyed on
`BOARD_COLORS`. Each pair clears **≥4.5:1** text contrast in **both** themes,
recorded as a measured comment in `globals.css` (per the US-042 discipline). The
label **name remains the non-color channel**, and the compact **bar form keeps
its colorblind texture** overlay.

The label color picker continues to offer exactly the `BOARD_COLORS` set, so the
token set and the selectable set stay in sync. Legacy/out-of-set stored colors
fall back to the nearest hue (or a neutral pair).

## Alternatives Considered

1. **Derive a tint + readable foreground from any stored hex at runtime.**
   Rejected — more flexible but cannot *guarantee* AA without per-render contrast
   math, and the palette is already a closed set, so the flexibility buys nothing.
2. **Fold under decision 0013 (semantic status tokens).** Rejected — different
   concern (data-driven label identity vs. semantic status), and 32 values
   warrant their own record and contrast table.
3. **Keep solid fill but compute a black/white foreground per luminance.**
   Rejected — solid saturated fills diverge from the spec's tint pattern and read
   heavier than the Notion-style chips; tint + deeper text is the §140–147 target.

## Consequences

Positive:

- Labels clear AA in both themes (fixes a real contrast defect on light hues).
- Labels adapt to dark mode and match the spec's tinted-label language.
- One durable convention: new label hues require a defined, contrast-noted pair.

Tradeoffs:

- 32 token values to define and maintain across both themes (one-time, bounded).
- Couples the label palette to a fixed hue set (already true via the picker).

## Follow-Up

- Implemented and contrast-verified in **US-051**; flip to **Accepted** with the
  per-hue measured-contrast table once shipped.
- If the label palette ever opens beyond the fixed set, revisit alternative (1)
  (runtime derivation with an AA guarantee).
