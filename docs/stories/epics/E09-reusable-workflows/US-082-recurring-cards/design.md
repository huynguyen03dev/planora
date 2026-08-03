# Design — US-082 Recurring Cards Built on Accepted Templates

## Domain Model

- **Recurring Schedule Entity:** `RecurringCardSchedule`
  - `id`: UUID
  - `templateId`: String (FK to CardTemplate / Card)
  - `targetListId`: String (FK to List)
  - `frequency`: Enum (`DAILY`, `WEEKLY`, `MONTHLY`)
  - `cronDays`: Int[] (for weekly: day numbers 0-6; for monthly: day of month 1-31)
  - `dueOffsetHours`: Int? (hours to add to created card's due date)
  - `isEnabled`: Boolean
  - `lastRunAt`: DateTime?
  - `nextRunAt`: DateTime
  - `createdAt`, `updatedAt`

## Deduplication & Idempotency Engine

- **Execution Claim:** Scheduler computes `dedupKey = <scheduleId>:<YYYY-MM-DD>`.
- **Atomic Claim Transaction:**
  - `db.$transaction` attempts to insert `dedupKey` into a unique execution log (`RecurringExecutionLog`).
  - If `dedupKey` already exists, execution is skipped (idempotent duplicate rejection).
  - If claim succeeds, template is instantiated into an ordinary `Card` via `createCardFromTemplateAction` logic.

## Application Flow

1. Cron scheduler tick fires route `/api/cron/recurring-cards`.
2. Queries active schedules where `isEnabled == true` and `nextRunAt <= now()`.
3. For each matching schedule:
   a. Attempts atomic claim for `dedupKey`.
   b. Instantiates card from template into `targetListId`.
   c. Updates `lastRunAt = now()` and calculates `nextRunAt`.
   d. Emits `card:created` socket event and revalidates board.

## Data Model & Migration Concerns

- **Prisma Schema Additions:**
  - `RecurringCardSchedule` table with `@@index([isEnabled, nextRunAt])`.
  - `RecurringExecutionLog` table with `@@unique([dedupKey])`.

## UI / Platform Impact

- **Template Detail Dialog:** Add "Recurring Schedule" tab / toggle with frequency picker (Daily, Weekly on Mon/Wed/Fri, Monthly on 1st).
- **Automation / Workflow Settings:** View active recurring schedules and execution history.

## Observability

- Log execution entries in `RecurringExecutionLog` and Activity log.
