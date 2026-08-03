# Exec Plan — US-045 Manual card completion toggle

## Goal

Make card completion a card-owned, directly-toggleable property (complete /
reopen), remove `isDone` list-derived completion, and drop the estimate lock —
per decisions 0020 (completion model) and 0021 (analytics anchoring, sibling
story US-064).

## Scope

In scope:

- `toggleCardCompletionAction` Server Action (verifySession → permission →
  workspace scope → Zod → Prisma `completedAt` set/clear → card-history event →
  dedicated realtime emit → serializable return), including the **reopen** path.
- `lib/card.ts`: replace one-way `completeCard()` with bidirectional
  `setCardCompletion(cardId, complete)`.
- **Remove `isDone` — full blast radius** (senior review 2026-07-03; ~15 sites,
  5 layers). Dropping `List.isDone` requires all of:
  - **Schema/migration:** drop `List.isDone`; `npx prisma migrate dev`.
  - **Realtime contract (SECOND public-contract change):** remove `isDone` from
    `ListSnapshot` (`lib/realtime/types.ts:22`), `ListUpdatedPayload`
    (`types.ts:33`), and the `emitListUpdated` payload (`server.ts:93`); update
    the `applyRemoteListUpdated` reducer (`board-store.ts:399`) and `List` store
    field (`board-store.ts:31`).
  - **Server layer:** delete `updateListIsDoneAction` (+ `updateListIsDoneSchema`
    `schemas/list.ts:35-40`, and `isDone` from `createListSchema`/`updateListSchema`
    `:18,:30`); drop `isDone` from `createListAction` (`actions.ts:222,238,245`)
    and `lib/list.ts` (`ListRecord.isDone` `:31`, `createList` params `:87,185,192`,
    `updateListIsDone` `:225-234`, `isDone: true` selects `:107,419,472`).
  - **Card-history side-effects (different file than the move logic!):** remove
    the list-done-driven `CARD_COMPLETED`/`CARD_REOPENED` generation in
    `buildCardMoveLifecycleEvents` (`lib/card-history.ts:334-359`) and the
    create-in-done `CARD_COMPLETED` (`actions.ts:486-501`); strip `completedAt`
    writes from move (`actions.ts:1223-1227`) and create (`:447`).
  - **UI:** delete the "Done list" toggle (`list-column.tsx:308-314`), the "Done"
    badge (`:253-257`), the create-list "Done list" checkbox, and `isDone` types
    in `board-content.tsx:27` / query projection `page.tsx:146`.
  - **Tests:** `board-store.test.ts:257-287` (3 isDone-patch tests),
    `list.test.ts:185`, `apply-drop.test.ts`, `tests/.../_harness.ts:83-124`,
    `list-card.test.ts:334` (`updateListIsDone` action test).
  - **Seed/backfill:** `scripts/seed-demo-board.ts`, `seed-analytics-demo.ts`,
    `backfill-card-history.ts:55,94`.
  - **Docs:** `boards-and-cards.md:36,51`, `realtime-sync.md:41,64`,
    `ARCHITECTURE.md:140`, `GLOSSARY.md:43,96`.
- Note: `lib/card.ts completeCard()` (`:409`) is **already dead code** (0 callers)
  — delete it; do not treat it as the live completion path.
- **Drop the estimate lock** (`actions.ts:793`); keep the
  `requireEstimateBeforeDone` gate (block + inline reason).
- Dedicated realtime event `emitCardCompletionUpdated` + board-store reducer
  (see design.md — `card:updated` is title-only today).
- Completion control UI on card face + card-detail hero, full a11y.

Out of scope:

- Analytics completion-metric re-anchoring → **US-064** (decision 0021).
- US-043 restyle; US-044 density.

## Risk Classification

Risk flags: **Data model** (drop `isDone`; bidirectional `completedAt`),
**Public contract** (TWO: (a) new completion realtime event; (b) `isDone` removed
from `ListSnapshot`/`ListUpdatedPayload` + `boards-and-cards.md`/`realtime-sync.md`),
**Existing behavior** (removes shipped isDone auto-completion + move side-effects),
**Weakened validation** (estimate lock removed), **Weak proof** (first
Server-Action/Prisma test of this shape).

Hard gates (→ high-risk, both recorded in decision 0020):

- **Schema migration** (drop `List.isDone`).
- **Removing an audited validation rule** (the estimate lock).

## Work Phases

1. Decision records — 0020 (this story) and 0021 (US-064). **Done.**
2. Schema — drop `List.isDone`; `npx prisma migrate dev`; regenerate client.
3. Server layer — `setCardCompletion` helper; `toggleCardCompletionAction`;
   delete `updateListIsDoneAction`; strip `completedAt` from move/create logic;
   remove estimate lock.
4. Realtime — `emitCardCompletionUpdated` + board-store reducer (safe mid-drag).
5. UI — completion control (detail hero + card face); dimmed-in-place completed
   card styling; remove the `isDone` list-header toggle.
6. Verification — QA matrix (below); update `boards-and-cards.md`; story proof.

## Stop Conditions

The reconciliation product decision is **resolved** (decision 0020 — pure
card-owned; `isDone` removed) and the `isDone` blast radius is enumerated above
(no "unknown consumer" pause — the review mapped them). Note the migration is
safe by design: cards may already sit in an `isDone` list with null `completedAt`
(toggling a list done never backfills its cards), but those already render
*incomplete*, so dropping the column flips no state. Pause only if:

- A consumer of `isDone` appears that is **not** in the enumerated list above.
- Ordering: the schema drop must come **after** all readers are removed (realtime
  types, UI, `lib/list.ts` selects, card-history side-effects) or
  `prisma generate` + typecheck breaks.
