# 0020 Card completion is card-owned; remove isDone list-derived completion

Date: 2026-07-03

## Status

Accepted

## Context

Card completion in Planora was **derived from list membership**: dragging a card
into an `isDone` list auto-set `Card.completedAt`, and dragging it out cleared it
(`app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts` move logic;
`lib/card.ts completeCard()` was one-way). There was no user-facing control to
mark a card complete independent of its list.

This is not how Trello (our parity target) models completion: a Trello card owns a
completion checkbox; lists are just lists. List position is a *workflow* concern,
not the *truth* of whether work is done — a card in "In Review" can be done and a
card dragged into "Done" by accident is not. Coupling the two produced surprising
state (a move silently flips completion) and blocked the in-place complete pattern
users expect.

Two coupled rules rode on the derived model:

- **`requireEstimateBeforeDone`** — a *gate* blocking completion without an
  estimate (kept; see below).
- **The estimate *lock*** — `actions.ts:793` refuses estimate edits when
  `completedAt` is set, with the message *"Estimate cannot be changed after first
  completion."* The message says "first completion" (ever) but the check reads
  `completedAt != null` (currently complete). These were equivalent only because
  completion was one-way; a reopen control splits them apart and forces a choice.

Investigation of `lib/analytics/engine.ts` showed analytics is **event-sourced**:
it replays `ESTIMATE_SET`/`ESTIMATE_CHANGED`/`CARD_COMPLETED`/`CARD_REOPENED`
events (each timestamped) to reconstruct state at any point in time. The
historical estimate-at-completion is therefore always recoverable from the event
log regardless of the live `estimateHours` field. The lock was protecting the
live field — but analytics never trusted the live field for point-in-time truth.

## Decision

1. **Completion is a property of the card.** `Card.completedAt` is the single
   source of truth, written **only** by an explicit user action (the new
   `US-045` completion toggle). Dragging a card **never** changes completion.

2. **Remove `isDone` entirely.** Drop `List.isDone` (schema migration), delete
   `updateListIsDoneAction` and its UI toggle, and remove the completion
   side-effects from the move logic (`actions.ts` ~L447, ~L1223) and from
   `lib/card.ts completeCard()`'s one-way behavior. A "Done" list becomes an
   ordinary list; a done column may hold a mix of complete and incomplete cards
   (as in Trello).

3. **Drop the estimate lock.** Remove the `actions.ts:793` guard. The estimate
   stays freely editable through complete/reopen cycles. This is justified
   because the event log preserves the estimate-at-completion for analytics; the
   lock guarded a door that was already bricked up, and a permanent, irreversible
   freeze is a poor fit under a casual, reversible completion toggle.

4. **Keep the `requireEstimateBeforeDone` gate.** It still blocks completion
   without an estimate when the workspace enables it, and re-applies on every
   re-completion. Only the *lock* is removed, not the *gate*.

No data migration is needed for completion **state**: every currently-complete
card already has `completedAt` materialized and keeps it.

## Alternatives Considered

1. **Manual overrides, sticky (US-045 Option B)** — keep `isDone`
   auto-completion but let a manual flag survive moves. Rejected: needs a
   "who set it" column and preserves the surprising list/completion coupling.
2. **List stays authoritative (US-045 Option A)** — manual toggle only in
   non-done lists. Rejected: least Trello-correct, constrains the user.
3. **Keep the estimate lock, unlock on reopen** — rejected: turns the lock into
   a 2-click-bypassable speed-bump (uncheck → edit → re-check) that guarantees
   nothing, i.e. dead friction.
4. **Keep the permanent estimate lock** — rejected: guarded only the live field,
   which analytics does not trust; a landmine under a casual toggle.

## Consequences

Positive:

- Completion matches the Trello mental model and users' expectation of in-place
  completion. Drag and completion are fully decoupled.
- No completion-state migration; simpler model with fewer surprising writes.
- Estimate is always editable; no hidden permanent consequence on first tick.

Tradeoffs:

- **Behavior change to shipped functionality:** drag-into-Done no longer
  completes a card. Boards that relied on that automation lose it.
- **Hard gates:** a schema migration (drop `List.isDone`) and the removal of an
  audited validation rule (the estimate lock). Both are recorded here.
- A "Done" list can now contain unchecked cards — expected, but a visible change.

## Follow-Up

- Implement in `US-045` (toggle + `isDone` removal + estimate-lock removal + a
  dedicated realtime completion event — `card:updated` today carries only
  `{ cardId, title }` and cannot broadcast a completion flip).
- Analytics must stop anchoring completion metrics on the *first* tick — see
  decision **0021** and its sibling story.
- Update `docs/product/boards-and-cards.md` (remove the `isDone` contract; state
  completion is card-owned and drag-independent).
