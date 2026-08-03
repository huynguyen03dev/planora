# 0021 Analytics anchors completion metrics on the current completed streak

Date: 2026-07-03

## Status

Accepted

## Context

Decision **0020** makes card completion a card-owned, freely toggleable checkbox
(check/uncheck like Trello). Analytics (`lib/analytics/engine.ts`) currently
anchors completion metrics on the card's **first** completion event:

- `findFirstCompletionEvent()` (`engine.ts:504`) filters to the completion
  flagged `firstCompletion` (defaulting true), and is used by both **throughput**
  (`:677`) and **cycle-time / lead-time** (`:544`).
- The replay guard `if (!state.completedAt)` (`:389`) freezes `completedAt` at the
  first completion within a streak.
- `firstCompletion: true` is stamped on completion events
  (`lib/card-history.ts:345`, `actions.ts:497`) and `completeCard()` is
  "first completion only" (`lib/card.ts:415`).

Under a one-way completion model these assumptions were harmless. Under a casual
toggle they break: an accidental early tick permanently sets a card's completion
date. A card ticked on day 1, unticked, and truly finished on day 30 reports a
1-day cycle time and counts as "done" in day-1's period. Worse, a card completed
then reopened and left open **still counts as completed forever**.

The `CARD_REOPENED` event already exists (`schema.prisma:55`) and the engine
already clears `completedAt` on reopen during replay (`engine.ts:393`), so the
plumbing for a corrected anchor is present.

## Decision

**Anchor completion metrics on the card's *current completed streak*, not its
first-ever tick.**

- The completion event that counts is the one that **began the card's current
  completed streak** — i.e. the completion after its last `CARD_REOPENED`, or the
  first completion if it was never reopened.
- A card that is currently reopened (completed then reopened, not re-completed)
  is **not** counted as completed.
- **Cycle-time / lead-time** measures `created → (current-streak completion)`.
- **Throughput / completed-count** counts a card by its current completion state
  as-of the period, anchored at the current-streak completion.
- Replace `findFirstCompletionEvent` accordingly; change the `if (!state.completedAt)`
  replay guard so `completedAt` reflects the latest completion in the streak; the
  `firstCompletion` metadata flag becomes vestigial (retain for back-compat read,
  stop relying on it).

## Alternatives Considered

1. **Keep first-tick anchoring** — rejected: an accidental early tick corrupts
   cycle time and permanently marks reopened-and-abandoned cards as done.
2. **Count every completion event as discrete throughput** — rejected: a card can
   be "completed" many times, so accidental ticks inflate throughput N×. Worse
   under casual toggling than the current-streak anchor.

## Consequences

Positive:

- Cycle time and throughput reflect when work was *actually* finished, robust to
  accidental/premature ticks.
- "Completed" means *currently* completed; a reopened-and-open card correctly
  drops out of completed counts and back into overdue where applicable
  (consistent with the card-face due-status, which already derives from
  `completedAt`).
- No new column; the existing event log carries everything needed.

Tradeoffs:

- Analytics numbers for existing boards may shift for any card that was completed
  more than once (rare today, since completion was one-way).
- Touches the analytics domain (separate proof surface); shipped as a sibling
  story to `US-045`, with a dependency on the toggle that creates reopen-heavy
  usage.

## Follow-Up

- Implement in the analytics sibling story (`US-064`). Ships with or after
  `US-045` (the first-tick bug is already latent today via drag-out-of-done
  reopens, so `US-064` can also stand alone as a bugfix).
- **`reopenRate` KPI** (`engine.ts:805`) shares the replaced
  `findFirstCompletionEvent` (`computeCompletedMetrics`, `:544`). Keep its
  denominator **event-based** (any `CARD_COMPLETED` in range), decoupled from the
  streak "currently complete" filter — otherwise a completed-then-reopened-and-open
  card leaves the denominator and perversely lowers the reopen rate. The streak
  anchor governs throughput/cycle-time only.
- Add unit coverage for the streak anchor: complete, complete→reopen (not
  counted), complete→reopen→complete (anchored at the later completion),
  point-in-time replay across a toggle sequence.
- Update `docs/product/analytics.md` with the anchoring rule.

## Implementation refinements (senior review)

Two corrections found during code review, folded into the shipped implementation:

- **The streak anchor is evaluated point-in-time per period.**
  `findCurrentStreakCompletionEvent` takes an `asOf` bound and ignores events
  after it, and both call sites pass the period's `range.to`. Without this, the
  single event fetch (cutoff = the *current* `range.to`) let a reopen in the
  current period null the anchor while computing the **previous** period,
  wrongly dropping a card that was genuinely complete as-of the previous
  period's end — corrupting the comparison KPIs (`leadTime.previous`,
  `totalCompleted.previous`, `completedLate.previous`).
- **`reopenRate` numerator is unioned into its denominator.** A card whose
  completion predates the range but is reopened inside it belongs in the
  numerator; adding it to the denominator too keeps numerator ⊆ denominator so
  the rate cannot exceed 100%. The denominator is therefore "completed in range
  **or** reopened-after-completion in range", still event-based and decoupled
  from the streak filter.
- **Replay-guard note:** the guard `if (!state.completedAt)` is deliberately
  **kept** (not changed as sketched above). Because `CARD_REOPENED` clears
  `completedAt` during replay and the toggle emits at most one completion per
  streak (the action's `isTransition` guard), first-in-streak == latest-in-streak,
  so point-in-time `completedAt` is already streak-correct.
