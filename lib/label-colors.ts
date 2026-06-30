import type { CSSProperties } from "react";

import { BOARD_COLORS } from "@/lib/constants";

// US-051 / decision 0014 — map a stored label color (a BOARD_COLORS hex) to its
// per-hue token pair (`--label-<hue>` tint + `--label-<hue>-fg` deeper same-hue
// text, defined in app/globals.css for both themes). The mapping lives here once,
// keyed off BOARD_COLORS so the selectable palette and the token set never drift.
// Labels are data-driven (the hue is only known at runtime), so consumers apply
// the pair as inline `var(--label-*)` styles rather than static Tailwind classes.

// BOARD_COLORS names (Blue/Green/Orange/Red/Purple/Pink/Gray/Teal) are exactly
// the token hue keys, lowercased.
const HEX_TO_HUE = new Map(
  BOARD_COLORS.map((c) => [c.value.toUpperCase(), c.name.toLowerCase()] as const),
);

const FALLBACK_HUE = "gray";

// Resolve a stored color to its label hue key. Legacy / out-of-palette colors
// fall back to the neutral gray pair (decision 0014).
export function labelHue(color: string | null | undefined): string {
  if (!color) {
    return FALLBACK_HUE;
  }
  return HEX_TO_HUE.get(color.toUpperCase()) ?? FALLBACK_HUE;
}

// Tinted-chip style (Notion pattern): pale per-hue tint background + deeper
// same-hue text. Both clear AA in both themes (see globals.css). The label name
// remains the non-color channel.
export function labelChipStyle(color: string | null | undefined): CSSProperties {
  const hue = labelHue(color);
  return {
    backgroundColor: `var(--label-${hue})`,
    color: `var(--label-${hue}-fg)`,
  };
}

// Hue-indicator swatch (no text — picker rows, filter dots): the same tint
// background plus a deeper same-hue border so the pale tint keeps definition on
// the card surface. Pair with a `border` width/style class on the element.
export function labelSwatchStyle(color: string | null | undefined): CSSProperties {
  const hue = labelHue(color);
  return {
    backgroundColor: `var(--label-${hue})`,
    borderColor: `var(--label-${hue}-fg)`,
  };
}
