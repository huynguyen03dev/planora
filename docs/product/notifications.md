# Notifications

Planora notifies users through three channels for the same events: **in-app**
(DB-backed), **email** (Resend), and **real-time** (Socket.io). Logic lives in
`lib/notification.ts` / `lib/notification-actions.ts`, with email in
`lib/email.ts` and templates in `emails/`.

## Model

`Notification` (per user): `type`, `title`, `message`, optional `linkUrl`,
`isRead`, `readAt`. Types: `ASSIGNED`, `MENTIONED`, `DUE_DATE`, `COMMENT`,
`INVITE`. Indexed by `(userId, isRead, createdAt)` for fast unread queries.

> `INVITE` is **legacy** and no longer written. Pending workspace invitations
> are surfaced directly in the unified inbox from the `invitation` table (see
> *Unified inbox* below); `notifyInvited()` is a retained no-op and the
> notification queries exclude `type = INVITE` so a stale row never double-lists.

## Triggers

| Trigger | In-app | Email | Template |
| --- | --- | --- | --- |
| Assigned to a card | yes | yes | `emails/assign-email.tsx` |
| Comment on a relevant card | yes | yes | — |
| Workspace invitation | unified inbox¹ | yes | `emails/invite-email.tsx` |
| Due date (DUE_SOON / OVERDUE) | yes | yes | `emails/due-date-email.tsx` |

¹ Invitations are not `Notification` rows. They appear in the bell's unified
inbox as action cards sourced live from the `invitation` table — see below.

When a Server Action creates a notification it persists the row and calls
`emitNotificationNew(userId, payload)` so the recipient's UI updates live.

## Delivery & UI

- **Real-time:** pushed to the `user:${userId}` socket room — no polling.
- **Fetch/history:** `GET /api/notifications?limit=50` (the only GET API route)
  and the `/notifications` page.
- **UI:** `components/notifications/notification-bell.tsx` (badge + unread count)
  and `notification-dropdown.tsx`.
- **Actions:** mark-read and mark-all-read; unread count drives the badge.

> Note: the notification bell lifecycle was fixed in commit `f1aba24` — keep the
> bell subscription tied to the session socket, not remounted per page.

## Unified inbox (invitations)

The notification bell is the single global "needs attention" surface. Pending
workspace invitations are merged into the dropdown alongside activity
notifications instead of living in a separate boards-only sidebar entry.

- **Source:** invitations are read live from the `invitation` table via
  `GET /api/invitations/pending` (`listReceivedPendingInvitationsByEmail`), not
  from the `Notification` table.
- **Ordering:** `lib/notifications/inbox.ts` (`buildInboxItems`, unit-tested)
  pins invitations above notifications, soonest-to-expire first; notifications
  follow most-recent first.
- **Badge:** `computeInboxBadgeCount` = unread notifications + pending
  invitations, so a standing decision signals on every page. The count is owned
  by `authenticated-header-actions.tsx`; `notification-bell.tsx` is presentational.
- **Inline actions:** each invitation card renders Accept / Decline wired to the
  existing `acceptInvitationAction` / `declineInvitationAction` Server Actions
  (Better Auth `acceptInvitation` / `rejectInvitation`, email-match guarded).
  Accept navigates to `/boards?workspace=…`; decline removes the card and
  decrements the badge. The `/invitations` page remains the accept landing.
- **Known limitation:** a newly-arrived invitation does not push a live badge
  increment (no socket event for invitations); the count refreshes on the next
  load/navigation. Accepted/declined cards update optimistically.

## Scheduler

Due-date reminders are driven by a periodic scanner, not by user actions. The
scheduler checks every 15 minutes for cards entering the DUE_SOON (~24h before
due) or OVERDUE (~1h after due) windows and fires notifications via the same
`createNotification` + `sendEmail` path as user-initiated notifications.

### Mechanism

- A `POST /api/cron/due-date-reminders` route contains all scheduler logic,
  guarded by a bearer token (`CRON_SECRET` env var).
- In dev / self-hosted, `server.ts` runs a `setInterval` that hits the route
  every 15 minutes. In production, external cron (GitHub Actions, system cron)
  may drive the same route instead.
- The route is idempotent — duplicate or overlapping ticks are safe due to the
  dedup invariant (see below).

### Dedup (CardReminder table)

| Column | Type | Purpose |
| --- | --- | --- |
| `cardId` | String | The card being reminded about |
| `userId` | String | The recipient |
| `milestone` | String | `"DUE_SOON"` or `"OVERDUE"` |
| `sentAt` | DateTime | When the reminder was sent |

The `@@unique([cardId, userId, milestone])` constraint ensures each reminder
fires at most once. The scheduler try-inserts a `CardReminder` row as a claim
before sending; a `P2002` unique violation means "already sent, skip." If the
`notifyDueDate` call fails, the row is rolled back (deleted) so the next tick
retries.

When a card's due date is changed or cleared, all `CardReminder` rows for that
card are deleted, allowing a fresh DUE_SOON from the new date.

### Idempotency guarantee

The scheduler is safe under:
- Overlapping ticks (two ticks running concurrently)
- Dual drivers (in-process + external cron simultaneously)
- Process restarts (next tick recovers)

### Observability

Each tick logs a structured line:
```
[due-date-scheduler] processed=N notified=M skipped=K errors=E elapsedMs=...
```
- `processed`: number of candidate cards scanned
- `notified`: successful notification+email sends
- `skipped`: dedup collisions (already sent)
- `errors`: per-card failures (logged individually with card ID)
- `elapsedMs`: total tick duration

### Single-instance requirement (LOW-4)

The in-process `setInterval` assumes one server process. Do not run the app
in PM2 cluster / multi-replica mode with the in-process driver enabled.
For multi-instance deployments, use external cron driving the idempotent
HTTP route instead.

## Email

`lib/email.ts` sends via **Resend** using React Email templates. Email is a
side effect of the same Server Action that creates the in-app notification;
failures should not roll back the primary mutation but must be logged.

All templates render through the shared branded layout in
`emails/components/email-layout.tsx` (Planora wordmark header, framed card,
shared typography, CTA button, fallback link, and footer) so every
transactional email is visually consistent. Templates supply only their own
heading, body copy, and call to action.
