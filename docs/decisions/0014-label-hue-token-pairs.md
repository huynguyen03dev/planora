# 0014 Per-hue label color token pairs

Date: 2026-06-30

## Status

Accepted — implemented in US-051 on 2026-06-30. Per-hue measured-contrast table
below.

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

## Measured contrast (per hue, foreground text vs its tint background)

Computed oklch→linear-sRGB→WCAG. AA normal text needs **≥4.5:1**; all 16 pairs
pass. The hue angle is derived from the stored `BOARD_COLORS` hex. Light tints sit
at L≈0.95 with deep text (L≈0.51–0.55); dark tints at L≈0.30 with bright text
(L=0.80, matching `--success-foreground` dark for token-family coherence).

| Hue | Stored hex | OKLCH hue | Light fg/tint | Dark fg/tint |
| --- | --- | --- | --- | --- |
| Blue | `#0079BF` | 244.95 | 4.61:1 | 7.34:1 |
| Green | `#519839` | 138.64 | 4.66:1 | 7.44:1 |
| Orange | `#D29034` | 71.08 | 4.66:1 | 7.23:1 |
| Red | `#B04632` | 32.62 | 4.65:1 | 7.18:1 |
| Purple | `#89609E` | 313.63 | 4.65:1 | 7.15:1 |
| Pink | `#CD5A91` | 352.70 | 4.61:1 | 7.11:1 |
| Gray | `#838C91` | 231.78 | 4.63:1 | 7.37:1 |
| Teal | `#00AECC` | 215.91 | 4.60:1 | 7.44:1 |

Foreground text vs the card surface runs higher in both themes (light 5.27–5.44,
dark 9.05–10.0), so the text is legible whether it reads against the tint or, at
the chip edge, against the card. Defined once in `app/globals.css`
(`:root` + `.dark`) and mapped via `lib/label-colors.ts` (`labelHue` →
`--label-<hue>` / `--label-<hue>-fg`). **Gray is the neutral fallback** for legacy
/ out-of-palette stored colors.

## Follow-Up

- Shipped in **US-051** (manual light/dark QA, DOM-verified token resolution per
  hue + per-hue contrast table above).
- If the label palette ever opens beyond the fixed set, revisit alternative (1)
  (runtime derivation with an AA guarantee).
