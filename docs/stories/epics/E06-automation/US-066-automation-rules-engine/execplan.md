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

   **DONE (verified): tsc clean, 821/821 tests pass (+46 vs Phase 7).**
   - **Senior-review fix (HIGH):** create/update now validate action-STEP targets
     (`move-card-to-list.targetListId`, `add/remove-label.labelId`) against the
     rule's workspace via `actionTargetsInWorkspace()` — the Zod schema only
     checks UUID shape, so without this a workspace admin could author a rule
     that moves a card into ANOTHER workspace's list or attaches a foreign label
     (a cross-workspace write at fire time; the recipient targets were already
     runtime-guarded in resolver.ts, but list/label targets were not). Validated
     at SAVE time because a list/label's board→workspace binding is immutable
     (unlike membership). Rejects with `"Invalid action target"`; +6 isolation
     tests (cross-ws list, cross-ws label, nonexistent target, update-swap,
     same-ws positive control). Also: `revalidatePath("/workspace", "layout")`
     (was a literal path that missed the nested automation route) and dropped a
     dead `matchTrigger` call in dry-run (the query already filters triggerType).
   - `app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions.ts` (new)
     — the 7 actions. Mutations (create/update/delete/toggle) gate on
     `hasWorkspacePermission(ws, { organization: ["update"] })` — an
     admin-EXCLUSIVE verb, so viewer AND editor are both denied. Reads
     (list/log/dry-run) gate on `isWorkspaceMember(userId, ws)` so any member
     (incl. viewer) can read. **Isolation:** update/delete/toggle derive the
     workspace from the persisted rule (`rule.findUnique → workspaceId`), never
     from client input; a board-scoped create/update re-checks
     `board.workspaceId === ruleWorkspaceId`; the execution-log query scopes by
     `rule: { workspaceId }` (logs carry no workspaceId of their own). Denials use
     a not-found posture (never confirm existence to an unauthorized caller).
     dry-run runs the PURE matcher (no tx, no executor, no writes).
   - `lib/schemas/automation.ts` — added `deleteRuleSchema`,
     `toggleRuleEnabledSchema`, `listRulesSchema`, `ruleExecutionLogSchema`,
     `dryRunRulesSchema` (+ re-exported from `lib/schemas/index.ts`).
   - `lib/automation/cycle-check.ts` (new) — pure save-time static cycle
     advisory. `producedTriggerType`/`producedTriggerTypes` mirror the executor's
     `producedEvents` mapping; `detectStaticCycleWarnings` flags self-cycles and
     cross-rule chains against ENABLED workspace rules. Advisory ONLY — never
     blocks the save (the runtime ChainTracker guarantees halting). 12 unit tests.
   - `tests/server-actions/automation-rules.test.ts` (new) — 27 US-006-pattern
     tests: A1 auth, A2 viewer+editor denied on every mutation, A3
     cross-workspace + cross-board isolation, positive controls, viewer-ALLOWED
     reads, non-member-denied reads, and the self-cycle advisory round-trip.

