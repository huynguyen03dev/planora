# Validation Plan — US-076 First-Party Product-Usage Measurement Baseline

## Proof Strategy

Validation requires proving three core requirements:
1. **Zero PII & Data Privacy:** Unit tests asserting that PII validation rejects sensitive fields (card titles, user emails, custom text) and hashes user IDs correctly.
2. **Failure Isolation:** Integration test asserting that a database failure in `recordTelemetryAction` does not interrupt or fail the primary user interaction.
3. **Retention & Pruning:** Integration test asserting that `/api/cron/telemetry-prune` correctly deletes event rows older than 90 days while preserving aggregate summaries.

## Test Plan

| Layer | Test Description | Target File |
| --- | --- | --- |
| Unit | PII scrubbing validator and HMAC user ID hashing | `lib/analytics/telemetry.test.ts` |
| Integration | `recordTelemetryAction` inserts valid telemetry event | `tests/server-actions/telemetry.test.ts` |
| Integration | Telemetry write failure does not throw or crash caller | `tests/server-actions/telemetry.test.ts` |
| Integration | 90-day retention pruning deletes old raw events | `tests/cron/telemetry-prune.test.ts` |
| E2E | Opening Today view emits `today_view_opened` telemetry event | `e2e/telemetry.spec.ts` |

## Acceptance Criteria Verification

- [ ] Telemetry data is stored 100% locally in Planora database.
- [ ] Event payloads contain zero card text, comments, or PII.
- [ ] Raw telemetry events older than 90 days are automatically pruned.
- [ ] Telemetry recording failures execute silently without impacting user UI.

## Command Verification (Pre-Implementation Placeholder)

```bash
# Unit & Integration
npx vitest run tests/server-actions/telemetry.test.ts

# E2E
npx playwright test e2e/telemetry.spec.ts
```
