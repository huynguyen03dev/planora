# 0022 Automation Rules Engine

Date: 2026-07-06

## Status

Accepted

## Context

Planora has no automation rules engine (Butler-style triggers and actions). All
card mutations are manual. A prior architecture analysis (pi-features.txt)
identified this as the high-impact feature with the strongest engineering signal.

The design must resolve several locked choices before implementation:

1. **Where in the Server Action pipeline does rule evaluation run?** — inline
   (same transaction) or deferred (separate queue)?
2. **Which actions run inline vs. post-commit?** — all card-mutating actions
   could run in the trigger's transaction; notification actions might need to
   run post-commit.
3. **How is loop prevention implemented?** — depth cap, dedup set, chain
   correlation id — but should the dedup set be persisted?
4. **Who can manage rules?** — all workspace members, or admin-only?
5. **How are rule-driven mutations attributed?** — regular userId, system
   actor, or a different mechanism?

## Decision

1. **Evaluation hook placement**: `evaluateRules()` runs **inside the
   trigger's Prisma transaction**, after the trigger mutation and history writes,
   **before the transaction commits**. The transaction handle (`tx`) is passed to
   the evaluator for card-mutating actions. Post-commit effects (realtime emit)
   fire after the transaction commits, via deferred effect descriptors returned
   by the executor. This ensures rule-driven mutations are atomic with the
   triggering mutation and the revalidated page captures cumulative state.

2. **Transaction boundary**: card-mutating rule actions (`move-card-to-list`,
   `set-priority`, `add-label`, `remove-label`, `assign-member`, `remove-member`,
   `set-completion`) execute **inline in the same Prisma transaction** as the
   triggering mutation. If a rule action fails, the entire trigger + action set
   rolls back. Action handlers do NOT emit socket events directly; they return
   deferred-effect descriptors that the triggering Server Action fires
   post-commit via existing `emit*` helpers. `notify-member` runs **post-commit**
   (after the transaction commits), consistent with the existing notification
   pipeline; its descriptor is discarded if the transaction aborts.

   **Error semantics**: a rule action that throws aborts the whole transaction —
   trigger and rule effects roll back together, all deferred effects are
   discarded, and the `status: "error"` `RuleExecutionLog` row is written after
   the rollback (outside the failed transaction). The user receives a distinct
   error: "automation rule <name> failed; no changes were applied."

   **Ordering note**: decision 0032 supersedes the earlier retry-loop wording
   for card and list moves. Ordering now uses one workspace-gated transaction
   protocol shared by human and automation moves; stale revisions or
   contradictory anchors return `ORDER_CONFLICT` for resynchronization rather
   than retrying with a changed hint. `evaluateRules()` and the central
   `executeRuleActions()` boundary acquire the workspace serialization gate
   before ordered action steps can mutate or lock a card; recursive calls
   safely re-acquire the same row in the shared transaction. The workspace gate
   is the deadlock-prevention boundary, and the move helper preserves sorted
   board/list-before-card locking inside it. Rule evaluation remains inside the
   same transaction, and committed effects fire once after commit.

3. **Loop prevention**: four-layer mechanism:
   - **Chain correlation id** (`chainId`) — a UUID generated at the root
     triggering event, propagated through cascaded rule evaluations for
     tracing.
   - **Hard depth cap**: `MAX_CHAIN_DEPTH = 5`. The cascade halts at depth 5;
     the terminal skip is logged as `status: "halted"`.
   - **Per-chain dedup set**: `Set<string>` of `(ruleId, cardId)` pairs, kept
     in-memory for the chain duration. Not persisted — a chain is ephemeral
     (single request scope). This prevents the same rule from acting on the
     same card twice within one chain.
   - **Save-time static warning**: advisory UI warning when a rule's
     actionType produces events matching its own or another rule's triggerType.
     Non-blocking.

   Scheduled-trigger idempotency is handled by a separate `dedupKey` field on
   `RuleExecutionLog` with `@@unique([ruleId, dedupKey])`. For
   `due-date-approaching`, the key is `"<cardId>:<milestone>"` so N concurrent
   cron ticks apply each scheduled rule at most once. This mirrors the
   `CardReminder` dedup pattern (`@@unique([cardId, userId, milestone])`).

4. **Rule management permissions**: only workspace **admins** can create,
   update, delete, enable, or disable rules. Editors and viewers get read-only
   access to the rule list and execution log. Enforcement via
   `hasWorkspacePermission(admin)` for mutations.

5. **System-actor attribution**: rule-driven mutations write `CardHistoryEvent`
   rows as usual (analytics correctness) with `userId` set to a seeded system
   user (a real `User` row: name "Planora Automation", reserved email, unusable
   credentials, never a workspace member; exposed as
   `AUTOMATION_ACTOR_USER_ID` constant in `lib/automation/`) and `metadata:
   { ruleId: "<rule-uuid>" }`. This ensures analytics can distinguish automation
   from human actions. Notify-member and assignment notifications use the system
   user as the actor so recipients see "Planora Automation assigned you…".
   Socket.io events emitted by rule actions carry the same payload shape as
   human-driven equivalents (no new event types).

6. **Condition format**: structured JSON with Zod validation — `{ boardId?,
   listId?, labelId?, priority? }`. No freeform DSL in v1.

