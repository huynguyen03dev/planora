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
- **Reopen rate** — share of completed cards that were reopened. Event-based:
  denominator = distinct cards that reached completion relevant to the range
  (a `CARD_COMPLETED` in range **or** a reopen-after-completion in range);
  numerator = cards reopened (after a completion) in range. The numerator is a
  subset of the denominator, so the rate is capped at 100% even when a card's
  completion predates the range. Decoupled from the streak "currently complete"
  filter so a completed-then-reopened-and-open card still counts toward the rate
  (decision 0021).
- **Estimation coverage** — share of cards carrying an estimate (data quality).

### Completion-metric anchoring (current streak)

Since completion is a freely-toggleable card checkbox (decision 0020), throughput,
`totalCompleted`, cycle/lead-time, and the flow chart's "completed" series anchor
on a card's **current completed streak** — the completion after its last
`CARD_REOPENED`, or the first completion if never reopened (decision 0021). A card
that is currently reopened is **not** counted as completed, and cycle-time
measures `created → current-streak completion`. This makes the numbers robust to
accidental/premature ticks. Overdue and burndown already derive from the
point-in-time replay (`CARD_REOPENED` clears `completedAt`), so they are
streak-correct without change.

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
