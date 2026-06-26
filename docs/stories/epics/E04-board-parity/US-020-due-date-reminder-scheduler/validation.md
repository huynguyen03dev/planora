# Validation

## Proof Strategy

The correctness of this story rests entirely on the **dedup invariant**: a
reminder for a given (card, user, milestone) fires exactly once, no matter how
many times the scheduler ticks. That invariant must be unit + integration proven.
Secondary: completed cards never receive overdue reminders; email failures never
abort the tick.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit (`lib/due-date-reminders.ts`) | milestone selection: card 23h before due → `DUE_SOON`; card 2h after due → `OVERDUE`; card due in 30h → none; card 25h before due → none. Filter: completed / archived / deleted card → none (HIGH-2). Dedup: a (card,user,DUE_SOON) already in `CardReminder` is not re-selected. Recipient resolution: members + creator, deduped; card with no members → creator only. |
| Unit (`lib/notification.ts` notifyDueDate) | creates a `DUE_DATE` notification per recipient; calls `sendEmail` per recipient; email throw is caught + logged, notification still created; `createNotification` type cast accepts `DUE_DATE`; **claim-first + rollback**: on `createNotification` throw the `CardReminder` row is deleted so next tick retries (MEDIUM-1). |
| Integration (route) | seed cards across DUE_SOON / OVERDUE / completed / archived / deleted / already-reminded bands; call route **twice in quick succession** (overlap) and assert notification count identical both ticks (idempotent + race-safe); assert 401 without `CRON_SECRET` and 401 when `CRON_SECRET` unset (LOW-3); assert archived/deleted card → zero notifications (HIGH-2); assert one corrupted card throws but the rest still process + `errors` increments (MEDIUM-4). |
| Integration (invalidation) | DUE_SOON fires for a card; push `dueDate` out 14 days via the update action → `CardReminder` rows deleted (HIGH-1); next tick after the new window opens fires a fresh DUE_SOON. Clearing `dueDate` deletes reminders too. |
| E2E (optional, slice 1) | not required — covered by integration. The existing two-client E2E harness (US-009) could assert a due-soon notification appears live, but defer to a follow-up. |
| Platform | `server.ts` setInterval registers exactly once; no-op when `CRON_SECRET` unset; `SIGTERM`/`SIGINT` clears interval + closes io/server and process exits cleanly (MEDIUM-2). |
| Logs/Audit | tick logs `processed/notified/skipped/errors/elapsedMs`; dedup collisions counted as `skipped`; per-card failures logged with cardId and counted as `errors`. |

## Fixtures

- Deterministic cards with fixed `dueDate` values relative to a frozen `now`
  (inject `now` into the pure selection function — do not call `new Date()`
  inside it).
- A workspace with: 1 creator, 2 members, 1 uninvolved user.
- Mocked `sendEmail` (Resend not called in tests; assert call args).

## Commands

Add commands after scripts exist.

```text
npx vitest run lib/due-date-reminders.test.ts
npx vitest run -t "due date"
npm run lint && npx tsc --noEmit && npm run build
```

## Acceptance Evidence

Add results after verification.

## Follow-up Slices (out of scope here)

- **Slice 2** — due-now reminder at exact `dueDate`; repeat-overdue escalation
  (e.g. daily until complete).
- **Slice 3** — per-user notification preferences (email on/off, reminder lead
  time) once a preference model exists.
- **Slice 4** — per-user email rate limit / daily digest (Oracle LOW-1): a
  board with N cards due the same day currently sends N separate emails. Cap or
  batch before volume becomes a problem.
- **Slice 5** — external cron wiring (GitHub Actions scheduled workflow or system
  cron) as the prod driver; remove reliance on in-process `setInterval`.
- **Slice 6** — reminder management UI (list upcoming / cancel).
