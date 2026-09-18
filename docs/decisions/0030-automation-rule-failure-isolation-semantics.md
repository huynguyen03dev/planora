# 0030 Automation Rule Failure Isolation Semantics

Date: 2026-08-01

## Status

Accepted — gates implementation of story US-075. Refines decision 0022 (automation rules engine) failure-handling semantics; does not overturn 0022's in-trigger-transaction placement.

## Context

Decision 0022 places rule evaluation INSIDE the triggering card mutation's Prisma transaction (verified: `app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts` createCardAction calls `evaluateRules` inside `db.$transaction`; comment: "Rule-driven mutations share this tx and roll back with it"). The executor (`lib/automation/executor.ts` `executeRuleActions`) runs a rule's action steps sequentially in that shared tx with NO per-step try/catch — "First failing step throws → aborts the tx." Stale targets already throw structured `RuleExecutionError`s (target list not-found / archived / foreign-workspace; member/label resolution).

Consequence today: a single stale rule target rolls back the user's OWN card edit and surfaces "Automation rule … failed; no changes were applied." This is the data-trust bug US-075 exists to kill.

US-075 left one decision open: Option A (strict rollback of the whole rule) vs Option B (best-effort continuation).

## Decision

Adopt **Option B (best-effort continuation)** with a **two-class error taxonomy**:

1. **Structured `RuleExecutionError` (expected/stale-target class) — ISOLATED.** The executor catches each step's `RuleExecutionError` inside the shared tx, writes a per-step audit (structured code + stale target id) into `RuleExecutionLog.metadata`, and CONTINUES to the next independent action step. The primary mutation commits. Overall rule status is `partially_failed` when ≥1 step failed and ≥1 succeeded, `failed` when all steps failed, `success` otherwise.

2. **Unexpected / systemic errors (non-`RuleExecutionError`) — ABORT (current behavior retained).** These propagate, abort the shared tx, and are logged post-rollback via the existing `logRuleExecutionError` path. Rationale: an unexpected error mid-write may poison the interactive tx (further ops / commit would fail), so catch-and-continue is unsafe; abort is the conservative default for a data-integrity application. These are rare and out of US-075's stale-target scope (AC1).

Structured stale-target codes: `TARGET_LIST_NOT_FOUND`, `TARGET_LIST_ARCHIVED`, `TARGET_LIST_FOREIGN_WORKSPACE`, `TARGET_LIST_CROSS_BOARD` (same-board invariant: the target list is in the workspace but on a different board than the card), `MEMBER_NOT_IN_WORKSPACE`, `LABEL_NOT_FOUND`.

## Why not Option A (strict rule rollback)

Rolling back only the rule's steps while preserving the primary mutation requires EITHER moving rule execution to a separate post-commit transaction (overturns 0022's in-tx placement and breaks the claim-first dedup `@@unique([ruleId, dedupKey])` + `moveCardAction` retry machinery that assume in-tx execution) OR Prisma savepoints (not exposed by Prisma's interactive-tx API). Not buildable in-scope. Option B is the minimal delta: per-step try/catch in the existing executor loop, reusing the already-structured `RuleExecutionError`.

## Invariants (acceptance criteria)

1. A structured stale-target failure in any rule step NEVER rolls back the primary card mutation; the user's action commits and returns success.
2. Every rule execution writes ≥1 `RuleExecutionLog` row. Isolated failures carry per-step structured codes + the stale target id in `metadata`; status ∈ {`success`, `partially_failed`, `failed`, `skipped`, `halted`}.
3. Remaining independent steps after an isolated step failure still execute and commit (best-effort).
4. Unexpected (non-`RuleExecutionError`) failures retain current abort + post-rollback log behavior.
5. Deferred effects (`fireDeferredEffects`, already post-commit + best-effort) fire ONLY for steps that committed; no effect for an isolated-failed step.
6. Claim-first scheduled dedup integrity: a partially-succeeded rule KEEPS its claim (no retry double-applies successful steps); only fully-aborted (unexpected-error) attempts remain retryable.
7. Cascades recurse only on `producedEvents` from succeeded steps.

## Consequences

+ User card edits no longer fail due to stale automation targets (kills the F4 collateral-damage bug).
+ Per-step diagnostics let admins identify and clean stale target IDs (AC4).
+ Minimal architectural delta; decision 0022's placement preserved.

− The user-facing message "no changes were applied" is retired for the isolated class (the action now succeeds); it remains only for the rare unexpected-error abort. This is a deliberate product-semantics shift.
− `RuleExecutionLog` rows grow with per-step detail (bounded; `metadata` JSON, no schema migration required).
