# US-049 Tokenize analytics chart colors to the `--chart-*` tokens

## Status

done — implemented 2026-06-30 on `feat/us-049-tokenize-chart-colors`; manual QA
passed (light + dark, DOM-verified token resolution + measured contrast). The
burndown line uses **`--chart-2`**, not `--chart-1` as originally specced —
`--chart-1` is the palest ramp rung and fails WCAG 3:1 on the white card
(1.81:1); see Evidence.

## Lane

tiny — replaces three hard-coded hex literals in chart components with the
`--chart-*` design tokens that already exist in `app/globals.css`. 1 flag
(existing behavior — chart series recolor); no hard gate, no schema, no logic
change. Mechanical, near-zero blast radius. Part of **IN-03**.

## Product Contract

Analytics charts draw their series from the project's design tokens, not from
inline hex strings. `DESIGN.md` (§392) forbids hard-coding hex when a token
exists — so series colors must resolve through tokens and adapt to light/dark
like the rest of the surface.

- Today: `burndown-chart.tsx:14` `const LINE_COLOR = "#3b82f6"`;
  `flow-chart.tsx:16` `CREATED_COLOR = "#6366f1"`, `:17` `COMPLETED_COLOR =
  "#10b981"`. These are raw Tailwind-palette hex, theme-blind, and bypass the
  token system.
