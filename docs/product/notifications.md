# Notifications

Planora notifies users through three channels for the same events: **in-app**
(DB-backed), **email** (Resend), and **real-time** (Socket.io). Logic lives in
`lib/notification.ts` / `lib/notification-actions.ts`, with email in
`lib/email.ts` and templates in `emails/`.

## Model

`Notification` (per user): `type`, `title`, `message`, optional `linkUrl`,
`isRead`, `readAt`. Types: `ASSIGNED`, `MENTIONED`, `DUE_DATE`, `COMMENT`,
`INVITE`. Indexed by `(userId, isRead, createdAt)` for fast unread queries.

## Triggers

| Trigger | In-app | Email | Template |
| --- | --- | --- | --- |
| Assigned to a card | yes | yes | `emails/assign-email.tsx` |
| Comment on a relevant card | yes | yes | — |
| Workspace invitation | yes | yes | `emails/invite-email.tsx` |
| Due date | type exists | — | — |

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

## Email

`lib/email.ts` sends via **Resend** using React Email templates. Email is a
side effect of the same Server Action that creates the in-app notification;
failures should not roll back the primary mutation but must be logged.
