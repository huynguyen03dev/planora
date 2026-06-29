# Exec Plan — US-030 Card-face metadata row

## Goal

Surface the card metadata the schema already stores on the **card face** in the
board view — due-date badge (overdue/today/soon/done states), assignee avatars,
checklist progress (`done/total`), and comment count — so an overdue or busy card
is legible at a glance without opening the detail sheet.

## Scope

In scope:

- Enrich the board-view card payload (`getListsByBoardId`, `lib/list.ts`):
  `dueDate`, `completedAt`, capped `members` (+ `memberCount`), `checklistDone`,
  `checklistTotal`, `commentCount`. Counts aggregated server-side.
- Thread the enriched card type through `page.tsx`, `board-content.tsx`,
  `board-store.ts` (incl. `applyRemoteCardCreated` empty defaults), `list-column.tsx`.
- Render the metadata row in `list-card-item.tsx` using shadcn `Avatar`/`AvatarGroup`
  (added in US-034) — accessible (icon + text + aria-label, never colour-only).
- Add additive FK indexes for the new aggregates (decision 0011).
- Update the `docs/product/boards-and-cards.md` card-metadata contract.

Out of scope:

- Any new persisted field, Server Action, auth/authorization change.
- Dedicated realtime broadcast of the new fields (refreshes on next render, like
  priority/cover today).
- Assignee / due-date **filtering** (now unblocked; a follow-up slice).
- Board windowing / virtualization (decision 0010).

## Risk Classification

Risk flags:

- Public contracts — board-view payload grows; card-face rendering contract changes.
- Data model — additive FK index migration.
- Existing behavior — card rendering reworked.
- Weak proof — React components unit/E2E untested (IN-01 residual); proof is manual QA.
- Cross-platform — must hold on the responsive board (US-021), desktop + ≤375px.

Hard gates: **migration** (additive, index-only — no data loss/column change).
No auth, authorization, external-provider, or validation-weakening change.

## Work Phases

1. Discovery — map the card data flow (query → page → store → column → card item)
   and the schema relations/indexes. **Done.**
2. Design — decide capped-avatars + server-aggregated counts + FK indexes
   (decision 0011). **Done.**
3. Validation planning — manual browser QA (DOM-verified values) + tsc/eslint/build
   + existing unit suite green.
4. Implementation — schema/migration, query, type threading, render. **Done.**
5. Verification — tsc/eslint/build, unit suite, browser QA desktop + 375px.
6. Harness update — story + decision rows; IN-02 initiative row; matrix proof.

## Stop Conditions

Pause for human confirmation if:

- The scope would need a new persisted field or a non-additive migration
  (escalate further / re-confirm).
- Card-face freshness requires a new realtime contract (separate story).
- The per-card aggregate shows a real board-load regression that an index can't
  cover (revisit denormalization).

Confirmed with the human at intake: full card face + additive index migration
(over the "core only, no migration" alternative).
