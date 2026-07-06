# Exec Plan — US-066 Automation Rules Engine

## Goal

Ship a workspace-scoped automation rules engine (Butler-style) with event-driven
and scheduled triggers, structured JSON conditions, inline action execution,
loop prevention, system-actor attribution, and a rule management UI — per
decision 0022.

## Scope

In scope:

- **Data model**: `Rule` and `RuleExecutionLog` models; migration; client
  regeneration.
- **Pure matcher**: `lib/automation/matcher.ts` — pure functions for trigger
  matching (`matchTrigger(triggerType, triggerConfig, eventPayload)`) and
  condition evaluation (`evaluateConditions(triggerConfig, eventPayload)`),
  with unit tests.
- **Loop guard**: `lib/automation/loop-guard.ts` — `ChainTracker` class
  (chainId generation, dedup set, depth cap).
- **Executor**: `lib/automation/executor.ts` — a **sequence executor** that
  runs a rule's ordered action list (0022 R1) in order, plus per-action-type
  handlers each calling existing `lib/card.ts` / `lib/list.ts` transaction-body
  helpers. Rule-driven mutations use a Prisma transaction client handle; the
  first failing step aborts the transaction; `notify-member` runs post-commit.
- **Dynamic-target resolver**: `lib/automation/resolver.ts` — expands dynamic
  target tokens (`card-assignees`, `card-creator`, remove-member `all`; 0022 R2)
  to concrete workspace-member ids at fire time, each workspace-isolation-checked.
- **Evaluator**: `lib/automation/evaluator.ts` — `evaluateRules()` orchestrator
  that fetches enabled rules, calls matcher, respects loop guards, calls
  executor, and logs results.
- **Server Action hooking**: integrate `evaluateRules()` into every Server
  Action that produces a trigger event (card-created, card-moved-to-list,
  card-completed, card-reopened, label-added-to-card, member-assigned),
  positioned inside the triggering transaction, after the trigger mutation and
  history writes; deferred effects (emits, notifications) fire post-commit.
- **Rule CRUD actions**: `createRuleAction`, `updateRuleAction`,
  `deleteRuleAction`, `toggleRuleEnabledAction`, `listRulesAction`,
  `getRuleExecutionLogAction` — all with admin permission gate (mutations) or
  any-role read access.
- **Dry-run**: `dryRunRulesAction` — evaluates matcher without transaction,
  returns the would-fire rule list.
- **Scheduled trigger**: extend the `/api/cron/due-date-reminders` handler to
  also evaluate `due-date-approaching` rules.
- **Attribution**: seeded system user (`AUTOMATION_ACTOR_USER_ID`) as `userId`
  + `{ ruleId }` metadata on `CardHistoryEvent` rows produced by rule actions;
  no new realtime event types.
- **Save-time static cycle warning**: on rule create/update, check if
  `actionType` produces events matching any rule's `triggerType` in the same
  workspace; show advisory warning in the UI.
- **RBAC enforcement**: `hasWorkspacePermission(admin)` for all rule mutation
  actions; reads (list rules, view execution log) allowed for any workspace
  member via session + workspace-membership check.
- **UI**: `/workspace/[slug]/automation` page with rule list (table with toggle,
  trigger, action, last-run), rule builder (shadcn Dialog + Select/Input),
  execution log panel. Consult `DESIGN.md` for token usage.
- **Docs**: `docs/product/automation.md` authored; existing product docs updated
  with attribution notes.
- **Test matrix**: ~52 automated cases across unit, integration, RBAC, and
  scheduled-trigger layers — including the R1/R2/R3 refinements (sequence
  execution, dynamic-target resolution, due-date notify dedup) (see validation.md).

Out of scope:

- Webhook/HTTP actions → v2.
- Generic scheduled/calendar rules → v2.
- Freeform DSL → v2.
- Background job queue offload → v2 (separate feature).
- Custom per-rule permissions → v2.
- Rule import/export or templates → v2.

## Risk Classification

