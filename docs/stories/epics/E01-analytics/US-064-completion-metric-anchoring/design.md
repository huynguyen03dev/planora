# Design — US-064 Analytics completion-metric anchoring

## Domain Model

No schema change. The `CARD_COMPLETED` / `CARD_REOPENED` events
(`schema.prisma:54-55`) and the event-sourced replay already carry everything
needed. The `firstCompletion` metadata flag becomes vestigial (read for
back-compat; no longer authoritative).

## Application Flow (engine changes)

- Replace `findFirstCompletionEvent()` (`engine.ts:504`) with a
  `findCurrentStreakCompletionEvent()`: scan a card's chronologically-ordered
  events; the anchor is the last `CARD_COMPLETED` **after** the last
  `CARD_REOPENED` (or the first `CARD_COMPLETED` if never reopened). If the last
  completion-relevant event is a `CARD_REOPENED`, the card is **not completed**.
- Update the replay guard at `:389`: `state.completedAt` should reflect the
  latest completion in the current streak (drop the `!state.completedAt`
  first-wins guard, since `CARD_REOPENED` resets it at `:393`).
- Point completion consumers at the new anchor. **All four callers below share
  `findFirstCompletionEvent`, so they re-anchor together — enumerate them:**
  - **`totalCompleted` KPI + cycle-time / lead-time** — `computeCompletedMetrics`
    (`:544`); `totalCompleted = completedCardIds.size` (`:834`), lead-time =
    `created → anchor.occurredAt`. (This is the headline completed count, **not**
    `:677`.)
  - **daily flow chart** — `computeFlowSeries` (`:677`). Note the behavior change:
    a card completed d1 → reopened → completed d30 plots **only d30**.
  - **overdue** (`computeOverdue`, `:608`) — already streak-correct via
    `reconstructCardStateAtTime` (resets `completedAt` on `CARD_REOPENED` at
    `:397`); **verify only**, no change.
  - **`reopenRate` KPI (do NOT break — decision 0021):** `computeCompletedMetrics`
    also produces `reopenedCardIds`, feeding the shipped `reopenRate` KPI
    (`engine.ts:805` → `dashboard/actions.ts:116` → `kpi-cards.tsx:133`).
    **Semantics under the streak model:** `reopenRate` must stay **event-based and
    decoupled from the streak "currently complete" filter** — otherwise a
    completed-then-reopened-and-open card drops out of the denominator and
    perversely *lowers* the reopen rate. Define:
    - denominator = distinct cards with **any** `CARD_COMPLETED` in range (reached
      completion at least once),
    - numerator (`reopenedCardIds`) = distinct cards with a `CARD_REOPENED`
      following a completion in range (current `hasReopenInRange` logic — keep).
    So the streak anchor governs throughput/cycle-time; `reopenRate` keeps its own
    completion-event denominator.

## Interface Contract

- Analytics payload shape unchanged (KPIs, lead-time rows, CSV). Only the
  **values** change for cards completed more than once.
- Point-in-time queries (as-of a date) must remain correct: replaying events up
  to the date yields the streak state at that date.

## Data Model

No migration. Purely a replay/aggregation change.

## UI / Platform Impact

- Dashboard KPI cards, lead-time table, CSV export read the same payload; no UI
  change beyond the corrected numbers.

## Observability

- No new events. Relies on `CARD_COMPLETED` / `CARD_REOPENED` written by US-045's
  toggle action.

## Alternatives Considered

See decision 0021: keep first-tick anchoring (rejected — accidental early ticks
corrupt cycle time and strand reopened-and-open cards as "done"); count every
completion event discretely (rejected — inflates throughput N× under toggling).