- **Ramp caveat (why this isn't a pure `--chart-*` swap):** the `--chart-1…5`
  tokens (`globals.css:85–89` / `:131–135`) are all the **same blue family**
  (hue ≈ 251–265, only lightness varies) — a *monochrome value ramp*, not a
  categorical multi-hue palette. The burndown's single line maps cleanly to
  `--chart-1`, but the flow chart's **created-vs-completed** needs two
  *categorically distinct* colors, which no two `--chart-*` tokens provide.
  Resolution (option b, chosen over widening the ramp): **completed →
  `--success-foreground`** (the *deep saturated* green from US-050, ≈ today's
  `#10b981` — NOT `--success`, which is the pale tint and would render a
  near-invisible line/area); **created → `--chart-2`** (a blue, "work coming
  in"). This consumes US-050's token, so US-049 **depends on US-050**.

## Relevant Product Docs

- `DESIGN.md` — §392 (no hard-coded hex when a token exists); chart tokens are
  the only sanctioned multi-series color source alongside the neutral ladder.
- `docs/product/analytics.md` — chart presentation; no contract change.

## Acceptance Criteria

- `burndown-chart.tsx` and `flow-chart.tsx` series colors resolve from CSS
  tokens — no inline hex remains in these files. Burndown line → **`--chart-2`**
  (revised from `--chart-1`: that rung measures only 1.81:1 on the white card,
  below the 3:1 graphical-object bar; `--chart-2` clears it at 3.76:1 light /
  4.73:1 dark and matches the prior `#3b82f6`. Still a `--chart-*` token, so the
  contract — series resolve through tokens, no hex — holds).
- The created-vs-completed flow keeps **two categorically distinct** series:
  **completed → `--success-foreground`** (deep saturated green for a visible
  stroke/area — not the pale `--success` tint), **created → `--chart-2`** (per the
  ramp caveat above). Verify they read as clearly different in both themes (not
  two blues) and that the completed line is fully legible.
- Charts render correctly in **light and dark**; series legibility holds on the
  card surface in both themes.
- No console errors; unit suite stays green (analytics engine tests untouched).

## Design Notes

- **UI surfaces:** `app/(authenticated)/(dashboard)/workspace/[slug]/dashboard/components/burndown-chart.tsx`,
  `flow-chart.tsx`. These are **hand-rolled `<svg>`** (e.g. `burndown-chart.tsx:152`),
  so `var(--token)` works **directly** in `fill`/`stroke` attributes — no
  `getComputedStyle` read or hex literal needed.
- The semantic *delta* coloring (`burndown-chart.tsx:293`,
  `flow-chart.tsx:258` — green/red good/bad text) is **out of scope here** — that
  belongs to **US-050** (semantic status tokens). This story is series color only.
- Domain rules / Commands / Queries / API / Tables: none.

## Dependencies

- **Hard dependency: US-050 must land first** — the completed series consumes the
  `--success` token US-050 defines. (Also pairs with US-050's delta-color sweep in
  the same two files, so sequence them adjacent to avoid a merge collision.)

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-049 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — no logic change; analytics suite stays green. |
| Integration | n/a. |
| E2E | n/a — no harness. |
| Platform | Burndown + flow charts render from `--chart-*`, two distinct flow series, light + dark, no console errors. |
| Release | Manual visual QA of the analytics dashboard, light + dark. |

## Harness Delta

None.

## Evidence

**Migration (2 files, 3 hex literals retired):**

| Series | Was | Now | File |
| --- | --- | --- | --- |
| Burndown remaining-work line | `#3b82f6` | `var(--chart-2)` | `burndown-chart.tsx:14` |
| Flow "Created" line | `#6366f1` | `var(--chart-2)` | `flow-chart.tsx:16` |
| Flow "Completed" line | `#10b981` | `var(--success-foreground)` | `flow-chart.tsx:17` |

Each constant feeds every usage site in its file (stroke, hover marker `fill`,
legend swatch / tooltip-dot inline `style`, and the burndown gradient `stop`s),
so the single-constant swap tokenizes all of them. No `#hex` /
`indigo|emerald|sky|blue|green-N` literal remains in either file (grep-verified).

**Why the burndown line is `--chart-2`, not `--chart-1` (spec revision):** the
`--chart-1…5` ramp is a monochrome blue value-ladder (only lightness varies);
`--chart-1` is its palest rung (L\*≈0.81) and was designed as a light *fill*
step, not a foreground stroke. Measured on the white card it is **1.81:1** —
below WCAG 1.4.11's 3:1 for graphical objects, and a regression from the prior
`#3b82f6` (~3.7:1). `--chart-2` is the closest legible rung and is what the flow
chart already uses for its primary blue series, so both single-blue lines now
share one token.

**Measured WCAG contrast** (computed oklch→sRGB; graphical objects need ≥3:1):

| Series | Token | Light vs card | Dark vs card |
| --- | --- | --- | --- |
| Burndown / Created | `--chart-2` | 3.76:1 | 4.73:1 |
| Completed | `--success-foreground` | 5.54:1 | 10.0:1 |

`--chart-1` for reference: 1.81:1 light (rejected) / 9.83:1 dark. The two flow
series are categorically distinct hues (blue vs green) in both themes — their
low luminance ratio to each other (1.47 light / 2.11 dark) is irrelevant because
hue, not lightness, separates them.

**Manual QA — light + dark, no console errors/warnings:**

- DOM-verified `getComputedStyle` on the rendered SVG paths: flow "Created" =
  `var(--chart-2)` → blue `lab(54.2 13.3 -74.7)`; flow "Completed" =
  `var(--success-foreground)` → green (light `lab(43.8 -45.8 30.9)`, dark
  `lab(78.5 -38.9 25.3)`) — the green correctly swaps to the brighter dark-theme
  value. Legend swatches resolve through the same tokens.
- The burndown chart is in its empty state in the QA workspace (no estimated
  cards in range), so its line is not exercised by this dataset; its
  `--chart-2` token resolves at the document level and the identical token +
  SVG-attribute mechanism is proven legible by the flow "Created" line, which
  renders as a clean blue on the card in both themes.
- No deviation in the semantic *delta* text (burndown "Change", flow "Net open")
  — that coloring is US-050's and was left untouched ("Net open: +2" still
  renders destructive-red).

**Automated checks (2026-06-30):** ESLint on both changed components = 0 errors;
`npm test` = 523/523 pass; `npm run build` = app "Compiled successfully" (the lone
TS error is in `scripts/perf-measure.ts`, an untracked pre-existing script not on
this branch).

Screenshots (scratchpad `qa049/`): `01-light-full`, `03-dark-flow`.

**Note:** a stale Turbopack cache initially served a CSS bundle predating US-050's
`--success-foreground` token (the completed line rendered `stroke: none`);
resolved by clearing `.next` and restarting the dev server — source was always
correct. Same gotcha as US-050.
