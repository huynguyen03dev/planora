# Overview — US-045 Manual card completion toggle

## Status

planned (high-risk) — carved out of US-043 after senior FE review found the
"completion circle" is a data-model + product-contract change, not presentational.
Design resolved 2026-07-03: **completion is card-owned; `isDone` list-derived
completion is removed** (decision 0020).

## Current Behavior

Card completion is a **derived** state, owned by list membership:

- Moving a card into an `isDone` list auto-sets `completedAt`; moving it out
  reopens it (move logic in
  `app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts` ~L447, ~L1223).
- `lib/card.ts completeCard()` is one-way ("first completion only").
- There is **no card-level completion toggle**, and no UI control to mark a card
  complete independent of its list.
- `requireEstimateBeforeDone` gates completion; a separate **estimate lock**
  (`actions.ts:793`) freezes the estimate once `completedAt` is set.

## Target Behavior

Completion is a **property of the card**, matching Trello. A user marks a card
complete / reopens it directly via a completion control; **dragging never changes
completion**. `Card.completedAt` is the single source of truth.

Consequently (decision 0020):

- **`isDone` is removed** — dropped from the schema; `updateListIsDoneAction` and
  its UI toggle deleted; the move logic no longer touches `completedAt`. A "Done"
  list becomes an ordinary list and may hold unchecked cards.
- **The estimate lock is dropped** — the estimate stays editable through
  complete/reopen cycles (the event log preserves estimate-at-completion for
  analytics). The `requireEstimateBeforeDone` **gate** is kept.
- Completion broadcasts live to other viewers via a **dedicated realtime event**
  (`card:updated` today carries only `{ cardId, title }` and cannot carry a
  completion flip).

## Affected Users

- Editors/admins can toggle completion. Viewers see completion state, cannot
  toggle.

## Affected Product Docs

- `docs/product/boards-and-cards.md` — completion/`isDone`/estimate rules (the
  contract this story changes; `isDone` section removed).
- `docs/design/planora-vs-trello-gap-analysis.md` — Gap 2 (completion circle).

## Non-Goals

- The card-detail document restyle (US-043, presentational).
- **Analytics completion-metric re-anchoring** (decision 0021) — sibling story
  **US-064**; this story must not corrupt analytics but the anchor fix ships
  there.
- Per-checklist-item completion (separate concern; already exists).
