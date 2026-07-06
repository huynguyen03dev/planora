# Validation — US-066 Automation Rules Engine

## Proof Strategy

A new data model (2 tables), a new `lib/automation/` module with 5+ submodules,
hook wiring into every card-mutating Server Action (6 trigger sites), a
scheduled trigger extending an existing cron handler, and a full RBAC layer —
each must be proven independently and as a chain. This is the codebase's first
automation-engine test surface; the pure-matcher tests establish a precedent for
testing business logic without Prisma, while the integration tests follow the
established Server Action test pattern (mocked `db`).

The loop-prevention proof is the highest-risk item: an infinite cascade must be
impossible under any rule configuration. This is proven by a synthetic chain of
mutually-triggering rules verified at depth-5 termination.

## Test Plan

| Layer | Cases |
| --- | --- |
| **Unit** | **Matcher** (~8): `matchTrigger` returns true for matching trigger type, false otherwise; `evaluateConditions` matches by boardId, listId, labelId, priority — exact match and no-match; all conditions combined (AND semantics); empty config matches everything. **Loop guard** (~5): `ChainTracker` starts at depth 0; increment returns depths 1..4; depth 5 returns false (halt); `isDuplicate(ruleId, cardId)` returns true for repeated same pair; different cardId passes dedup; different ruleId passes dedup. **Resolver** (~4, 0022 R2): `card-assignees` resolves to the card's current members; `card-creator` resolves to the creator; remove-member `all` resolves to every member; a token resolving to a member outside the rule's workspace is rejected. **Dry-run** (~2): dry-run evaluator returns rule list without executing; no log entries written. |
| **Integration** | **Action execution** (~8): each action type (move-card-to-list, set-priority, add-label, remove-label, assign-member, remove-member, set-completion, notify-member) called through the executor with mocked Prisma asserts correct DB state changes. **Sequence execution** (~3, 0022 R1): a multi-action rule runs its steps in order (assert cumulative DB state); the first failing step aborts the whole sequence and transaction (assert no step's effect persists); a `notify-member` step in a sequence still fires only post-commit. **Chain termination** (~3): two rules that trigger each other (A→B→A) asserted to stop at depth 5 with correct log entries; third rule in chain also halts; single rule that triggers itself halts at depth 2 (dedup catches the self-loop on second invocation). **Idempotent delivery** (~1): same `(ruleId, cardId)` pair submitted twice in one chain asserts second is skipped (dedup). **Transaction boundary** (~3): rule action failure within transaction causes the triggering mutation to roll back (assert card not created/moved/updated on error); deferred effects are discarded on rollback (assert no notification fired after a failed chain); error `RuleExecutionLog` row persists after rollback (written outside the failed transaction). **Dry-run integration** (~1): `dryRunRulesAction` returns matching rules; zero mutations in DB. **Workspace isolation** (~3): rule from workspace A never fires on workspace B events; cross-workspace `dryRunRulesAction` returns empty; rule action with cross-workspace target (e.g. `targetListId` from workspace B) is rejected. |
| **RBAC integration** | **Sabotage tests** (~6, US-006 pattern): viewer cannot createRuleAction, cannot updateRuleAction, cannot deleteRuleAction, cannot toggleRuleEnabledAction; editor cannot createRuleAction (v1 restricts rule creation to admin only); cross-workspace rule CRUD denied for admin of workspace A against workspace B. **Positive RBAC** (~1): viewer CAN list rules and view execution log. |
| **Scheduled trigger** | **due-date-approaching** (~4): card with due date inside the configured window fires the action; card outside the window does not; card with no due date is skipped; a `notify-member` step dedups against the built-in reminder milestone so the member is not double-notified (0022 R3). |
| **E2E** | n/a (no playwright harness for automation UI — covered by Platform). |
| **Platform** | Manual browser QA: create a rule via the UI, verify it appears in the list; toggle enabled/disabled; edit rule; delete rule; verify execution log entries appear after trigger events fire; verify `notify-member` creates an in-app notification; verify dry-run result matches expectation without side effects. Light/dark mode consistency for the automation page. |
| **Performance** | Single-rule evaluation adds <10ms to a Server Action; workspace with 50 rules on the same trigger type stays under 100ms overhead (rule fetch is indexed, conditions are pure JSON parse). No N+1 queries. |
| **Logs/Audit** | `RuleExecutionLog` row per evaluation attempt (success, skipped, error, halted). Chain-termination events logged as `halted` (depth cap) or `skipped` (dedup) with explanatory error. `CardHistoryEvent` rows from rule actions carry `metadata.ruleId`. |

**Total automated cases: ~52** (19 unit + 22 integration + 7 RBAC/workspace-isolation + 4 scheduled trigger). The delta over the original ~44 covers the 0022 R1/R2/R3 refinements: resolver unit tests (+4), sequence execution (+3), and due-date notify dedup (+1).

## Fixtures

- A workspace with a board, multiple lists, multiple cards, labels, members.
- A set of rules in that workspace covering all trigger/action combinations.
- A second workspace with its own rules, for isolation tests.
- Three test users: admin, editor, viewer (all members of workspace 1; only admin in workspace 2).
- A synthetic rule chain (Rule A: card-moved-to-list → move to next list; Rule B: card-moved-to-list → move to next list) for loop-prevention tests.

## Commands

```text
# Pure matcher unit tests:
npx vitest run lib/automation/matcher.test.ts

# Loop guard unit tests:
npx vitest run lib/automation/loop-guard.test.ts

# Dry-run unit tests:
npx vitest run lib/automation/dry-run.test.ts

# Executor integration tests (mocked Prisma; action execution, chain
# termination, idempotency, transaction boundary):
npx vitest run lib/automation/executor.test.ts

# Evaluator + hook integration tests:
npx vitest run lib/automation/evaluator.test.ts

# Rule CRUD + RBAC sabotage + workspace isolation:
npx vitest run tests/server-actions/automation-rules.test.ts

# Cron handler extension + scheduled trigger:
npx vitest run lib/automation/cron.test.ts

# Full gate (all tests):
npm test
```

## Acceptance Evidence

Add test results (pass counts from each test file) after verification, with
screenshots of the automation page (rule list, rule builder dialog, execution
log panel). Link decision 0022.
