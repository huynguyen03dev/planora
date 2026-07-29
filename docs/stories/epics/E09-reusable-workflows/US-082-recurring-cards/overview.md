# Overview — US-082 Recurring Cards Built on Accepted Templates

## Status

planned (high-risk) — implementation unstarted. Depends on US-081 (Card Templates). Scheduler and deduplication model unresolved (Decision Gate inside packet).

## Current Behavior

Currently, Planora has no support for recurring tasks or scheduled card creation. Repetitive tasks (such as "Weekly Sprint Cleanup", "Monthly Security Audit", "Daily Standup Notes") must be manually created by team members every time.

While US-081 introduces Card Templates for manual instantiation, there is no automated scheduler to instantiate templates on a recurring cron schedule.

## Target Behavior

Automate repetitive card creation by scheduling Card Templates to instantiate automatically on a recurring schedule (e.g. daily, weekly on specified days, monthly):

1. **Schedule Configuration:** Workspace members can attach a recurring schedule rule to any accepted Card Template (US-081), specifying frequency (daily, weekly, monthly), target list, due-date offset, and execution time.
2. **Automated Scheduler Execution:** The background cron scheduler evaluates active recurring schedules on its execution tick and automatically instantiates the template into an ordinary active `Card`.
3. **Idempotency & Deduplication:** Ensures that system restarts or cron overlaps never produce duplicate recurring cards for the same schedule period.

## Affected Users

- **Workspace Members (Editors & Admins):** Configure recurring schedules on templates; inspect execution logs.
- **Workspace Viewers:** Read-only access to schedule configurations.

## Affected Product Docs

- `docs/product/boards-and-cards.md` — document recurring card schedule rules.
- `docs/product/automation.md` — document recurring card scheduler integration with `/api/cron`.
- `docs/TEST_MATRIX.md` — update matrix proof status.

## Future Decision Gate (Inside Packet)

**Scheduler & Deduplication Model Gate (Unresolved):**
- **Option A (Integrate with Existing 15-Minute Cron Route):** Expand `/api/cron/due-date-reminders` (or introduce `/api/cron/recurring-cards`) driven by `server.ts` or Vercel Cron ticks. Uses atomic `lastRunAt` and unique `dedupKey` (`<templateId>:<scheduledDate>`) in DB transactions.
- **Option B (Background Worker Queue):** Introduce a dedicated background worker queue (e.g., BullMQ / Redis worker) to handle scheduled execution off-thread.
*This decision gate MUST be resolved and recorded in an ADR before US-082 implementation begins.*

## Dependencies

- **Requires US-081 (Card Templates):** US-082 builds directly on top of accepted template definitions from US-081.

## Non-Goals

- Complex external calendar synchronization (Google Calendar / Outlook sync).
- Freeform cron expression syntax in UI (simple UI dropdowns for daily/weekly/monthly).
