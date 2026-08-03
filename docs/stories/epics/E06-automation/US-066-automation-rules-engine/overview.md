# Overview — US-066 Automation Rules Engine

## Status

implemented (high-risk) — landed via PR #78 (feat/us-066-automation-rules-engine,
merged 6bf5c5a) + dc1fd0a (log-retention fix, US-067 modal); status reconciled
2026-08-02 (US-083 W5). Design resolved in
decision 0022.

## Current Behavior

Planora has no automation rules engine. All card mutations — moves, labels,
priority changes, assignments, completion — are performed manually through
Server Actions triggered by user interactions. No workspace member can define
a "when X happens, do Y" rule.

The only automated behavior is the due-date reminder scheduler
(`server.ts` / `/api/cron/due-date-reminders`), which runs on a 15-minute cron
tick and sends in-app notifications for cards nearing their due dates. This
scheduler fires based on a hardcoded 24-hour window, not user-configurable rules.

## Target Behavior

Workspace admins can define automation rules (Butler-style) with a structured
trigger → condition → action model. Rules are evaluated inline in the Server
Action pipeline — inside the triggering
Prisma transaction, after the trigger mutation and history writes, before the
transaction commits. Realtime emit and revalidation run after the transaction
commits — so rule-driven mutations are atomic with the user action that
triggered them.

v1 trigger types (event-driven):

- `card-created` — a card is created in the workspace
- `card-moved-to-list` — a card is moved to a specific list
- `card-completed` — a card's `completedAt` is set
- `card-reopened` — a card's `completedAt` is cleared
- `label-added-to-card` — a label is added to a card
- `member-assigned` — a member is assigned to a card

Plus one scheduled trigger:

- `due-date-approaching` — a card's due date is within a configurable window;
  checked on the existing 15-min cron tick from the due-date reminder scheduler.
  It **supplements** (does not replace) the built-in reminder; a `notify-member`
  action on this trigger deduplicates against the reminder's milestone so
  members are never double-notified (decision 0022 R3).

v1 action types:

- `move-card-to-list`
- `set-priority`
- `add-label`
- `remove-label`
- `assign-member`
- `remove-member`
- `set-completion` (complete or reopen)
- `notify-member` (in-app notification via the existing notification pipeline)

Actions run as an **ordered sequence** per rule — a rule may chain several
actions (e.g. `set-completion` → `remove-label` → `notify-member`), executed in
order inside the trigger transaction (decision 0022 R1). Action targets may be
fixed IDs or **dynamic tokens** resolved from the triggering card at fire time
(0022 R2): `notify-member`/`assign-member` recipient `card-assignees` or
`card-creator`, and `remove-member` scope `all`. Dynamic targets resolve to
workspace members only (same isolation check as fixed IDs).

Trigger conditions: optional structured filters (board, list, label, priority)
encoded as JSON and validated via Zod. No freeform DSL in v1.

Every rule execution (success, skip, error) is recorded in `RuleExecutionLog`
with a chain correlation id for loop-prevention tracing.

Dry-run mode: evaluate rules against an event and return the set of rules that
*would* fire, without executing any actions.

## Affected Users

- **Workspace admins** — create, update, delete, enable/disable rules.
- **Workspace editors and viewers** — read-only access to the rule list and
  execution log; cannot create or modify rules.
- **All workspace members** — subject to rule-driven mutations on cards they
  work with; see automation-attributed changes in the card history feed.

## Affected Product Docs

- `docs/product/boards-and-cards.md` — add note about rule-driven card mutations
  carrying `{ ruleId }` metadata.
- `docs/product/realtime-sync.md` — confirm rule-driven mutations emit the same
  typed socket events; no new event types needed for v1.
- `docs/product/notifications.md` — `notify-member` action reuses the existing
  notification pipeline.
- `docs/product/analytics.md` — note that `CardHistoryEvent` rows written by
  rule actions carry `metadata.ruleId` so analytics can distinguish automation
  from human actions.
- `docs/product/automation.md` — **new doc** authored at implementation time;
  covers rule lifecycle, trigger/action catalog, condition format, evaluation
  ordering, loop prevention, and dry-run semantics.

## Non-Goals

- Webhook/HTTP actions (deferred to v2).
- Generic scheduled/calendar rules (v2).
- Freeform DSL (v2).
- Background job queue offload of heavy actions (v2 — the job queue is a
  separate feature; v1 runs all actions inline).
- Custom roles or per-rule permissions (admin/editor/viewer only, v1).
- Rule import/export or templates (v1).
- Rule testing/simulation UI beyond the dry-run API (v1).
