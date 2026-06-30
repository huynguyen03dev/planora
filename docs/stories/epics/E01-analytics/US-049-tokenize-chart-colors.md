# US-049 Tokenize analytics chart colors to the `--chart-*` tokens

## Status

planned

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
  tokens — no inline hex remains in these files. Burndown line → `--chart-1`.
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

_Pending implementation._
