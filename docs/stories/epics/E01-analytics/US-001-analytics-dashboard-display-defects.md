# US-001 Analytics dashboard display defects

## Status

implemented

## Lane

normal

## Product Contract

The analytics dashboard (`/workspace/[slug]/dashboard`) must present its
event-sourced metrics truthfully. Specifically: trend coloring must reflect
whether a metric rising is good or bad; per-row and per-KPI states must
distinguish "no data" / "no SLA" from a genuine zero or success; the lead-time
detail table must not silently hide rows; and value formatting must be
consistent and unit-bearing.

This story covers the **presentation layer only**. It does not change any metric
computation or its contracted definition (see the separate high-risk item for
lead-time/cycle-time, ideal-burndown anchoring, and the lead-time-row selection
algorithm).

## Relevant Product Docs

- `docs/product/analytics.md`

## Acceptance Criteria

- **C1 — Trend polarity.** `ChangeIndicator` (`kpi-cards.tsx`) must color a
  change by per-metric polarity, not by sign alone. For Median Lead Time,
  Overdue Cards, Completed Late, and Reopen Rate an increase is a regression and
  must read as negative; for Estimation Coverage an increase is positive.
- **M4 — Neutral zero.** A `0.0%` / unchanged delta renders neutral, not green ↑.
- **M5 — No fabricated +100%.** When the previous period is `0` and current `> 0`,
  the card shows "new" / "—", not "+100%". Keep `percentChange` centralized;
  note `estimationCoverage.change` shares it.
- **M3 — No-data vs zero (KPI cards).** With no completed cards in range, lead
  time / reopen rate render an explicit empty state (e.g. "—",
  "No completed cards"), not "0m" / "0.0%".
- **C3 — "No due date" badge.** The lead-time table must render a neutral
  badge (e.g. "No due date") for completed cards that never had a due date,
  instead of the green "On time" badge. KPI counts are unaffected.
- **C2 (table-side) — Truncation notice.** When the lead-time table is capped
  (currently 100 rows), it must disclose "Showing N of M — refine filters".
  (The *selection* of which rows survive the cap is part of the high-risk item.)
- **M6 — Unit on Remaining Hours.** The "Remaining Hours" KPI must render with a
  unit and consistent formatting (no raw `.toString()`).
- **C4 — Burndown chart rendering.** The burndown chart must use the full chart
  width (not ~20%), draw undistorted markers/strokes, and carry labeled Y (hours)
  and X (date) axes, an area fill, a hover tooltip, and an explicit empty state
  for ranges with no estimated work. The chart consumes the existing
  `BurndownPoint[]` payload unchanged — the *ideal-line model* (burn-to-zero on an
  open-ended board) is out of scope here and stays with the high-risk M7 item.

## Design Notes

- Commands: none (read-only dashboard).
- Queries: none changed.
- API: none changed (Server Action payload shape unchanged; polarity is a
  presentation concern — may add a static polarity map in `kpi-cards.tsx`).
- Tables: none.
- Domain rules: unchanged. Metric math is **not** touched in this story.
- UI surfaces: `kpi-cards.tsx`, `lead-time-table.tsx`, `burndown-chart.tsx`.
- Burndown (C4): the prior chart set `padding = 40` in a `0 0 100 300` viewBox
  (80% of the width became padding) and used `preserveAspectRatio="none"`
  (markers rendered as ~18:1 ellipses). Rewritten to a measured-width viewBox
  (ResizeObserver) with proper plot margins and `vector-effect="non-scaling-stroke"`.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-001 --unit 1 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | Polarity map + formatting helpers unit-tested; `percentChange` "previous=0" path asserted. |
| Integration | n/a (no DB/Server Action behavior change). |
| E2E | Manual/Playwright (when available): regression-as-red, neutral zero, "No due date" badge, truncation notice render. |
| Platform | n/a |
| Release | n/a |

## Harness Delta

Story created from analytics review (2026-06-22). Independent senior review
confirmed all findings against source (no refutations). Metric-semantics
findings split into a separate high-risk backlog item.

## Evidence

- Review + senior verification: intake rows #1/#2, intervention #1 (approval).
- Unit proof: `lib/analytics/presentation.test.ts` (12 tests); full suite 75/75,
  `npm run build` + `npm run lint` clean.
- Manual browser QA (2026-06-22) against seeded data
  (`scripts/seed-analytics-demo.ts`, workspace slug `analytics-demo`,
  115 current-period completions):
  - **C1 polarity (DOM-verified colors):** Median Lead Time ↑20.9% → red,
    Completed Late ↑75.0% → red (risen = regression); Remaining Hours ↓9.7% → green,
    Estimation Coverage ↑10.7% → green.
  - **M5 "New":** Overdue and Reopen Rate showed "New" (no prior-period baseline).
  - **M6 unit:** Remaining Hours rendered "176h" / "0h".
  - **C3 badge:** lead-time table showed all three states — Late / On time / No due date.
  - **C2 truncation:** "Showing 100 of 115 completed cards. Narrow the date range
    or filters to see the rest."
  - **M3 + M4 (empty board filter):** Median Lead Time & Reopen Rate "— / No data";
    Overdue/Late/Coverage "→ 0.0%" neutral-gray; table "No completed cards match".
  - **C4 burndown:** rewritten chart measured at 96% width usage (was ~20%);
    labeled axes (`0h–500h`, dated X), area fill, working hover tooltip
    (e.g. "Jun 12 / Remaining 305h / Ideal 73h"), empty state on the no-data board.
  - Screenshots: `kpi-cards.png`, `no-data-state.png`, `burndown-fixed.png`
    (session scratchpad).
