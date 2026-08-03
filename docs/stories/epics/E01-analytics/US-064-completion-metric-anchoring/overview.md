# Overview — US-064 Analytics anchors completion on the current streak

## Status

planned (high-risk) — sibling of US-045. Design resolved 2026-07-03
(decision 0021), senior-reviewed. The first-tick anchoring bug is **already latent
today** (drag-out-of-done reopens exist); US-045's casual toggle makes it common.
Ships with/after US-045; no hard ordering requirement.

## Current Behavior

Analytics (`lib/analytics/engine.ts`) anchors completion metrics on a card's
**first** completion:

- `findFirstCompletionEvent()` (`:504`) feeds **throughput** (`:677`) and
  **cycle-time / lead-time** (`:544`).
- Replay guard `if (!state.completedAt)` (`:389`) freezes `completedAt` at the
  first completion in a streak.
- `firstCompletion: true` is stamped on completion events
  (`lib/card-history.ts:345`, `actions.ts:497`).

Harmless under one-way completion; wrong under US-045's casual toggle.

## Target Behavior

Completion metrics anchor on the card's **current completed streak** — the
completion after its last `CARD_REOPENED`, or the first if never reopened
(decision 0021):

- A currently-reopened card is **not** counted as completed.
- Cycle-time = `created → current-streak completion`.
- Throughput counts a card by its completion state as-of the period.

## Affected Users

- Anyone reading the workspace analytics dashboard / CSV export.

## Affected Product Docs

- `docs/product/analytics.md` — completion-metric definition.

## Non-Goals

- The completion toggle, `isDone` removal, estimate-lock removal — all US-045
  (decision 0020).
- New metrics; this only re-anchors existing throughput / `totalCompleted` /
  cycle-time / flow chart, preserves `reopenRate` semantics, and verifies overdue.
