# US-050 Define semantic success/warning tokens and retire ad-hoc green/red/amber

## Status

planned

## Lane

normal — adds to the **design-token contract** (new `--success` / `--warning`
pairs in both themes) and recolors already-shipped analytics surfaces.
Flags: existing behavior, multi-domain (analytics dashboard + any future
board/status consumer), weak proof (manual QA only). **No hard gate** — no auth,
no schema, no Server Action, no external system, no weakened validation. Carries
a durable decision (**0013**) because it extends the token vocabulary. Part of
**IN-03**.

## Product Contract

The UI has **named semantic tokens for positive ("success") and cautionary
("warning") status**, defined in both `:root` and `.dark` with measured AA
contrast, and every status color resolves through them. Today `DESIGN.md` defines
only `destructive` (red) as a semantic token; the codebase hard-codes Tailwind
`green/red/amber` ad-hoc for trends, on-time/late, and data-quality warnings —
theme-blind, contrast-unverified, and duplicated across files. After this story,
no component hard-codes a status hue.

- `DESIGN.md` §383 / "Known Gaps": new tokens must be added to both themes with a
  measured contrast note. The spec's color spectra are deliberately scarce; a
  success/warning pair is the sanctioned way to add semantic status color without
  introducing a second *chrome* accent.

## Relevant Product Docs

- `DESIGN.md` — Colors §193+ (semantic = `destructive` only today), Do/Don't
  §369+ (don't rely on color alone; add tokens to both themes with contrast note),
  Known Gaps §408+.
- `docs/product/analytics.md` — KPI / lead-time / data-quality presentation.
- `docs/decisions/0013-semantic-status-tokens.md` — the durable record for the
  new token pair (status Proposed → Accepted on implementation).

## Acceptance Criteria

- `--success` + `--success-foreground` and `--warning` + `--warning-foreground`
  (tint + deeper same-hue text, modeled on the `selected-tint` pattern) are
  defined in **both** `:root` and `.dark` in `app/globals.css`, with
  `--color-*` aliases wired in the `@theme inline` block, and a **measured WCAG
  comment** (≥4.5:1 text, ≥3:1 UI) for each pair in both themes.
- All ad-hoc status colors are migrated to the new tokens (or to `destructive`
  where the meaning is error/danger):
  - `kpi-cards.tsx:42` (trend up/down), `:73` (low-confidence warning)
  - `burndown-chart.tsx:293` (delta), `flow-chart.tsx:258` (net-open delta)
  - `lead-time-table.tsx:39` (on-time = success; `:32` late already reads as
    destructive — confirm it uses the token)
  - `data-quality-section.tsx:55,78`, `launch-boundary-banner.tsx:7` (amber
    warning blocks)
- **State is never color-only** (WCAG 1.4.1): trend/delta carry an arrow/▲▼ glyph
  or sign, warnings carry an icon/label — color reinforces, never sole channel.
  (Most consumers already pair the color with a glyph/sign — verify each by
  inspection and add the signal only where missing; don't assume.)
- Light + dark render correctly; no console errors; unit suite stays green.

## Design Notes

- **UI surfaces:** `app/globals.css` (token definitions) + the analytics
  consumers listed above. Token-only in `globals.css`; **no hard-coded hex in
  components** afterward.
- **Hue choice:** success ≈ a green that clears AA on the card surface in both
  themes; warning ≈ amber/orange. Follow US-042's method: pick OKLCH start
  values, compute sRGB contrast, adjust L until each pair passes, record the
  measured ratio in the comment. The green should be distinct from the
  blue-biased `--chart-*` ramp.
- Keep the **chrome** neutral: success/warning are *status* tokens for data
  surfaces, not new chrome accents — do not use them as button fills, section
  backgrounds, or hover surfaces (DESIGN.md §386–388).
- Domain rules / Commands / Queries / API / Tables: none.

## Dependencies

- **Blocks US-049** — US-049's "completed" flow series consumes the `--success`
  token this story defines; land US-050 first.
- Touches the same chart files as US-049 (`burndown-chart.tsx`,
  `flow-chart.tsx`) and the same `globals.css` `:root`/`.dark`/`@theme` regions as
  US-051/US-054 — see IN-03's `globals.css` shared-edit hotspot note; sequence
  these adjacent.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-050 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — token values + presentational swaps; suite stays green. |
| Integration | n/a. |
| E2E | n/a — no harness. |
| Platform | Success/warning tokens resolve in both themes; all listed consumers recolor via tokens; non-color signal present on every status; measured AA recorded; no console errors. |
| Release | Manual visual QA of the analytics dashboard (KPI, lead-time, data-quality, charts), light + dark, with the measured-contrast table in Evidence. |

## Harness Delta

- Records the project's **semantic-status-token convention** via decision 0013;
  future status color must consume `--success`/`--warning`, not raw palette hex.

## Evidence

_Pending implementation. Must include the committed token values + measured WCAG
contrast table (per US-042's precedent)._
