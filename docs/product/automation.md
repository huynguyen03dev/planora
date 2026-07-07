# Automation

Butler-style automation rules: when something happens on a card (**trigger**),
run an ordered sequence of card actions (**actions**). Rules are managed per
workspace at `/workspace/[slug]/automation` (the cross-board manager) and
per board via the **Automation** button in the board header, which opens a modal
scoped to that board (rules that fire on it — `boardId ∈ {board, null}`). Both
surfaces render the same `AutomationContent`, fed by `loadAutomationView`
(`lib/automation/view.ts`); the board modal fetches lazily on open through
`getBoardAutomationDataAction`, so a board that never touches automation adds no
queries to its page load. Evaluation lives in `lib/automation/`, gated by
decision 0022. Rule-driven mutations go through the same Server Action → Prisma
→ history → realtime path as human edits, attributed to a seeded system user so
analytics can tell them apart.

## Model

A `Rule` (per workspace) carries: `name`, optional `description`, `enabled`,
`boardId?` (**scope** — `null` means every board in the workspace), `triggerType`,
`triggerConfig` JSON, and `actions` JSON (an ordered array of step descriptors).
`position` orders the rule list; `createdBy` records the author. Rules cascade
with their workspace, and a board-scoped rule cascades with its board.

Every evaluation writes `RuleExecutionLog` rows (one per action step) with
`status`, `chainId`, `chainDepth`, optional `error`, `dedupKey`, and
`metadata` — the audit trail behind the execution-log panel. Log rows **survive
their rule's deletion**: the rule FK is `onDelete: SetNull` (so `ruleId` goes
null), and `workspaceId` + `ruleName` are denormalized onto the row (the
`CardHistoryEvent` survival pattern) so the entry stays workspace-scoped and
keeps showing the rule's name after deletion. Logs still cascade with their
**workspace**.

## Triggers

Seven trigger types (`lib/schemas/automation.ts`, `TRIGGER_TYPES`):

| Trigger | Fires when | Hooked in |
| --- | --- | --- |
| `card-created` | a card is created | `createCardAction` |
| `card-moved-to-list` | a card moves to a list | `moveCardAction` |
| `card-completed` | a card is marked complete | `toggleCardCompletionAction` |
| `card-reopened` | a completed card is reopened | `toggleCardCompletionAction` |
| `label-added-to-card` | a label is attached | `addCardLabelAction` |
| `member-assigned` | a member is assigned | `assignCardMemberAction` |
| `due-date-approaching` | a card enters the ~24h due window | due-date cron (scheduled) |

### Trigger config (filters)

`triggerConfig` narrows *which* events match. All fields are optional; an empty
object matches every event of that type. The matcher (`lib/automation/matcher.ts`)
compares:

- `boardId`, `listId`, `priority` — any trigger. For `card-moved-to-list`,
  `listId` matches the **destination** list; `fromListId` matches the source.
- `labelId` — `label-added-to-card`.
- `beforeMinutes` — `due-date-approaching` (the scheduled window gate; ignored by
  the event matcher).

The board **scope** (`Rule.boardId`) is separate from and broader than
`triggerConfig.boardId`: a `null` scope means the rule is evaluated for every
board, and the builder UI filters list/label pickers to the scoped board so a
rule can't reference an off-board list or fire an un-satisfiable filter.

## Actions

A rule runs an **ordered array of 1–20 action steps** (decision 0022 R1). Eight
step types (`actionStepSchema`, discriminated on `type`):

| Step | Params | Effect |
| --- | --- | --- |
| `move-card-to-list` | `targetListId` | relocate the card |
| `set-priority` | `priority` | set URGENT/HIGH/MEDIUM/LOW |
| `add-label` / `remove-label` | `labelId` | attach / detach a label |
| `assign-member` | `recipient` | assign a member |
| `remove-member` | `scope` | unassign one member or `all` |
| `set-completion` | `completed` | mark complete / reopen |
| `notify-member` | `recipient`, `message?` | send a notification (post-commit) |

**Dynamic targets** (decision 0022 R2): `assign-member` / `notify-member`
`recipient` and `remove-member` `scope` accept dynamic tokens resolved from the
triggering card at fire time — `card-assignees`, `card-creator`, or `all` (remove
only) — alongside a fixed workspace-member `userId`. The resolver
(`lib/automation/resolver.ts`) expands tokens to concrete member ids under the
**same workspace-isolation check** as fixed targets: a resolved member outside
the rule's workspace is rejected and logged.

## Evaluation & transaction boundary

`evaluateRules()` runs **inside the triggering mutation's Prisma transaction**,
after the trigger's own write and history events, before commit (decision 0022):

- **Card-mutating steps** (`move`, `set-priority`, `add`/`remove-label`,
  `assign`/`remove-member`, `set-completion`) execute inline in that transaction.
  If any step throws, the **whole transaction rolls back** — the user's own edit
  is undone with it, and they get a distinct error: *"automation rule &lt;name&gt;
  failed; no changes were applied."* The `status: "error"` log row is written
  after the rollback, so it survives.
