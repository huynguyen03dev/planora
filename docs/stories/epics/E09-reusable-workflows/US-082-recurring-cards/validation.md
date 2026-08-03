# Validation Plan — US-082 Recurring Cards Built on Accepted Templates

## Proof Strategy

Validation requires proving three core requirements:
1. **Schedule Resolution Math:** Unit tests verifying that frequency calculators (daily, weekly, monthly) correctly compute `nextRunAt` timestamps across timezones and month boundaries.
2. **Atomic Deduplication & Idempotency:** Integration tests asserting that overlapping cron ticks or repeated calls to `/api/cron/recurring-cards` with the same `dedupKey` execute card creation exactly ONCE.
3. **Template Fidelity:** Integration test verifying that scheduled card creation correctly invokes `createCardFromTemplateAction` and creates cards with complete checklist and label data.

## Test Plan

| Layer | Test Description | Target File |
| --- | --- | --- |
| Unit | Schedule math and `nextRunAt` calculation for daily/weekly/monthly | `lib/recurring-schedule.test.ts` |
| Integration | Overlapping cron calls with identical `dedupKey` create exactly 1 card | `tests/cron/recurring-cards.test.ts` |
| Integration | Scheduled execution instantiates template with all checklists and labels | `tests/cron/recurring-cards.test.ts` |
| E2E | User attaches Weekly schedule to Bug Template, triggers cron endpoint, and verifies card appears on board | `e2e/recurring-cards.spec.ts` |

## Acceptance Criteria Verification

- [ ] Recurring schedules trigger automated card creation on the designated interval.
- [ ] Concurrent or duplicate cron ticks never generate duplicate cards for the same schedule period.
- [ ] Cards created by recurring schedules carry complete template checklists and labels.
- [ ] Disabling a recurring schedule stops automatic card creation.

## Command Verification (Pre-Implementation Placeholder)

```bash
# Unit & Integration
npx vitest run tests/cron/recurring-cards.test.ts

# E2E
npx playwright test e2e/recurring-cards.spec.ts
```
