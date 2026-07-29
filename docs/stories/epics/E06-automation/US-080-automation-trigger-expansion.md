# US-080 Automation Trigger Expansion for Attribute Changes

## Status

planned — implementation unstarted.

## Lane

normal

## Product Contract

Expand the event-driven triggers in the Butler-style automation engine (`lib/automation/matcher.ts`) to support key card attribute changes:
- `due-date-changed`: fires when a card's due date is set, updated, or cleared.
- `estimate-changed`: fires when a card's estimate hours are updated.
- `priority-changed`: fires when a card's priority is modified.
- `card-stale-in-capture`: scheduled candidate trigger firing when a card remains in a capture list without updates for > N days.

**Scope Constraints:**
Strictly limited to card attribute change events. **No external webhooks, HTTP postbacks, external API integrations, or SLA tracking engines.**

## Relevant Product Docs

- `docs/product/automation.md` — trigger catalog, inline transaction execution, and condition evaluation.
- `docs/decisions/0022-automation-rules-engine.md` — Butler-style rules engine architecture.

## Acceptance Criteria

1. `RuleTriggerType` enum / type expanded to include `due-date-changed`, `estimate-changed`, `priority-changed`, and `card-stale-in-capture`.
2. Updating a card's due date (`updateCardDueDateAction`), estimate (`updateCardEstimateAction`), or priority (`updateCardDetailsAction`) evaluates matching rules inline inside the triggering Prisma transaction.
3. Rules matching attribute triggers execute their ordered action sequence (e.g., when priority changed to `URGENT` -> move card to "Needs Attention" list and assign admin).
4. Preserves loop-prevention depth checks (`ChainTracker`), deduplication keys, and audit logging in `RuleExecutionLog`.
5. Rule Builder UI (`components/workspace/automation/rule-builder-dialog.tsx`) expanded to display new trigger options in the trigger dropdown.

## Design Notes

- **Modules:** `lib/automation/matcher.ts`, `lib/automation/types.ts`, `components/workspace/automation/rule-builder-dialog.tsx`.
- **Triggers:**
  - `due-date-changed`: payload `{ cardId, previousDueDate, newDueDate }`
  - `estimate-changed`: payload `{ cardId, previousEstimate, newEstimate }`
  - `priority-changed`: payload `{ cardId, previousPriority, newPriority }`
- **Execution:** Runs inline within the triggering action transaction.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Dedicated attribute-change automation trigger tests (`lib/automation/attribute-triggers.test.ts`) |
| Integration | `updateCardDetailsAction` setting priority to `URGENT` triggers matching rule and executes actions atomically |
| E2E | User creates rule "When priority changed to URGENT, add red label", changes priority on board, and observes label added live |
| Platform | N/A |
| Release | Verify Rule Builder UI renders new triggers cleanly |

## Command Verification (Pre-Implementation Placeholder)

```bash
# Unit & Triggers
npx vitest run lib/automation/attribute-triggers.test.ts
```

## Harness Delta

Update `docs/TEST_MATRIX.md` row for automation trigger expansion.

## Evidence

Implementation unstarted. Commands and proof will be added after development.
