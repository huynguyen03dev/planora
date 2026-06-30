# 0013 Semantic success/warning status tokens

Date: 2026-06-30

## Status

Proposed

## Context

`DESIGN.md` defines exactly one semantic color token — `destructive` (red) — and
otherwise keeps the chrome neutral, with brand blue as the only chromatic accent
and tinted labels/meta-chips as the only other color spectra. But several
shipped surfaces need to express **positive** ("good"/on-time/improving) and
**cautionary** ("warning"/low-confidence/data-quality) status, and today they do
it with **ad-hoc Tailwind `green`/`red`/`amber` literals** scattered across
`kpi-cards.tsx`, `burndown-chart.tsx`, `flow-chart.tsx`, `lead-time-table.tsx`,
`data-quality-section.tsx`, and `launch-boundary-banner.tsx`. These literals are
theme-blind (no dark-mode adaptation), contrast-unverified, and duplicated — the
exact pattern `DESIGN.md` §392 forbids. There is no sanctioned token to migrate
them to. (Surfaced by the 2026-06-30 north-star audit; story US-050 under IN-03.)

## Decision

Add two semantic **status** token pairs to `app/globals.css`, in both `:root`
and `.dark`, following the established tint + deeper-same-hue-text pattern (the
`--selected-tint` / `--selected-tint-foreground` model) and the project's
both-themes + measured-AA-comment discipline (per US-042):

- `--success` / `--success-foreground` — positive status (green family).
- `--warning` / `--warning-foreground` — cautionary status (amber/orange family).

Wire `--color-success*` / `--color-warning*` aliases in the `@theme inline`
block. All ad-hoc status colors migrate to these tokens (or to `destructive`
where the meaning is error/danger). Status color always reinforces a non-color
signal (sign/arrow/icon/label), never the sole channel (WCAG 1.4.1).

These are **status** tokens for data surfaces — not new *chrome* accents: they
must not become button fills, section backgrounds, or hover surfaces (DESIGN.md
§386–388 keeps the chrome to a single brand accent).

## Alternatives Considered

1. **Reuse `destructive` + a single green, no warning token.** Rejected —
   conflates "warning" (amber, recoverable) with "error" (red, danger); the
   data-quality/low-confidence surfaces are cautions, not errors.
2. **Map status to the `--chart-*` ramp.** Rejected — the chart ramp is
   blue-biased and semantically meaningless for good/bad; success needs a green
   that reads as positive.
3. **Keep ad-hoc Tailwind literals.** Rejected — theme-blind, contrast-unverified,
   duplicated; violates §392 and the dual-theme contract.

## Consequences

Positive:

- One sanctioned vocabulary for status color; future surfaces consume tokens, not
  raw palette hex.
- Dark-mode correctness and recorded AA contrast for status color.
- Keeps the chrome's single-accent discipline intact (status ≠ chrome accent).

Tradeoffs:

- Two more token pairs to maintain in both themes (small).
- A one-time sweep of the existing ad-hoc consumers (US-050 scope).

## Follow-Up

- Implemented and contrast-verified in **US-050**; flip this decision to
  **Accepted** with the committed values + measured ratios once shipped.
- If a board/status surface later needs the same semantics, it consumes these
  tokens — no new ad-hoc color.
