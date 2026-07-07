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

# Dynamic-target resolver (0022 R2):
npx vitest run lib/automation/resolver.test.ts

# Save-time static cycle-warning detection:
npx vitest run lib/automation/cycle-check.test.ts

# Executor integration tests (mocked Prisma; action execution, chain
# termination, idempotency, transaction boundary):
npx vitest run lib/automation/executor.test.ts

# Deferred-effect descriptor → emitter mapping (post-commit):
npx vitest run lib/automation/effects.test.ts

# Evaluator: matching, logging, loop prevention, error semantics,
# scheduled window gate, dedupKey claim-first mode (dry-run covered here + below):
npx vitest run lib/automation/evaluator.test.ts

# Rule CRUD + RBAC sabotage + workspace isolation + dry-run:
npx vitest run tests/server-actions/automation-rules.test.ts

# Scheduled due-date-approaching pass + two-tier dedup (drives via the cron route):
npx vitest run tests/automation-scheduled.test.ts

# Full gate (all tests):
npm test
```

> Note: the test layout landed differently from the original plan — dry-run is
> proven inside `evaluator.test.ts` + `automation-rules.test.ts` (no separate
> `dry-run.test.ts`); the scheduled trigger is `tests/automation-scheduled.test.ts`
> (not `lib/automation/cron.test.ts`); and `resolver`/`cycle-check`/`effects` are
> their own files. Coverage came in far above the ~52-case plan (see below).

## Acceptance Evidence

Verified 2026-07-07 on branch `feat/us-066-automation-rules-engine` (Phase 11).

### Gates (full suite)

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | **0 errors** |
| `eslint` | **0 errors in real source** (2 unused-var *warnings* in `effects.test.ts` / `evaluator.test.ts`; the 53 errors eslint reported are all generated `.next/` artifacts inside an unrelated sibling worktree `.claude/worktrees/unify-invitations-into-bell/` — not US-066, not seen by CI's clean checkout) |
| `npm test` | **821 / 821 passed** (40 files) |
| `npm run build` | **success** — route manifest includes `ƒ /workspace/[slug]/automation` |

### Automation coverage (143 automated cases)

| File | Cases | Layer |
| --- | --- | --- |
| `lib/automation/matcher.test.ts` | 19 | unit — trigger↔config field mapping incl. move destination/source |
| `lib/automation/resolver.test.ts` | 13 | unit — dynamic-token expansion under workspace isolation (0022 R2) |
| `lib/automation/loop-guard.test.ts` | 18 | unit — `ChainTracker` root/child, depth cap 5, `(ruleId,cardId)` dedup |
| `lib/automation/cycle-check.test.ts` | 12 | unit — action→trigger mapping + static cycle-warning detection |
| `lib/automation/executor.test.ts` | 20 | integration — each action step's tx effect |
| `lib/automation/effects.test.ts` | 7 | integration — deferred descriptor → `emit*` mapping (best-effort) |
| `lib/automation/evaluator.test.ts` | 12 | integration — match/log, loop prevention, error rollback, scheduled gate, dedupKey claim-first |
| `tests/automation-scheduled.test.ts` | 8 | integration — `due-date-approaching` two-tier dedup |
| `tests/server-actions/automation-rules.test.ts` | 34 | integration — admin-only CRUD/toggle + member-read list/log + dry-run + isolation |
| **Total** | **143** | (far above the ~52-case plan) |

### Decision 0022 conformance

All 16 design clauses (§1–7 + R1/R2/R3) audited **IMPLEMENTED, 0 diverged, 0
missing**, each backed by file:line evidence. Independent spot-checks confirmed
the load-bearing ones: `evaluateRules({ client: tx })` runs inside the trigger
transaction (5 call sites in `boards/[boardId]/actions.ts`); the `status:"error"`
`RuleExecutionLog` row is written via the **top-level `db`** (`effects.ts:101`),
so it survives rollback; system-actor attribution via `AUTOMATION_ACTOR_USER_ID`
(`evaluator.ts:82`); socket effects reuse existing `emit*` helpers (no new event
types). See decision `docs/decisions/0022-automation-rules-engine.md`.

### Outstanding for full acceptance

- **Platform / manual browser QA — NOT yet done.** The validation plan calls for
  UI QA + screenshots (create/toggle/edit/delete a rule, execution-log entries
  after a trigger fires, `notify-member` producing an in-app notification,
  dry-run, light/dark). The engine is proven; the React management UI
  (`components/workspace/automation/`) has **no** automated coverage (standing
  no-RTL gap) and no manual QA recorded. This is the one open acceptance item.
- **~~Known discrepancy (tracked)~~ — RESOLVED 2026-07-07 (keep-logs).** The
  delete-confirm copy already promised "Past execution-log entries are kept" and
  the log panel already had a "Deleted rule" fallback, so retention was the
  intended design and the cascade was the bug. Fixed by denormalizing
  `workspaceId` + `ruleName` onto `RuleExecutionLog` (the `CardHistoryEvent`
  survival pattern) and switching the rule FK from `onDelete: Cascade` to
  `onDelete: SetNull` with a nullable `ruleId`
  (migration `20260707021956_automation_logs_survive_rule_deletion`, backfilled
  from the rule join so `migrate deploy` is safe on populated data). All three
  log-write sites now persist the denormalized columns; the read query + page
  loader scope by the log's own `workspaceId` (so orphaned logs stay visible).
  Proof: `evaluator.test.ts` asserts the write-path denormalization;
  `automation-rules.test.ts` adds an orphaned-log (`ruleId: null`) retrieval
  test. Gates green (tsc 0, eslint 0 errors, 822/822).
