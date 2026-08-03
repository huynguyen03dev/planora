# Validation — US-045 Manual card completion toggle

## Proof Strategy

A new Server Action mutating `completedAt` bidirectionally, a schema migration
(drop `isDone`), a removed validation rule (estimate lock), and a new realtime
event must each be proven — on every completion/reopen path, the estimate gate,
the viewer-denied path, and the drag/completion decoupling. This is the
codebase's first unit-tested Server Action of this shape (IN-01 residual).

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | `setCardCompletion` pure helper: complete sets `completedAt`; reopen clears it; re-complete after reopen sets a fresh timestamp; `requireEstimateBeforeDone` blocks complete when no estimate (gate kept); estimate **editable** on a completed card (lock removed). |
| Integration | `toggleCardCompletionAction` mocked-Prisma: viewer forbidden, workspace isolation, Zod rejects bad uuid/boolean, `estimate-required` surfaced, `CARD_COMPLETED`/`CARD_REOPENED` history written, returns serializable card. Move/create actions **no longer** write `completedAt` **nor** emit list-done-driven completion history (`card-history.ts:334-359`, `actions.ts:486-501`). Estimate editable on a completed card (lock removed). |
| E2E | n/a (no harness) — covered by Platform. |
| Platform | Complete + reopen from card detail and card face; **drag into/out of a (formerly Done) list never changes completion**; a done list holds a mix of checked/unchecked cards; estimate gate shows a reason; estimate editable after completion; **realtime completion flip reaches a second viewer** (incl. mid-drag on the receiver); reopened past-due card snaps back to "overdue"; a11y (keyboard, `aria-checked`, non-color state; toggle hit-target ≥36px pointer / touch); **measure the completed-tile composited contrast** — `opacity-75` over `muted-foreground` meta text must still clear AA (the filled check is the non-color signal, so the dim is decorative); light/dark; mobile/touch (face control always visible). |
| Performance | Single-row update; no N+1; one dedicated realtime emit. |
| Logs/Audit | `CARD_COMPLETED` / `CARD_REOPENED` card-history entry per transition. |
| Migration | Drop `List.isDone`: verify no complete card loses state (all retain `completedAt`; cards in a former done list with null `completedAt` were already incomplete — no flip); `updateListIsDoneAction` + `updateListIsDoneSchema` + the create-list "Done list" checkbox + the list-header toggle/badge all removed; **`isDone` gone from `ListSnapshot`/`ListUpdatedPayload`** and the board-store list reducer; `completeCard()` dead code deleted; no orphaned references (typecheck + `prisma generate` clean). |

## Fixtures

- A board with a former "Done" list and a normal list (both ordinary post-migration).
- A card with an estimate and one without (estimate gate).
- Two sessions (editor + viewer) for permission + realtime checks.

## Commands

```text
# setCardCompletion + resolveCompletedAt helper unit tests:
npx vitest run lib/card.test.ts
# toggleCardCompletionAction boundary (auth/permission/isolation/gate) +
# no-isDone list actions + move no longer touches completedAt:
npx vitest run tests/server-actions/list-card.test.ts
# card:completion-updated board-store reducer:
npx vitest run tests/board-store.test.ts
# move-lifecycle no longer emits CARD_COMPLETED/CARD_REOPENED:
npx vitest run lib/card-history.test.ts
# full gate (650 pass):
npm test
```

## Acceptance Evidence

Add results + screenshots after verification. Link decision 0020 (and 0021 for the
analytics sibling US-064).
