# 0009 Due-date reminder scheduler

Date: 2026-06-25

## Status

Accepted

## Context

`Card.dueDate` and the `DUE_DATE` notification type have existed in the schema
since early on, and due dates are set via the card detail UI and tracked in card
history — but nothing ever fires a `DUE_DATE` notification. The `createNotification`
helper in `lib/notification.ts` doesn't even include `DUE_DATE` in its type cast.
There is no scheduler, cron, or periodic-job mechanism anywhere in the repo.

Sliced as US-020 (`docs/stories/epics/E04-board-parity/US-020-due-date-reminder-scheduler/`),
marked high-risk because it introduces (a) a new data model for dedup and
(b) scheduled external behavior — both hard gates under `docs/FEATURE_INTAKE.md`.
Four interlocking decisions are needed before implementation:
mechanism, cadence, recipient set, and dedup strategy.

The four decisions below were confirmed by the product owner (2026-06-25) and
survived an Oracle design review, which surfaced edge cases folded into the
story's design.md (dueDate-change invalidation, archive/delete filter,
claim-rollback ordering, shutdown handler, unbounded OVERDUE window,
per-card error isolation). The decisions themselves are unchanged.

## Decision

1. **Mechanism — cron route + in-process setInterval driver.**
   A new `POST /api/cron/due-date-reminders` route, gated by a `CRON_SECRET`
   bearer token, contains all scheduler logic. `server.ts` runs a 15-minute
   `setInterval` that hits the route with the secret; the interval is a no-op
   when `CRON_SECRET` is unset (prod may use external cron instead). The route is
   idempotent, so duplicate/overlapping ticks are safe.
2. **Cadence — due soon + overdue.**
   Two milestones: `DUE_SOON` fires ~24h before `dueDate`; `OVERDUE` fires ~1h
   after, only if the card is still incomplete (`completedAt IS NULL`). Each
   fires once per card per recipient.
3. **Recipients — members + creator, deduplicated.**
   Card members (`CardMember`) plus `Card.createdById`, deduped. Consistent with
   `notifyCommentOnCard`. A card with no members notifies only the creator.
4. **Dedup — new `CardReminder` table.**
   `model CardReminder { cardId, userId, milestone, sentAt }` with
   `@@unique([cardId, userId, milestone])`. The scheduler try-inserts; a P2002
   unique violation means "already sent, skip." Explicit, queryable, and keeps
   scheduler bookkeeping out of the notification log.

## Alternatives Considered

1. **In-process setInterval only (no HTTP route).** Rejected — untestable via
   HTTP and can't be driven by external cron in prod. The route is a thin,
   testable wrapper over the same logic.
2. **External cron only (no in-process driver).** Rejected as default — does
   nothing until the operator configures a caller, so reminders silently never
   fire in a fresh self-hosted deploy. The in-process driver makes it work out
   of the box; external cron remains optional for prod.
3. **Dedup via the Notification table (no new table).** Rejected — overloads
   `linkUrl` as a join key and cannot cleanly encode the milestone, making
   "DUE_SOON vs OVERDUE" ambiguous. Kept as a fallback.
4. **Dedup via `Notification.metadata Json?`.** Rejected — Prisma JSON filtering
   is awkward and mixes bookkeeping into the notification log.
5. **A job queue (BullMQ/Bree/Inngest).** Rejected — overkill for two milestones
   per card; introduces Redis/worker infra the project lacks. Revisit when
   cadence complexity grows.
6. **Event-driven reminder scheduling on due-date set (no poll).** Rejected —
   handles DUE_SOON but not OVERDUE (which depends on completion state at
   dueDate+1h) and loses reminders across restarts. Stateless web processes need
   a poll.

## Consequences

Positive:

- `DUE_DATE` becomes a real notification channel, retiring half-built schema
  (initiative Theme C pattern).
- The cron route + dedup pattern is reusable for future scheduled notifications
  (stale-card nudges, weekly digests).
- Idempotency makes the scheduler safe under restarts, overlapping ticks, and
  dual drivers (in-process + external).

Tradeoffs:

- One new table + migration (high-risk gate, now recorded here).
- `server.ts` gains a long-running timer; must be cleared on shutdown to avoid
  hanging the process.
- 15-minute granularity means reminders can be up to ~15 min late relative to
  the exact window edge — acceptable for "due soon"/"overdue".

## Follow-Up

- Wire external cron (GitHub Actions scheduled workflow or system cron) as the
  prod driver; decide whether to keep or retire the in-process interval.
- Add due-now and repeat-overdue escalation (validation.md slice 2).
- Add a per-user notification-preference model and reminder opt-out (slice 3).
- Reminder management UI (slice 5).
