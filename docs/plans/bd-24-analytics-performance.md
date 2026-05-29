# Bead bd-24: Analytics Performance — Snapshot/Pre-aggregation

## Problem

`getWorkspaceAnalytics()` reads all card history events up to the range end and
reconstructs card state on every call by replaying events. For a workspace with
thousands of cards and months of history, this becomes O(cards × events) per
page load.

## Current Scope (bd-23v)

This is **acceptable for MVP**. History event volume is low (only generated on
card creation, moves, estimate/due date changes) and analytics is called on a
single page. No users are actively performance-testing yet.

## Future Work

- **Option A — Daily snapshots**: Store a pre-computed `AnalyticsSnapshot` row
  per workspace per day containing remaining hours, overdue count, etc. The
  engine reads the latest snapshot + events since that snapshot.
- **Option B — Materialized view**: Use a Postgres materialized view with
  `REFRESH MATERIALIZED VIEW CONCURRENTLY` on a cron/event trigger.
- **Option C — Incremental engine**: Reconstruct from snapshot + delta events
  in memory, avoiding full replay.

## Acceptance

- Analytics page renders under 500ms for a workspace with 5000+ cards and 6
  months of history.
- No schema redesign of existing `CardHistoryEvent` table (append-only).
- Backward compatible with existing analytics engine API.