9. **UI** — `/workspace/[slug]/automation` page: rule list, rule builder
   (shadcn Dialog), execution log panel. Consult `DESIGN.md` for tokens.

   **DONE (verified): tsc clean, production build clean (route registered),
   821/821 tests still pass (no regression), eslint clean.**
   - `app/(authenticated)/(dashboard)/workspace/[slug]/automation/page.tsx` (new)
     — server component: `verifySession` → resolve slug → membership gate
     (`notFound`) → `canManage = hasWorkspacePermission(ws, { organization:
     ["update"] })` (admin-exclusive; reads open to any member, affordances
     hidden for non-admins, actions re-enforce regardless). Fetches
     workspace-scoped boards (+their lists/labels), members, rules (position
     asc), and the latest 100 execution-log rows (`rule.workspaceId` relation
     scope); derives `lastRunByRule` (newest-first ⇒ first hit wins).
   - `components/workspace/automation/` (new): `automation-management.tsx`
     (shell + toast + id→name lookup maps), `rule-builder-dialog.tsx` (shadcn
     Dialog: name/description/board-scope/enabled `Switch`, trigger `Select` +
     conditional config fields per trigger, ordered action-step editor with
     up/down reorder + add/remove, client-side guard on id-bearing steps, clean
     payload assembly, save-time advisory `warnings` surfaced via toast),
     `rule-row.tsx` (enable `Switch` toggle, edit, delete via `AlertDialog`),
     `execution-log-panel.tsx` (status badges + `Refresh`), plus pure
     `rule-descriptors.ts` (trigger/action human labels + summarizers) and
     `types.ts` (client prop shapes).
   - `switch.tsx` added via `npx shadcn add switch` (no toggle primitive
     existed). Sidebar (`workspace-shell-sidebar.tsx`) gains an **Automation**
     nav link (`AiMagicIcon`).
   - DESIGN.md conformance: surface ladder + hairline borders (`rounded-lg
     border bg-card`), neutral text ramp (`text-muted-foreground`), brand blue
     reserved for the primary CTA / focus ring / `Switch` on-state, destructive
     reserved for the delete confirm — no hard-coded hex/px. Mirrors the members
     management surface (`max-w-3xl`, `divide-y` rows, fixed toast).
   - **Senior-review fixes folded in (no HIGH defects found; RBAC/isolation/
     payload correctness verified):**
     - M1 (MEDIUM) — board-scoped rules could reference off-board lists/labels
       (un-fireable trigger filter, or a surprise cross-board move). The builder
       now filters every list/label picker to the scoped board (`scopedOptions`)
       and `handleBoardChange` reconciles now-off-board config filters (→ "any")
       and action targets (→ first on-board default). Workspace-wide rules still
       see all lists/labels.
     - M2 (MEDIUM) — the action-step reorder/remove controls were raw 16px
       `<button>`s with no focus ring; swapped to `Button variant="ghost"
       size="icon"` (visible focus ring, 36px pointer target — matches the row
       delete affordance).
     - M3 (MEDIUM) — per-rule "Last run" was sliced from a global 100-row window
       (a rule could falsely read "Never run"). Replaced with a dedicated
       `distinct: ["ruleId"]` newest-first query in `page.tsx` — one accurate
       row per rule.
     - L1 — "Add action" now disables at the 20-action schema cap. L2 — the
       enable/disable `Switch` uses `useOptimistic` for immediate feedback with
       auto-reconcile. L3 — save-time cycle-loop warnings now surface as a
       persistent, manually-dismissed "warning" toast (was a 5s info toast).

10. **Docs + matrix update** — **DONE.** Authored `docs/product/automation.md`
    (model, 7 triggers + config filters, 8 ordered action steps + dynamic
    targets, inline transaction boundary, four-layer loop prevention, scheduled
    `due-date-approaching` pass, system-actor attribution, admin-only
    permissions, Server Actions/UI, proof). Added automation-attribution notes to
    `boards-and-cards.md` (trigger actions + rollback + system actor),
    `realtime-sync.md` (reuses existing events, no new types), `analytics.md`
    (system-actor `CardHistoryEvent` + `ruleId` metadata, never in member
    filter), `notifications.md` (`notify-member` post-commit + reminder dedup);
    added `automation.md` to `docs/product/README.md`. Added 4 rows +
    a US-066 Coverage-Snapshot bullet to `TEST_MATRIX.md` (engine 101 / scheduled
    8 / rule-management Server Actions 34 = 143 cases; UI untested). **Flagged
    discrepancy** (recorded in the rule-management matrix row): `deleteRuleAction`
    hard-deletes and `RuleExecutionLog` cascades, so deleting a rule removes its
    logs — contradicts the delete-confirm copy "Past execution-log entries are
    kept" and the log panel's dead "Deleted rule" fallback. Docs describe the
    actual (cascade) behavior; the UI-copy vs schema conflict is left for the
    human to resolve.

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
