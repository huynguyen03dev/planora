# Exec Plan — US-082 Recurring Cards Built on Accepted Templates

## Goal

Automate repetitive card creation by scheduling accepted Card Templates (US-081) to instantiate automatically on a recurring schedule with deduplication and idempotency.

## Scope

In scope:
- Resolve Scheduler & Deduplication Decision Gate (Option A vs Option B).
- Schema additions: `RecurringCardSchedule` and `RecurringExecutionLog`.
- Scheduler tick logic: `/api/cron/recurring-cards` cron handler.
- Server Actions: `createRecurringScheduleAction`, `updateRecurringScheduleAction`, `deleteRecurringScheduleAction`.
- UI: Schedule configuration panel inside Template manager.
- Unit & integration tests for cron matching and deduplication.

Out of scope:
- External calendar synchronization.
- Complex cron expression UI.

## Risk Classification

Risk flags:
- `data_model`: Schema additions for schedules and execution logs.
- `external_systems`: Scheduled cron tick execution.
- `existing_behavior`: Interaction with template instantiation and `/api/cron`.

Hard gates:
- Data model and external scheduler gates -> High-Risk lane.
- Requires US-081 completion and Scheduler Decision Gate resolution before coding.

## Work Phases (Planned)

1. **Prerequisite & Decision Gate Resolution:** Verify US-081 completion, select scheduler architecture (Option A vs Option B), and record ADR.
2. **Schema & Migration:** Add `RecurringCardSchedule` and `RecurringExecutionLog` to `prisma/schema.prisma` and run migration.
3. **Scheduler Engine & Cron Route:** Implement `/api/cron/recurring-cards` route with atomic deduplication locks.
4. **Server Actions:** Build schedule management Server Actions with RBAC gating.
5. **UI Implementation:** Build schedule builder panel inside Template Manager.
6. **Verification & Proof:** Run unit tests for schedule math, integration tests for cron deduplication, and E2E verification.

## Stop Conditions

Pause implementation and surface to human if:
- US-081 (Card Templates) is not fully implemented and verified.
- Cron execution produces duplicate card instances during test runs.