Risk flags: **Data model** (new models, but no migration of existing data),
**Authorization** (admin-only rule mutations; viewer/editor restriction),
**Existing behavior** (every card-mutating Server Action gets a new hook),
**Transaction integrity** (rule actions share the trigger's transaction),
**Multi-domain** (touches cards, lists, labels, members, notifications,
analytics attribution, realtime), **Loop correctness** (cascading rules must
halt), **Weakened safety** (a misconfigured rule can mutate cards with no human
undo beyond card-history replay).

Hard gates (→ high-risk):

- **Authorization boundary**: viewer/editor must be unconditionally denied rule
  mutations. Tested per US-006 sabotage pattern.
- **Transaction safety**: rule-driven card mutations must roll back with the
  triggering mutation. A half-applied rule action must never leave the DB in
  an inconsistent state.
- **Loop prevention**: a chain of mutually-triggering rules must always halt
  within the depth cap. Proven by integration test.
- **Workspace isolation**: rules from workspace A must never be evaluated
  against workspace B events. Rules must never mutate cards in a different
  workspace.

## Work Phases

1. **Decision record** — 0022 (this story). **This packet.**

2. **Schema + migration** — add `Rule` and `RuleExecutionLog` models; author
   Zod schemas for `triggerConfig` and `actionConfig` in `lib/schemas/`; run
   `npx prisma migrate dev --name add_automation_rules` and regenerate client.

3. **Pure matcher** — `lib/automation/matcher.ts` with `matchTrigger()` and
   `evaluateConditions()`; unit tests covering every trigger/condition
   combination.

4. **Helper refactor for transaction client** — add a `client:
   Prisma.TransactionClient | typeof db = db` parameter to helpers used by rule
   actions. The param is placed **last** (after the existing args) so every
   current call site is byte-identical; `setCardCompletion` (`lib/card.ts:430`)
   uses a *required, leading* client because all its callers already pass one —
   that ordering does NOT apply to these helpers, whose callers pass no client.
   **DONE (verified): tsc clean, 697/697 tests pass:**
   - `updateCardPriority` (`lib/card.ts`)
   - `addCardLabel`, `removeCardLabel` (`lib/label.ts`)
   - `assignMemberToCard`, `removeMemberFromCard` (`lib/card-member.ts`)

   **Deferred to Phase 5/6:** the card-move helper
   `reorderCardWithinListByNeighbors` (`lib/card.ts:138`) opens its **own**
   `db.$transaction` and retries the whole block on `StaleNeighborError`. It
   cannot take an outer `tx` via a mechanical param swap — per decision 0022's
   retry-loop semantics, rule evaluation must run *inside each move attempt*, so
   move-action composition is an executor/hook design decision handled where the
   `move-card-to-list` action handler is built, not a Phase-4 refactor.
   Zero behavior change; existing tests stay green.

5. **Loop guard + resolver + executor** — `lib/automation/loop-guard.ts`
   (ChainTracker), `lib/automation/resolver.ts` (dynamic-target resolver, 0022
   R2), and `lib/automation/executor.ts` (sequence executor + per-type handlers
   calling existing helpers, 0022 R1). Unit tests for chain dedup, depth cap,
   ordered sequence execution (order preserved; first-failing-step aborts),
   dynamic-target resolution (`card-assignees`/`card-creator`/`all`, plus
   cross-workspace-target rejection), and each action handler against mocked
   Prisma.
   **DONE (verified): tsc clean, 748/748 tests pass (+51 vs Phase 4).**
   - `loop-guard.ts` — `ChainTracker` (private ctor + `root()`/`from()`;
     `child()` shares the dedup `Set` by reference; `MAX_CHAIN_DEPTH = 5`). 18 tests.
   - `resolver.ts` — `resolveRecipient`/`resolveRemoveScope` +
     `CrossWorkspaceTargetError`; explicit-uuid target that is not a workspace
     member throws (rejection), dynamic tokens silently drop non-members. 13 tests.
   - `executor.ts` — `executeRuleActions()` runs the ordered `actions` in-tx via
     the Phase-4 client-aware helpers; returns `{ effects: DeferredEffect[],
     producedEvents: ProducedEvent[] }` (the seam Phase 6's evaluator consumes —
     it does NOT recurse or emit itself); first-failing-step throws → tx aborts.
     20 tests. **Move handler**: appends to the end of the target list inside the
     shared tx (last-position + `CARD_POSITION_GAP`), deliberately NOT calling the
     self-transacting `reorderCardWithinListByNeighbors` (the Phase-4 deferral).
   - **Attribution**: `lib/card-history.ts` `BuildCardHistoryEventInput` gained an
     optional `ruleId?: string`, merged into the persisted metadata JSON in
     `buildCardHistoryEvent` (no-op when absent → existing card-history tests stay
     green). Executor stamps `ruleId` on every history row it writes.

6. **Evaluator + hook wiring** — `lib/automation/evaluator.ts` (evaluateRules
   orchestrator). Integrate the `evaluateRules()` call into each trigger-
   producing Server Action. Integration tests that assert:
   - Card mutated by a rule action has correct DB state.
   - Chain terminates at depth 5.
   - Same event delivered twice is idempotent (dedup).
   - Dry-run makes zero mutations.
   - `notify-member` fires only after a successful commit; discarded on
     rollback.
   - Rule-action error aborts the transaction; the error `RuleExecutionLog`
     row persists (written post-rollback).
   **DONE (verified): tsc clean, 763/763 tests pass (+15 vs Phase 5).**
   - `evaluator.ts` — `evaluateRules()` fetches enabled rules (workspace +
     trigger + board scope), condition-matches via the pure matcher, runs the
     loop guards (dedup `(ruleId,cardId)` → `skipped`; depth cap 5 → `halted`),
     calls the executor, and recurses on `producedEvents` with `chain.child()`.
     success/skipped/halted rows log in-tx; a failing action throws
     `RuleExecutionError` (NOT logged in-tx). 8 tests (matching, dedup, depth-cap
     halt, error-without-inline-log, error identity).
   - `effects.ts` — `fireDeferredEffects()` maps each descriptor to the existing
     `emitCard*` events (re-reading committed card state for the richer
     snapshots) + `notifyAutomation`; `logRuleExecutionError()` writes the
     terminal error row via `db` POST-rollback. Best-effort per effect. 7 tests.
   - Hooks: `evaluateRules()` wired into `createCardAction` (card-created),
     `toggleCardCompletionAction` (card-completed/reopened, transition-gated),
     `moveCardAction` (card-moved-to-list, list-change-gated; effects ride the
     committed retry attempt's return so exactly one application fires),
     `assignCardMemberAction` (member-assigned), `addCardLabelAction`
     (label-added-to-card; wrapped in a new tx for effect atomicity). Each fires
     deferred effects post-commit and, on `RuleExecutionError`, rolls back +
     logs + returns `"Automation rule \"<name>\" failed; no changes were
     applied."`. The US-062 tg2 positive-control tests were updated for the
     richer tx bodies (a no-rules `rule.findMany` mock).
   - **Note (v1 limitation):** the `notify-member` effect reuses the `ASSIGNED`
     notification type (no dedicated automation type yet); delivery is real, the
     label is approximate. A dedicated `AUTOMATION` `NotificationType` is a
     follow-up if desired.

7. **Scheduled trigger** — extend `/api/cron/due-date-reminders` to evaluate
   `due-date-approaching` rules (supplementing, not replacing, the built-in
   reminder; 0022 R3). Integration test: card within the configured window fires
   the action; card outside the window does not; a `notify-member` step dedups
   against the reminder milestone (member not double-notified).

   **DONE (verified): tsc clean, 775/775 tests pass (+12 vs Phase 6).**
   - `evaluator.ts` — added optional `dedupKey` (scheduled claim-first Tier-1
     dedup: the success `RuleExecutionLog` row is written *before* execute and
     commits atomically with the actions; P2002 → skip; NOT propagated into
     cascade recursion) and a `due-date-approaching`-only window gate (skip when
     `event.now` is outside `[dueDate − beforeMinutes, dueDate)`). The pure
     matcher is unchanged. +4 tests (window match/miss, dedupKey P2002 skip,
     claim-row-is-the-only-success-row).
   - `scheduled.ts` (new) — `maxApproachWindowMinutes()` (sizes the scan window;
     `null` ⇒ skip the whole pass), `evaluateScheduledCard()` (per-card tx →
     `evaluateRules` for Tier-1; post-commit splits effects, fires non-notify via
     `fireDeferredEffects`, and applies Tier-2 R3 dedup — claim-first
     `CardReminder(cardId, userId, "DUE_SOON")`, P2002 → skip, rollback-on-notify-
     failure). Never throws (one bad card ≠ aborted tick). +7 tests.
   - `route.ts` — scheduled pass runs *after* the built-in loop (built-in stays
     the canonical `DUE_SOON` notifier on overlap; the rule notify then
     P2002-skips), resolves `workspaceId` via `list.board`, scans
     `[now, now+windowMin)`, extends the response with `scheduled*` counters. The
     built-in loop + existing response fields are behavior-identical (existing
     cron test green with a default-`null` window mock).
   - **v1 boundary:** `beforeMinutes` windows are honest for any size (scan is
     sized from the max enabled window) but a rule's actions apply once per
     `(rule, card, DUE_SOON)`; overdue rules are out of scope (approaching = before
     due). A per-card `RuleExecutionError` rolls back that card's tx and skips its
     remaining rules for the tick (consistent with the card-triggered semantics).

8. **Rule CRUD + RBAC** — implement `createRuleAction`, `updateRuleAction`,
   `deleteRuleAction`, `toggleRuleEnabledAction`, `listRulesAction`,
   `getRuleExecutionLogAction`, `dryRunRulesAction`. Integration tests per the
   US-006 sabotage pattern (viewer/editor denied mutations; cross-workspace
   isolation).
   - Save-time static cycle warning: implement advisory check at rule save.

9. **UI** — `/workspace/[slug]/automation` page: rule list, rule builder
   (shadcn Dialog), execution log panel. Consult `DESIGN.md` for tokens.

10. **Docs + matrix update** — author `docs/product/automation.md`; update
    `boards-and-cards.md`, `realtime-sync.md`, `notifications.md`,
    `analytics.md` with attribution notes; update `TEST_MATRIX.md`.

11. **Verification** — run the full test matrix; story proof + acceptance
    evidence; decision 0022 verification.

## Stop Conditions

Pause for human confirmation if:

- A new trigger or action type is added beyond the v1 list and it changes the
  hooking pattern (e.g. requires a new cron job or external service call).
- The transaction boundary decision changes (e.g. a decision to run rule
  actions in a separate transaction).
- A consumer of `completedAt` (card-owned via `toggleCardCompletionAction`; no `isDone`) or card-move events is discovered outside the
  enumerated Server Action set and the hook placement breaks it.
- Validation requirements for loop-correctness need to be weakened (e.g.
  "depth 10 is acceptable" — the design says 5).
- The seeded system user cannot be created as specified (fixed-UUID migration,
  no `Account` row) — verify the seed exists before hook wiring. (The `userId`
  FK question was already resolved in review: `Activity.userId` is a non-null
  FK, which is why a real seeded User row is required.)
- An auth/permission test at the US-006 level fails and the fix would require
  changing the permission model.