7. **Dry-run**: evaluate rules against an event payload without a transaction
   handle; return the matching rule list with no side effects; no log entries.

## Pre-Implementation Refinements (2026-07-06)

A pre-implementation review of the trigger/action catalog against realistic
user automations surfaced three expressiveness gaps. The following refinements
are adopted; they **extend** (not override) the decisions above.

**R1 — Ordered action sequence per rule.** A rule runs an *ordered list* of
actions, not a single action (Butler parity). The single `Rule.actionType` +
`actionConfig` fields become `Rule.actions Json` — an ordered array of
`{ type, ...params }` step descriptors. The whole sequence executes inside the
trigger transaction, in order; the first step that throws aborts the whole
transaction (every prior step in the sequence rolls back with it). Steps are
individually logged. `notify-member` steps still fire post-commit. *Rationale:*
multi-step follow-ups ("complete → remove label → notify") are the common case;
one-rule-per-action bloats the rule list and the builder UI.

**R2 — Dynamic action targets.** Alongside fixed IDs, a small set of dynamic
target tokens resolve from the triggering card/event at fire time:

- `notify-member` / `assign-member` `recipient`: `card-assignees` |
  `card-creator` | `<fixed userId>`
- `remove-member` `scope`: `all` | `<fixed userId>`

A resolver in the executor expands these to concrete workspace-member ids at
execution, subject to the **same workspace-isolation check** as fixed targets
(a resolved member outside the rule's workspace is rejected and logged). Fixed
IDs remain fully supported. *Rationale:* "notify whoever is assigned" and
"remove all members" are the highest-value automations and are inexpressible
with fixed IDs.

**R3 — `due-date-approaching` supplements the built-in reminder; notifications
dedup.** The existing due-date reminder scheduler (24h window) stays the
canonical notifier. `due-date-approaching` rules add non-notify actions (move,
label, set-priority) freely; a rule's `notify-member` step on a due-date
trigger deduplicates against the reminder's milestone via the existing
`CardReminder` `@@unique([cardId, userId, milestone])` pattern, so a member
never receives both a built-in reminder and a rule notification for the same
milestone. *Rationale:* react to approaching due dates without double-notifying.

## Alternatives Considered

1. **Deferred evaluation (background job queue)** — rejected for v1: adds
   infrastructure complexity (the job queue is a separate feature). Rules would
   see stale state if the queue backs up. Inline execution is simpler and
   ensures atomicity. The job queue can be added in v2 for heavy actions
   (webhooks, email) while keeping card-mutating actions inline.

2. **All actions run post-commit** — rejected: a rule action that fails after
   the trigger commits leaves the system in an inconsistent state (trigger
   applied, action not). Card-mutating actions must share the trigger's
   transaction. Non-mutating actions (notify) may run post-commit.

3. **Persisted dedup set** — rejected: the dedup set lives only for the
   duration of a single request chain. Persisting it would require a new table
   and a TTL-based cleanup job. The ephemeral in-memory set is sufficient
   because a chain is synchronous (single request) and depth-capped at 5.

4. **Editor-level rule creation** — rejected for v1: rule definitions have
   broad effects (any card in the workspace can be mutated). Restricting to
   admin-only on day one is safer; the permission can be relaxed in v2 with
   per-rule RBAC if warranted.

5. **Regular userId attribution for rule actions** — rejected: using a real
   user's id for automated actions would inflate that user's action counts,
   break analytics filtering, and confuse the card-history feed. A seeded system
   user with `ruleId` metadata is cleaner.

6. **Nullable userId columns on audit tables** — rejected: making `userId`
   nullable on `CardHistoryEvent` / `Activity` would be a more invasive schema
   change touching the existing audit contract, requiring nullable FK migrations
   across multiple tables. The seeded system user preserves the non-null
   `userId` constraint everywhere.

## Consequences

Positive:

- Rule actions are transactionally atomic with triggering mutations — no
  half-applied state.
- Loop prevention halts every same-request cascade: chain correlation id +
  depth cap + dedup set + static warning. Cross-request cascades are out of
  scope for v1 (see Follow-Up).
- Admin-only rule management is safe for v1 and matches the Butler pattern
  (workspace owners create automations).
- System-actor attribution keeps the analytics event model clean.
- Dry-run enables safe testing without side effects.

Tradeoffs:

- Card-mutating rule actions extend the transaction lifetime of every
  triggering Server Action. Each action adds one or more Prisma operations to
  the transaction. Latency impact should be monitored.
- Inline evaluation means the system-actor runs inside the user's request. If a
  rule action crashes (unhandled exception), the whole transaction rolls back —
  the user's own action is undone by a rule they didn't write. The error message
  must make this explicit: "automation rule <name> failed; no changes were
  applied" (and the error execution-log row survives, written post-rollback).
- Non-persisted dedup set means a second independent request (new chainId) can
  apply the same rule to the same card again. This is correct behavior (each
  user action is a separate trigger event), but must be verified in testing.

## Follow-Up

- Implement as US-066 under E06-automation.
- Author `docs/product/automation.md` at implementation time.
- Monitor Server Action p99 latency after hook wiring; consider adding a
  per-rule-evaluation timeout if latency impact exceeds 50ms.
- Evaluate v2 candidates: webhook actions, generic scheduled rules, DSL,
  persisting the dedup set for cross-request loop prevention, per-rule
  permissions.
