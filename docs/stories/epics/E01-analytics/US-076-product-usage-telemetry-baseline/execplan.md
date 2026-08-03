# Exec Plan — US-076 First-Party Product-Usage Measurement Baseline

## Goal

Materialize a first-party, zero-PII usage telemetry baseline to measure daily-use retention and feature adoption across Planora roadmap initiatives.

## Scope

In scope:
- Schema addition: `UsageTelemetryEvent` and `DailyUsageSummary` models.
- Server Action: `recordTelemetryAction` with PII sanitization and async execution.
- Retention: Cron job pruning raw events older than 90 days.
- Admin UI: Usage & Retention dashboard tab in Workspace Analytics.

Out of scope:
- External analytics provider integrations.
- PII tracking or card text content logging.

## Risk Classification

Risk flags:
- `data_model`: Prisma schema addition and retention pruning.
- `audit_security`: Privacy & zero-PII boundary.
- `public_contracts`: Analytics API contracts.

Hard gates:
- Audit/Security gate -> High-Risk lane.
- Requires Decision 0027 acceptance before coding.

## Work Phases (Planned)

1. **Intake & Decision Gate:** Record Decision 0027 and intake classification. (Current state: Complete).
2. **Schema & Migration:** Add `UsageTelemetryEvent` to `prisma/schema.prisma` and execute migration.
3. **Telemetry Helper & Action:** Implement `recordTelemetryAction` with PII validator and HMAC user hashing.
4. **Integration Hooks:** Wire non-blocking telemetry calls into Today view, Quick Capture, and Board View.
5. **Retention Cron Job:** Implement `/api/cron/telemetry-prune` route and test 90-day pruning logic.
6. **Admin Dashboard UI:** Build Usage & Retention summary tab in Workspace Analytics shell.
7. **Verification:** Execute unit tests for PII scrubbing, integration tests for pruning, and E2E verification.

## Stop Conditions

Pause implementation and surface to human if:
- PII sanitization rules are unclear or risk capturing sensitive metadata.
- Database write volume from telemetry impacts primary board mutation latency.
