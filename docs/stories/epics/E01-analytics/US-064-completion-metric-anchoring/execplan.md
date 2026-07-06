# Exec Plan — US-064 Analytics completion-metric anchoring

## Goal

Re-anchor analytics completion metrics on the current completed streak instead of
the first-ever tick, so US-045's casual completion toggle can't corrupt throughput
/ cycle-time / overdue (decision 0021).

## Scope

In scope:

- `findCurrentStreakCompletionEvent()` replacing `findFirstCompletionEvent()`
  (`engine.ts:504`), wired into **`computeCompletedMetrics` (`:544`, = the
  `totalCompleted` KPI + lead-time)** and **`computeFlowSeries` (`:677`, daily
  flow chart)** — both share the function.
- **`reopenRate` KPI:** keep its denominator **event-based** (any `CARD_COMPLETED`
  in range), decoupled from the streak filter, so reopened-and-open cards stay in
  it (decision 0021 + design.md). Add a dedicated test.
- Replay guard fix at `engine.ts:389` (latest-in-streak, not first-wins).
- Verify `computeOverdue` (`:608`) handles reopened cards correctly (expected
  already-correct via state replay — verify only).
- Update `docs/product/analytics.md`.

Out of scope:

- US-045's toggle / `isDone` removal / estimate-lock removal (decision 0020).
- Any new metric or payload-shape change.

## Risk Classification

Risk flags: **Public contract** (client-visible metric values change),
**Existing behavior** (shipped analytics numbers shift for multi-completion
cards), **Multi-domain** (analytics vs board completion), **Weak proof** (engine
replay is unit-tested — extend it).

Hard gate: meaningful change to a computed public contract → decision **0021**
(recorded).

## Dependency

Ships **with or after US-045**, ideally same PR train. Note: `CARD_REOPENED`
already exists today (drag-out-of-a-done-list reopens — `card-history.ts:350-359`),
so the first-tick anchoring bug is **latent now**, not purely future — US-064
could stand alone as a bugfix. US-045 just makes reopens common (casual toggle),
raising the impact. Keep them together; no hard ordering requirement.

## Work Phases

1. Decision record 0021. **Done.**
2. Implement `findCurrentStreakCompletionEvent` + replay-guard fix.
3. Repoint throughput / lead-time / overdue consumers.
4. Extend `engine` unit tests (streak matrix below).
5. Update `analytics.md`; story proof.

## Stop Conditions

Pause if a consumer of `findFirstCompletionEvent` or the `firstCompletion` flag
is found outside `engine.ts` (grep before implementing), or if a metric other
than throughput / cycle-time / overdue turns out to depend on first-tick timing.
