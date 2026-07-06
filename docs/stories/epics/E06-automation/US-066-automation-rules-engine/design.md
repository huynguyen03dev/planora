# Design — US-066 Automation Rules Engine

## Domain Model

- **Rule** — a workspace-scoped, optionally board-scoped trigger → action
  definition. Has a `triggerType` (e.g. `card-moved-to-list`), an optional
  `triggerConfig` JSON (structured conditions: board, list, label, priority),
  an `actionType` (e.g. `set-priority`), and an `actionConfig` JSON (action
  parameters). Tracks `enabled` boolean, `position` float for same-trigger
  ordering, and standard timestamps.

- **RuleExecutionLog** — an append-only record of every rule evaluation attempt.
  Carries `ruleId`, `cardId` (if card-scoped), `status` (success/skipped/error/halted), `dedupKey` (scheduled-trigger idempotency),
  `error` message on failure, `chainId` (correlation id for loop-prevention
  tracing), and `chainDepth` at the time of execution. Indexed on `ruleId` and
  `cardId` for querying.

- **Loop prevention** — four-layer mechanism:
  1. **Chain correlation id** (`chainId: string`) — a UUID generated at the root
     triggering event, propagated through cascaded rule evaluations.
  2. **Hard depth cap** (`MAX_CHAIN_DEPTH = 5`) — if `chainDepth >= 5`, the
     cascade stops; the terminal skip is logged.
  3. **Per-chain dedup set** `(ruleId, cardId)` — prevents the same rule from
     acting on the same card twice within one chain (accounts for same-card
     loops). The dedup set lives in-memory for the chain duration; it is not
     persisted.
  4. **Save-time static warning** — when a rule is saved, if its `actionType`
     produces events matching its own `triggerType` (or a trigger type of another
     rule), the UI displays a warning ("This rule's action may trigger other
     rules — ensure loop guards are in place"). This is advisory only; the
     runtime guards are the authoritative protection.

- **System actor attribution** — rule-driven mutations write `CardHistoryEvent`
  rows as usual (analytics correctness) but carry metadata `{ ruleId }` so the
  event log can distinguish automation from human actions. The `userId` on these
  events is set to a seeded system user (a real User row: name "Planora
  Automation", reserved email, seeded by migration with a fixed UUID, no
  `Account` row so sign-in is impossible, never a workspace member; exposed as
  the `AUTOMATION_ACTOR_USER_ID` constant in `lib/automation/`). Notify-
  member and assignment notifications use the system user as the actor so
  recipients see "Planora Automation assigned you…". Socket.io events emitted
  by rule actions carry the same payload shape as human-driven equivalents (no
  new event types).
## Application Flow

### evaluateRules() hook placement

Rule evaluation is inserted into every Server Action that produces a trigger
event, positioned **inside the triggering Prisma transaction**, after the
trigger mutation and history writes, **before the transaction commits**:

```
1. verifySession()
2. hasWorkspacePermission(editor | admin)
3. workspace-isolation scope
4. Zod parse (input validation)
5. db.$transaction(async (tx) => {
     a. Prisma mutation (trigger event + CardHistoryEvent writes)
     b. evaluateRules(tx, workspaceId, triggerType, eventPayload,
                       { chainId, chainDepth })
        // Each action handler returns deferred-effect descriptors;
        // the executor does NOT emit socket events.
   })  // ← transaction commits here
6. revalidatePath()                         ← captures cumulative state
7. realtime emit (trigger events + rule deferred effects)
8. Return serializable result
```

When a rule action mutates a card (move, set priority, add label, etc.), that
mutation executes in the **same Prisma transaction** as the original trigger
(using the `tx` handle). This means if the rule action fails, both the
triggering mutation and the rule action roll back together.

**Deferred effects**: rule action handlers do NOT emit socket events directly.
Each handler returns typed "deferred effect" descriptors — event name + payload
(matching existing `lib/realtime/types.ts` event shapes) and pending
notify-member descriptors. `evaluateRules()` accumulates these; the triggering
Server Action fires them post-commit via the existing `emit*` helpers, after
its own trigger emits. Rule evaluation runs before `revalidatePath()` so the
revalidated page captures cumulative state (trigger + rule effects).

**Target validation**: action handlers must validate that action targets
(`targetListId`, `labelId`, `memberId`, etc.) resolve to resources within the
rule's workspace, matching the existing scope-resolver pattern. A
cross-workspace target is rejected with an error logged in `RuleExecutionLog`.

**Trigger invocation context**: triggers fire per Server Action invocation (a
drop, not a drag-move), so evaluation cost is per-drop — no drag-storm
concern. The board-store self-echo dedup that already exists for general
operations makes duplicate events safe.

Exceptions:

- `notify-member` (in-app notification) runs **post-commit** (after the
  transaction commits), consistent with the existing notification pipeline which
  operates outside the transaction boundary. Its deferred descriptor fires only
  after a successful commit; if the transaction aborts, it is discarded.
- Dry-run evaluations do not receive a `tx` handle; they perform non-mutating
  reads only.

**Error handling**: if a rule action throws inside the transaction, the entire
transaction aborts — the triggering mutation and all rule effects roll back
together, and every deferred effect (emits, `notify-member`) is discarded. The
`status: "error"` `RuleExecutionLog` row is written **after** the rollback, in
a separate write outside the failed transaction (a log row written inside it
would roll back with it). The Server Action returns a distinct error to the
user: "automation rule <name> failed; no changes were applied."

**Retry loops**: some trigger actions retry their transaction (e.g.
`moveCardAction` re-runs `db.$transaction` on `StaleNeighborError` during
float-gap renumbering). Rule evaluation lives inside each attempt; this is safe
because an aborted attempt rolls back its rule effects too — exactly one
application persists. Chain state (`chainId`, depth, dedup set) and the
deferred-effect accumulator are constructed fresh per attempt and discarded on
abort; deferred effects fire once, only after the final successful commit.

### Recursive evaluation

When a rule's action produces an event that matches another rule's trigger
(e.g. Rule A says "when a card is moved to Done, set priority HIGH" → the
priority set does not trigger any rule; but "move card to list" triggers
`card-moved-to-list`, which could trigger Rule B), the action handler invokes
`evaluateRules()` recursively with `chainDepth + 1` and the same `chainId`.
The depth cap and dedup set halt runaway chains.

### Module split under lib/automation/

```
lib/automation/
  matcher.ts         // Pure functions: matchTrigger(), evaluateConditions()
  executor.ts        // Sequence executor: runs a rule's ordered action list
                     // in order inside tx; per-type handlers call existing
                     // lib/card.ts / lib/list.ts transaction-body helpers (not
                     // the Server Actions). First failing step aborts the tx.
  resolver.ts        // Dynamic-target resolver (0022 R2): expands
                     // card-assignees / card-creator / remove-member "all" to
                     // concrete workspace-member ids at fire time; each
                     // resolved id is workspace-isolation-checked.
  evaluator.ts       // Orchestrator: evaluateRules() — fetches enabled rules,
                     //   calls matcher, respects loop guards, calls executor.
  types.ts           // TriggerType, ActionType, RuleEventPayload, etc.
  loop-guard.ts      // ChainTracker class: dedup set, depth check, chainId gen
  dry-run.ts         // DryRunEvaluator: captures what would fire, no mutations
  cron.ts            // due-date-approaching trigger: reads from scheduler tick
  index.ts           // Re-exports public API
```

### Rule CRUD actions

- `createRuleAction(data)` — `verifySession()` → `hasWorkspacePermission(admin)` →
  Zod parse (triggerType, actionType, configs, optional boardId) →
  `prisma.rule.create()` → save-time static cycle check → return rule.
- `updateRuleAction(id, data)`, `deleteRuleAction(id)` — same permission gate.
- `toggleRuleEnabledAction(id, enabled)` — admin only.
- `listRulesAction(workspaceId)` — `verifySession()` → any role → return rules.
- `getRuleExecutionLogAction(ruleId, pagination)` — any role, own workspace.

### Dry-run

`dryRunRulesAction(workspaceId, triggerType, eventPayload)` — runs the full
matcher pipeline without a `tx` handle, returns the list of rules that would
fire, what action they would execute, and the parameters. No mutations, no
log entries.

### Scheduled trigger: due-date-approaching

The existing `/api/cron/due-date-reminders` handler (15-min interval) is
extended: after processing due-date reminders, it queries enabled rules with
`triggerType = "due-date-approaching"`, evaluates their conditions against each
card with a due date in the configured window, and enqueues the matching
actions. This reuses the same cron tick; no new scheduler infrastructure.

Idempotency: each scheduled fire inserts its `RuleExecutionLog` row (with
`dedupKey = "<cardId>:<milestone>"`) in the **same transaction** as the rule
action, so a concurrent cron tick (multi-instance deployment) loses on the
`@@unique([ruleId, dedupKey])` violation and skips. `dedupKey` is null for
event-driven rows — Postgres treats nulls as distinct, so the constraint binds
only scheduled fires.

The built-in due-date reminder stays the canonical notifier (decision 0022 R3):
a `notify-member` step on a `due-date-approaching` rule deduplicates against the
reminder's milestone via the existing `CardReminder`
`@@unique([cardId, userId, milestone])` pattern — a member sent the built-in
reminder for a milestone is not also sent the rule notification for it.
Non-notify actions (move, label, set-priority) on this trigger are unaffected.

## Interface Contract

### Server Actions

| Action | Input | Output | Permission |
|--------|-------|--------|------------|
| `createRuleAction` | `CreateRuleInput` | `Rule` | admin |
| `updateRuleAction` | `UpdateRuleInput` | `Rule` | admin |
| `deleteRuleAction` | `{ id }` | `void` | admin |
| `toggleRuleEnabledAction` | `{ id, enabled }` | `Rule` | admin |
| `listRulesAction` | `{ workspaceId }` | `Rule[]` | any member |
| `getRuleExecutionLogAction` | `{ ruleId, cursor?, take? }` | `RuleExecutionLog[]` | any member |
| `dryRunRulesAction` | `{ workspaceId, triggerType, eventPayload }` | `DryRunResult[]` | editor+ |

### RuleEventPayload

```typescript
interface RuleEventPayload {
  cardId?: string;
  boardId?: string;
  listId?: string;
  listIdFrom?: string;
  listIdTo?: string;
  labelId?: string;
  memberId?: string;
  completed?: boolean;
  // Internal (not user-supplied)
  _chainId?: string;
  _chainDepth?: number;
}
```

### Errors

- `forbidden` — viewer tries to create/update/delete/enable/disable rules.
- `not-found` — rule or execution log entry not found (or wrong workspace).
- `validation-error` — Zod parse failure on trigger/action config.
- `cycle-warning` — save-time static cycle detected (non-blocking, advisory).

## Data Model

```prisma
model Rule {
  id            String   @id @default(uuid())
  workspaceId   String
  boardId       String?  // optional; null = workspace-wide
  name          String
  description   String?
  enabled       Boolean  @default(true)
  triggerType   String   // "card-created" | "card-moved-to-list" | etc.
  triggerConfig Json     // { boardId?, listId?, fromListId?, labelId?, priority?, beforeMinutes? }
  actions       Json     // ordered array of action steps (0022 R1):
                         //   [{ type, targetListId?, priority?, labelId?,
                         //      memberId?, recipient?, scope?, message? }]
                         //   targets: fixed IDs or dynamic tokens (0022 R2) —
                         //   recipient: card-assignees|card-creator|<userId>,
                         //   remove-member scope: all|<userId>
  position      Float    // execution ordering for same-triggerType rules
  createdBy     String   // userId who created the rule
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  board     Board?    @relation(fields: [boardId], references: [id], onDelete: Cascade)
  creator   User      @relation(fields: [createdBy], references: [id])

  @@index([workspaceId, triggerType])
  @@index([workspaceId, enabled])
  @@map("rule")
}

model RuleExecutionLog {
  id          String   @id @default(uuid())
  ruleId      String
  chainId     String?  // correlation id for loop-prevention tracing
  chainDepth  Int      @default(0)
  cardId      String?
  actionType  String   // action step type executed; "sequence" for a multi-step rule-fire summary
  triggerType String
  status      String   // "success" | "skipped" | "error" | "halted"
  error       String?
  dedupKey    String?  // scheduled-trigger idempotency: @@unique([ruleId, dedupKey])
  metadata    Json?    // { dryRun?: boolean; matchedConditions?: boolean; }
  executedAt  DateTime @default(now())

  rule Rule @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  @@unique([ruleId, dedupKey])
  @@index([ruleId, executedAt])
  @@index([cardId])
  @@index([chainId])
  @@map("ruleExecutionLog")
}
```

### Migration

```bash
npx prisma migrate dev --name add_automation_rules
npx prisma generate
```

No backfill needed — new tables, no existing data to transform.

## UI / Platform Impact

- **New route**: `/workspace/[slug]/automation` — rule list (table with
  enabled/disabled toggle, trigger, action, last-run column) and a structured
  rule builder.
- **Rule builder**: shadcn Dialog with Select/Input primitives. Left column:
  trigger type selector → condition filters (board picker, list picker, label
  picker, priority select). Right column: action type selector → action
  parameters. Save button runs the save-time cycle check and posts the advisory
  warning if cycles are detected.
- **Execution log view**: collapsible panel showing the last N execution entries
  for each rule with status badges, timestamps, and error details.
- **Design tokens**: consult `DESIGN.md` for dialog, select, and table
  conventions. Use `bg-card`, `text-muted-foreground`, `rounded-lg`, etc.
- **Realtime impact**: none. Rule-driven mutations emit the same typed socket
  events (`card:moved`, `card:labels-updated`, etc.) that already exist. No new
  event types in v1.
- **Platform**: the scheduler extension (due-date-approaching trigger) runs in
  the existing cron handler at `/api/cron/due-date-reminders`; no new server
  entry point.

## Observability

- Every rule evaluation attempt writes a `RuleExecutionLog` row (success, skip,
  or error). This is the primary audit trail.
- `CardHistoryEvent` rows written by rule actions carry `metadata: { ruleId:
  "..." }` so analytics and card-history feeds can distinguish automation from
  human actions.
- Save-time static cycle warnings are advisory only and logged to the UI, not
  to a persistent store.
- Chain termination events (depth cap hit, dedup skip) are recorded with
  `status: "halted"` (chain halted at depth cap) or `status: "skipped"`
  (dedup skipped) with a descriptive `error` field (e.g.
  `"chain depth limit reached"`). These are visible in the execution-log UI
  alongside `success` and `error` entries.

## Alternatives Considered

1. **Background job queue for all rule actions** — rejected for v1: adds
   infrastructure complexity (the job queue is a separate feature). v1 runs
   card-mutating actions inline in the same transaction; `notify-member` runs
   post-commit to match existing patterns.

2. **Freeform DSL for conditions** — rejected for v1: increases validation
   surface and UX complexity. v1 uses structured JSON filters with Zod
   validation. DSL is a v2 candidate.

3. **Per-rule permission model** — rejected for v1: adds significant UI and
   authorization complexity. v1 uses workspace-level RBAC (admin-only mutations,
   all-member read). Custom per-rule permissions are a v2 candidate.

4. **Separate background scheduler for scheduled rules** — rejected: the existing
   due-date reminder cron tick is sufficient for the v1 `due-date-approaching`
   trigger. A general scheduler infrastructure is a v2 concern.
