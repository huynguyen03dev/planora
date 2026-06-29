# US-036 Tokenize raw color literals (priority chip)

## Status

implemented — 2026-06-29 (manual QA). Theme D, IN-02. Intake #25.

## Lane

normal — touches existing card rendering (existing-behavior) and a documented
design-system contract (public-contract), proof is manual QA only (weak-proof,
IN-01 residual). No hard gate: presentation-only, no field/action/schema/auth
change. Depends on US-034 (primitives) — already shipped.

## Product Contract

Card-face priority chips must use the design-system token/utility layer rather
than raw hex literals, and must remain legible (WCAG AA) in **both** light and
dark mode. The chip stays icon + text (never colour-only) and keeps its visual
language (soft tint + tinted foreground) distinct from solid label pills.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — Card face (board view): the priority chip
  is part of the card-face metadata surface.

## Acceptance Criteria

- The priority chip colours (`URGENT/HIGH/MEDIUM/LOW`) are Tailwind palette
  utilities, not raw hex (`#EF44441A`/`#B91C1C`…) applied via inline `style`.
- Each priority carries a `dark:` foreground/tint variant so the chip is legible
  on the darker card surface in dark mode (the previous dark `-700` foreground
  over a 10% tint was near-invisible on a dark card).
- Light-mode appearance is visually unchanged from before.
- No console errors; existing card-face metadata (US-030) and DnD unaffected.

## Scope decision — board-header white overlays kept by design

IN-02's Theme-D row also lists the `board-header.tsx` `border-white/*` /
`bg-white/*` / `text-white` literals as tokenization targets ("breaks theming /
likely fails AA"). On inspection these are **intentional and correct**, so they
are deliberately *not* changed:

- The header sits on `boardTheme.header`, a **colour gradient that is identical
  in light and dark mode** and is always a *dark* shade (`#0b3c74`, `#2f6d29`,
  `#7f2d20`, … — see `lib/constants.ts` `BOARD_THEME_GRADIENTS`). White
  text/controls over a guaranteed-dark colour is the standard "on-colour
  overlay" pattern (Trello-style) and passes AA on every one of the eight
  gradients.
- Converting these to **semantic** tokens would *break* the design: tokens flip
  with the theme, so `text-foreground`/`bg-background` would turn dark and become
  invisible on the colour header. The white overlay must stay theme-independent
  because the surface it sits on is theme-independent.

So the defensible tokenization here is the priority chip only; the header's
colour-on-colour pattern is left as-is by design (recorded so a future agent
doesn't "fix" it into a regression).

## Design Notes

- Commands: none.
- Queries: none.
- API: none.
- Tables: none.
- Domain rules: none.
- UI surfaces: `components/boards/list-card-item.tsx` — `PRIORITY_CONFIG` changed
  from `{ tint, fg }` raw-hex to a single `className` of Tailwind utilities
  (`bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-400`, and the
  orange/amber/blue equivalents); the chip `<span>` now composes that via `cn()`
  instead of an inline `style={{ backgroundColor, color }}`. Hex→palette mapping
  is exact (red/orange/amber/blue 500 tint, 700 fg) so light mode is unchanged.

## Validation

`scripts/bin/harness-cli story update --id US-036 --unit 0 --integration 0 --e2e 0 --platform 1`

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — presentation-only; no pure logic added. Existing `apply-drop`/`board-store` suites (64) stay green (card type untouched). |
| Integration | n/a — no query/action change. |
| E2E | n/a — no harness. |
| Platform | Priority chips render with palette utilities in light mode (unchanged) and with legible `*-400` foregrounds in dark mode; no console errors; DnD + card-face metadata unaffected. |
| Release | Manual QA on the seeded demo board. |

## Harness Delta

None.

## Evidence

Verified on the seeded demo board ("Product Roadmap"), 2026-06-29, desktop.

- **Gate:** `tsc --noEmit` clean (excl. pre-existing untracked
  `scripts/perf-measure.ts`). `eslint` on the changed file: 0 errors (only the
  pre-existing cover-image `<img>` warning). Unit suite: **64 passed**
  (apply-drop 15 + board-store 49).
- **Browser QA (computed styles via DevTools):**
  - Light: all 4 chips resolve to `bg-{red,orange,amber,blue}-500/10` +
    `text-{…}-700` — visually identical to the pre-change inline hex.
  - Dark (`<html>.dark`): foreground switches to the `*-400` variants
    (lightness ~64–80 vs the old dark `-700` ~37–47 that was near-invisible on a
    dark card) over the 15% tint — legible.
  - No console errors/warnings after reload or theme toggle.
- Screenshots: `.ui-review/us036-01-light.png`, `.ui-review/us036-02-dark.png`.
