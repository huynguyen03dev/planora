# US-002 Created-vs-completed delivery flow

## Status

implemented

## Lane

normal

## Product Contract

The analytics dashboard must show a **delivery-flow** signal that works for an
open-ended board and does not depend on hour-estimates: cumulative cards
*created* vs cumulative cards *first-completed* over the selected range, with the
net (created − completed) surfaced as "net open work". The existing
remaining-hours chart is demoted to a secondary, honestly-labeled view
("Remaining estimated work", with the old "ideal" line relabeled a "projection")
because it is not a true sprint burndown.

## Relevant Product Docs

- `docs/product/analytics.md` (Metrics section updated)

## Acceptance Criteria

- Engine computes per-day `created` and `completed` counts over the range,
  respecting board + member filters, and exposes `flow.points`,
  `flow.createdTotal`, `flow.completedTotal` on the analytics payload. No
  estimate dependency.
- `completed` counts only the **first** completion per card (no double-count on
  reopen→re-complete), consistent with `leadTime.totalCompleted`.
- Dashboard renders a cumulative two-line chart (created vs completed) with
  labeled axes, hover tooltip, legend, and a Created / Completed / Net-open
  summary (net > 0 reads as a regression, net < 0 as improvement).
- The remaining-hours chart is relabeled and its projection line no longer
  implies a commitment.
- Reuses the corrected chart rendering from US-001 (full width, undistorted).

## Design Notes

- Commands: none.
- Queries: none added — derived from the already-fetched `cardHistoryEvent`
  stream (`computeFlowSeries` in `lib/analytics/engine.ts`).
- API: additive payload field `flow` (no breaking change; export payload
  unchanged).
- Domain rules: member filter applied uniformly to created + completed events
  (same model as completed-metrics).
- UI surfaces: `flow-chart.tsx` (new), `burndown-chart.tsx` (relabel), shared
  `chart-utils.ts`, wired in `page.tsx` above the remaining-work chart.

## Validation

`scripts/bin/harness-cli story update --id US-002 --unit 1 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | `engine.test.ts` pins flow created/completed per-day + totals. |
| Integration | n/a (no new DB path). |
| E2E | Manual browser QA (below); no automated E2E harness yet. |
| Platform | n/a |
| Release | n/a |

## Harness Delta

New metric proposed during the analytics review after confirming the burndown
was correct-but-not-useful for an open-ended board (the user chose to add flow).
The burndown's *conceptual* model remains gated as M7 in backlog #1.

## Evidence

- Unit: `lib/analytics/engine.test.ts` (flow assertions); full suite 75/75,
  `npm run build` + `npm run lint` clean.
- Independent data check vs raw events (2026-06-22, `analytics-demo`):
  `createdTotal 103 == raw CARD_CREATED count`, `completedTotal 115 == raw
  CARD_COMPLETED == leadTime.totalCompleted`, daily points sum to totals.
- Burndown correctness re-verified earlier: `scripts/verify-burndown.ts`
  (engine vs independent replay = 0 diff; engine "now" == live card table).
- Manual browser QA: chart renders cumulative lines, hover tooltip
  ("Jun 16 / Created 81 / Completed 87"), summary Created 103 / Completed 115 /
  Net open −12 (green). Screenshot `flow-and-burndown.png` (session scratchpad).
