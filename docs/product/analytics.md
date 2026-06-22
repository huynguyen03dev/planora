# Analytics

The workspace analytics dashboard (`/workspace/[slug]/dashboard`) reports
delivery health from an **append-only event stream**, not from live card state.
Computation lives in `lib/analytics/engine.ts`; events are captured by
`lib/card-history.ts`.

## Event sourcing

Every meaningful card change appends a `CardHistoryEvent` (monotonic `sequence`,
`eventType`, `occurredAt`, optional `actorId`, JSON `metadata`). Event types:
`CARD_CREATED`, `CARD_MOVED`, `CARD_COMPLETED`, `CARD_REOPENED`, `ESTIMATE_SET`,
`ESTIMATE_CHANGED`, `DUE_DATE_SET/CHANGED/CLEARED`,
`CARD_MEMBER_ASSIGNED/UNASSIGNED`, `CARD_ARCHIVED/RESTORED/DELETED`,
`BASELINE_CAPTURED`.

`boardId`/`cardId` are **denormalized** (not foreign keys) so history survives
card/list/board deletion. These rows are **append-only** — never mutate or delete
them. Historical state (e.g. who was assigned at a point in time) is reconstructed
by replaying events, which is why member filtering is accurate over time.

## Metrics

`getWorkspaceAnalytics()` computes, over the selected range:

- **Created vs completed** — cumulative cards created and first-completed over
  the range; the gap is net open work. Counts only (no estimates required), so it
  stays meaningful regardless of estimation coverage. This is the primary
  delivery-flow signal for an open-ended board.
- **Remaining estimated work** ("burndown") — remaining estimated hours of open
  cards over time, with a linear projection line. Depends on estimate coverage
  and is *not* a sprint burndown (no committed scope / fixed end date); the
  projection is a reference line, not a target. Treat as secondary to flow.
- **Lead time** — median and average time from creation to completion
  (detail table per card).
- **Overdue count** — cards past `dueDate` and not done.
- **Completed late** — cards completed after their due date.
- **Reopen rate** — share of cards moved back out of a done list.
- **Estimation coverage** — share of cards carrying an estimate (data quality).

## Filters & time

Dashboard filters: date-range presets (7d / 30d / 90d), board, team member, and
include-archived. Date math uses the workspace `timezone`. Metrics that span the
`analyticsLaunchAt` boundary (the post-backfill cutoff) are flagged as
lower-confidence.

## Backfill

`scripts/backfill-card-history.ts` seeds history for cards that predate event
capture, emitting `BASELINE_CAPTURED`. After backfill, set `analyticsLaunchAt`
(`updateWorkspaceAnalyticsLaunchAction`) so the engine knows where confident
data begins.

## Refresh & export

- **Live refresh:** Server Actions emit `analytics:refresh` to the workspace
  room (`components/workspace/workspace-dashboard-client.tsx` refetches).
- **Export:** `exportWorkspaceAnalyticsAction` + `generateAnalyticsCSV` produce a
  CSV with proper cell escaping (covered by `tests/analytics-export.test.ts`).

## Proof

The engine and export are the best-tested part of the app
(`lib/analytics/engine.test.ts`, `tests/analytics-export.test.ts`,
`lib/card-history.test.ts`). Keep new metrics test-backed — they are pure
functions over the event stream and cheap to test.