- **`notify-member`** runs **post-commit** via a deferred-effect descriptor,
  consistent with the notification pipeline; the descriptor is discarded if the
  transaction aborts.
- Realtime emits and `revalidatePath` fire post-commit too, so the revalidated
  page reflects cumulative (trigger + rule) state. Rule action handlers never
  emit sockets directly — they return effect descriptors the triggering action
  fires through the existing `emit*` helpers.

Retryable triggers (e.g. `moveCardAction` on `StaleNeighborError`) rebuild the
chain state and effect accumulator per attempt, so exactly one application
persists and effects fire once after the final commit.

## Loop prevention

Four layers (decision 0022 §3, `lib/automation/loop-guard.ts` +
`lib/automation/cycle-check.ts`):

- **Chain correlation id** (`chainId`) — a UUID minted at the root event and
  propagated through cascaded evaluations for tracing.
- **Hard depth cap** — `MAX_CHAIN_DEPTH = 5`; the cascade halts at depth 5 and
  logs `status: "halted"`.
- **Per-chain dedup set** — an in-memory `Set` of `(ruleId, cardId)` pairs for
  the chain's duration (not persisted; a chain is one synchronous request), so a
  rule can't act on the same card twice in one chain.
- **Save-time static cycle warning** — the builder warns (non-blocking) when a
  rule's actions produce events matching its own or another rule's trigger. It
  surfaces as a persistent, manually-dismissed toast in the management UI.

## Scheduled trigger (`due-date-approaching`)

`due-date-approaching` is driven by the **existing due-date-reminders cron**
(`app/api/cron/due-date-reminders/route.ts`), not by a user action. After the
reminder pass, the route runs a scheduled pass over cards in the approach window
and calls `evaluateScheduledCard` (`lib/automation/scheduled.ts`) for each.

Idempotency uses `RuleExecutionLog.dedupKey` with `@@unique([ruleId, dedupKey])`:
the key is `"<cardId>:<milestone>"` (milestone is always `DUE_SOON`), so N
overlapping cron ticks apply each scheduled rule at most once. A `notify-member`
step on a due-date rule deduplicates against the built-in reminder's milestone
via the `CardReminder` pattern, so a member never gets both a reminder and a rule
notification for the same milestone (decision 0022 R3). The built-in reminder
stays the canonical notifier; rules add non-notify actions (move, label,
set-priority) freely.

## Attribution

Rule-driven mutations are attributed to a **seeded system user**
(`AUTOMATION_ACTOR_USER_ID`, name "Planora Automation" — a real `User` row,
reserved email, unusable credentials, never a workspace member). Its edits write
`CardHistoryEvent` rows as usual with `metadata: { ruleId }`, so analytics
distinguish automation from human work without nullable-`userId` columns
(decision 0022 §5). Notifications from `notify-member` / `assign-member` use the
system user as actor, so recipients see "Planora Automation assigned you…".
Socket events carry the **same payload shape** as their human-driven equivalents
— no new event types.

## Permissions

Only workspace **admins** manage rules (create / update / delete / enable /
disable), gated by `hasWorkspacePermission(organization:update)`. Editors and
viewers get **read-only** access to the rule list and execution log
(`isWorkspaceMember`). This is the same admin-exclusive verb as workspace
settings (decision 0022 §4).

## Server Actions & UI

Mutations and reads live in
`app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions.ts`:
`createRuleAction`, `updateRuleAction`, `deleteRuleAction`,
`toggleRuleEnabledAction`, `listRulesAction`, `getRuleExecutionLogAction`,
`getBoardAutomationDataAction` (the board modal's lazy, board-scoped read), and
`dryRunRulesAction` (evaluate an event against enabled rules with **no side
effects** — no transaction, no log rows; decision 0022 §7).

The shared `AutomationContent` (`components/workspace/automation/`) renders the
rule list (name, board scope, When/Then summaries, last-run status, enable
Switch), a Dialog **rule builder** (trigger + config + ordered action steps),
and the execution-log panel. The workspace page (`AutomationManagement`) wraps
it in full-page chrome; the board header's **Automation** modal
(`BoardAutomationDialog`) wraps it board-scoped, pre-scoping the builder to the
current board and re-fetching on each mutation. `dryRunRulesAction` has no UI
surface yet — the "test a rule" preview is a tracked follow-up.

## Proof

Automation is heavily unit- and integration-tested (see `docs/TEST_MATRIX.md`):
the matcher, resolver, loop-guard, cycle-check, executor, effects, and evaluator
(`lib/automation/*.test.ts`), the scheduled pass (`tests/automation-scheduled.test.ts`),
and the full Server Action security boundary + business logic
(`tests/server-actions/automation-rules.test.ts`). The management UI (React
components) has no automated coverage — the standing no-RTL gap.
