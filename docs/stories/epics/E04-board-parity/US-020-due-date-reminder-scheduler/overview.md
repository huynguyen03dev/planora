# Overview

US-020 — Due-date reminder scheduler → trigger `DUE_DATE` notifications + email.
Sliced from `docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md`
(Theme B — Daily-use Parity, P1; initiative row "US-015"). Epic:
`E04-board-parity`. Supersedes the initiative's reservation of US-015 for this
work — the number was taken by checklists during slicing; harness rules permit
renumbering freely.

## Current Behavior

The data model already promises due-date reminders, but nothing fires:

- `Card.dueDate DateTime?` exists (`prisma/schema.prisma`) and **is set** — the
  card detail sheet (`components/boards/card-detail-sheet.tsx`) lets a user pick
  a due date, the server action persists it, and `lib/card-history.ts` records
  `DUE_DATE_SET` / `DUE_DATE_CHANGED` / `DUE_DATE_CLEARED` events. Analytics
  (`lib/analytics/engine.ts`) even computes "was late" from it.
- `enum NotificationType` has a `DUE_DATE` variant, but it is **never created**.
  Worse, `lib/notification.ts` `createNotification` casts the type as
  `"ASSIGNED" | "COMMENT" | "INVITE" | "MENTIONED"` — `DUE_DATE` is omitted, so
  even a direct call would be a type error today.
- There is **no scheduler, cron, or periodic-job mechanism** anywhere in the
  repo (`server.ts`, `app/api/`, `lib/` — none). No job runner dependency
  (`node-cron`, `bree`, etc.) is installed.
- There is **no idempotency tracking**: even if a scheduler existed, running it
  every minute would re-fire "due soon" 24 times for a card due in a day.

Net effect: a user sets a due date and is silently never reminded. The
`DUE_DATE` type is half-built schema (Theme C of the initiative), same pattern
as `MENTIONED` was before US-017.

## Target Behavior

When a card's due date approaches and passes, the right people get an in-app
notification **and** an email — each reminder firing **exactly once per card per
recipient**, through the same `createNotification` + `sendEmail` path that
`ASSIGNED` / `MENTIONED` already use.

**Slice 1 scope (this story):**

- Two reminder milestones per card:
  1. **Due soon** — fires ~24h before `dueDate`.
  2. **Overdue** — fires ~1h after `dueDate` (if the card is still incomplete).
- Recipients: card members (assignees) + card creator, deduplicated. If a card
  has no members, only the creator is notified. Completed cards
  (`completedAt != null`) are skipped.
- A periodic scheduler scans for due/overdue cards and fires the reminders.
- Each reminder fires once — a dedup mechanism prevents re-firing on subsequent
  scheduler runs.
- A new React Email template (`emails/due-date-email.tsx`) and `notifyDueDate`
  helper in `lib/notification.ts` (the DUE_DATE cast is widened).

**Out of scope (follow-up slices, documented in validation.md):**

- Configurable per-user reminder preferences / opt-out (deferred — no
  notification-preference model exists yet).
- Due-now (at the exact due time) and repeat-overdue escalation cadences.
- A reminder management UI (list/cancel upcoming reminders).
- SMS / push channels.

## Affected Users

- All workspace members with a card due date — they begin receiving reminders.
- Editors/admins who set due dates — no behavior change in the setter, just new
  outbound reminders.

## Affected Product Docs

- `docs/product/notifications.md` — the `DUE_DATE` row of the trigger table
  changes from "type exists" to "yes / yes / `emails/due-date-email.tsx`", plus a
  new "Scheduler" subsection.
- `docs/TEST_MATRIX.md` — add a row for scheduler proof (unit on reminder
  selection + dedup; integration on cron route firing once).

## Non-Goals

- Changing how due dates are *set* (the setter UI is already done).
- Realtime socket push for reminders specifically — reminders reuse the existing
  `emitNotificationNew` path; no new socket event.
- Replacing the Server-Action-only write model; the scheduler writes
  notifications through the same `createNotification` helper.
- Notification preference/subscription model (post-parity).
