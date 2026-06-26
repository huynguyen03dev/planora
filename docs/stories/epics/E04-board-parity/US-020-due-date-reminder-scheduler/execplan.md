# Exec Plan

## Goal

The `DUE_DATE` notification type fires for real: cards approaching or past their
due date send one in-app notification + one email per recipient per milestone,
deduped so reminders never repeat.

## Scope

In scope:

- New `CardReminder` model + migration (dedup invariant).
- Widen `NotificationType` cast in `lib/notification.ts`; add `notifyDueDate`.
- New `POST /api/cron/due-date-reminders` route, `CRON_SECRET` gated.
- Reminder-selection + dedup logic as a pure, unit-testable module
  (`lib/due-date-reminders.ts`).
- New React Email template `emails/due-date-email.tsx`.
- In-process `setInterval` driver in `server.ts` (15-min cadence), guarded by
  `CRON_SECRET`.
- `docs/product/notifications.md` + `docs/TEST_MATRIX.md` updates.

Out of scope (see overview.md Non-Goals + validation.md follow-ups):

- Per-user reminder preferences / opt-out.
- Due-now + repeat-overdue escalation.
- Reminder management UI.
- External cron wiring (documented only; not configured in slice 1).

## Risk Classification

Risk flags:

- Data model — new `CardReminder` table + migration; new index on `Card`.
- External systems — email via Resend (existing path) + a new scheduled
  invocation mechanism (cron route / setInterval).
- Existing behavior — widens the `NotificationType` cast in
  `lib/notification.ts`; touches `server.ts` (shared with realtime).
- Weak proof — no scheduler tests exist today; the dedup invariant is the whole
  correctness argument and must be unit-proven.
- Multi-domain — touches notifications + cards + email + server entrypoint.

Hard gates:

- Data migration (`CardReminder` table).
- External-provider behavior (scheduled email triggers).

→ **High-risk.** Requires a decision record before implementation (see
`docs/decisions/NNNN-due-date-reminder-scheduler.md`).

## Work Phases

1. **Decision record** — record the scheduler mechanism, cadence, and dedup
   choice in `docs/decisions/0009-due-date-reminder-scheduler.md`. ✅ Done;
   user confirmed all four decisions. Oracle review folded into design.md.
2. **Schema + migration** — add `CardReminder` (+ `@@unique`, `@@index`),
   `npx prisma migrate dev --name add_card_reminder`, regenerate client.
3. **Pure logic** — `lib/due-date-reminders.ts`: given `now` and a card, return
   active milestones; the SELECT predicate (with `archivedAt`/`deletedAt`
   filters, HIGH-2, and the split DUE_SOON/OVERDUE windows, MEDIUM-3);
   recipient resolution. Pure functions taking `now` as a param — unit-test
   first.
4. **Notification + email** — widen `NotificationType` cast; `notifyDueDate`
   in `lib/notification.ts` with claim-first + rollback ordering (MEDIUM-1);
   `emails/due-date-email.tsx`. Unit-test the helper (mocked `db` + `sendEmail`).
5. **Due-date invalidation hook** — in the card-update server action
   (`app/.../boards/[boardId]/actions.ts`), delete `CardReminder` rows for the
   card when `dueDate` is set/changed/cleared (HIGH-1). Test that pushing out a
   due date allows a fresh DUE_SOON.
6. **Cron route** — `app/api/cron/due-date-reminders/route.ts`; self-guards on
   `CRON_SECRET` (LOW-3); per-card try/catch with `errors` tally (MEDIUM-4);
   integration test seeds cards across DUE_SOON / OVERDUE / completed /
   archived / deleted / already-reminded / date-changed bands and asserts each
   fires exactly once across two overlapping ticks.
7. **Server driver** — `server.ts` setInterval (15-min), `CRON_SECRET` guarded;
   `SIGTERM`/`SIGINT` shutdown handler clears the interval + closes io/server
   (MEDIUM-2). Note single-instance requirement (LOW-4).
8. **Docs** — update `docs/product/notifications.md` trigger table + scheduler
   subsection; add `docs/TEST_MATRIX.md` proof rows.

## Stop Conditions

Decisions locked by the user up front (mechanism, cadence, recipients, dedup).
These original stop conditions are now resolved — kept for reference. New
stop conditions from the Oracle review:

- **Deployment target is serverless / multi-instance** — the in-process
  `setInterval` driver only works for a single long-lived `server.ts`. If the
  prod target is serverless (no persistent process) or multi-replica, drop the
  in-process driver and rely on external cron + the idempotent route only.
  Confirm before phase 7.
- **CardReminder migration rejected** — fall back to Notification-based dedup
  (design.md Alternative 2) before phase 2.
