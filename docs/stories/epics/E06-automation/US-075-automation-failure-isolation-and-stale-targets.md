# US-075 Automation Rule Failure Isolation & Stale Target Handling

## Status

planned — implementation unstarted.

## Lane

normal

## Product Contract

When an automation rule fires during a card transaction, failures during action execution (such as missing target lists, unassigned members, or deleted labels) must be isolated so they do not crash the primary card mutation or corrupt workspace data. Every execution attempt (success, partial success, or failure) must record structured audit logs in `RuleExecutionLog`.

## Relevant Product Docs

- `docs/product/automation.md` — rule execution boundary, error handling, and audit logging.
- `docs/decisions/0022-automation-rules-engine.md` — Butler-style automation engine decision.

## Future Decision Gate (Inside Packet)

**Strict vs. Best-Effort Execution Gate:**
- **Option A (Strict Rollback):** If any action in a multi-action rule fails, roll back all actions in that rule and log the failure.
- **Option B (Best-Effort Continuation):** If an action step fails (e.g. target label deleted), log the failure for that specific step and continue executing remaining independent action steps in the rule chain.
*The decision between Option A and Option B will be resolved and recorded in a decision update prior to implementing US-075.*

## Acceptance Criteria

1. If a rule action targets an entity that no longer exists (e.g., a list or member that was deleted), the engine catches the missing target error gracefully instead of throwing an unhandled exception.
2. The user's triggering action (e.g. moving a card or updating priority) completes successfully and commits to the database.
3. The rule execution is recorded in `RuleExecutionLog` with `status: "failed"` or `"partially_failed"`, capturing the exact step error details in `errorDetails`.
4. Auditability is preserved: admins can inspect failed rule executions in the Automation Execution Log panel to identify stale target IDs.

## Design Notes

- **Commands:** `evaluateRulesForEvent`, `executeRuleActions`.
- **Queries:** `getRuleExecutionLog`.
- **Tables:** `RuleExecutionLog`, `AutomationRule`.
- **Domain Rules:** Primary mutation safety precedes rule action execution; stale targets log explicit diagnostic messages (`TARGET_LIST_NOT_FOUND`, `MEMBER_NOT_IN_WORKSPACE`).

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Rule engine evaluator, matcher, and executor handling missing target IDs cleanly |
| Integration | Dedicated integration test covering stale target + trigger-action isolation/rollback semantics together (`tests/server-actions/automation-failure-isolation.test.ts`) |
| E2E | Triggering a rule with a deleted target list records a failure log in the Automation UI without breaking card drag |
| Platform | N/A |
| Release | Verify `RuleExecutionLog` surfaces error diagnostics in UI |

## Command Verification (Pre-Implementation Placeholder)

```bash
# Integration & Failure Isolation
npx vitest run tests/server-actions/automation-failure-isolation.test.ts
```

## Harness Delta

Update `docs/TEST_MATRIX.md` row for automation failure isolation.

## Evidence

Implementation unstarted. Commands and proof will be added after development.
