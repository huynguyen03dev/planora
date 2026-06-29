# US-019 Email notifications for @mentions

## Status

implemented — merged via PR #26 (commit be8ecfe, "@mention ... and email").
Status corrected 2026-06-26 (was stale "ready"; work shipped).

## Lane

normal (plumbing — no new Server Action, no auth path, reuses existing email infra)

Follow-up to US-017 (mention parsing + MENTIONED notifications) and US-018
(autocomplete UI). US-017 creates in-app notifications only; this story adds
email delivery for @mentions so mentioned users get notified even when they're
not active in the app.

Risk flags: existing-behavior (touches notification function), external-systems
(Resend). ~2 flags → normal lane. No hard gate: Resend already configured,
`lib/email.ts` + `sendEmail()` already used by assignment and invite emails.
No schema migration, no new Server Action.

## Scope

**Email delivery for MENTIONED notifications only.** When `notifyMentioned`
resolves a mentioned user, it sends them an email via Resend (best-effort,
same pattern as `notifyCardAssigned`). Deferred:

- **Email for COMMENT notifications** — `notifyCommentOnCard` currently creates
  in-app only; adding email there is a separate story.
- **Email DUE_DATE notifications** — type exists in schema, no trigger wired.
- **Email preferences / unsubscribe** — all-or-nothing delivery for now.
- **Digest / batched emails** — one email per mention.

## Product Contract

When a user is @mentioned in a card comment, in addition to the existing
in-app + realtime notification, they receive an email with:
- Subject: `You were mentioned in "Card Title"`
- Body: `Commenter Name mentioned you in a comment on "Card Title" in "Board Title".`
- A link to the board: `{appUrl}/boards/{boardId}`

Email is best-effort: failure to send email does NOT roll back the comment
(same pattern as `notifyCardAssigned`). If `RESEND_API_KEY` is not configured,
the email is logged to console instead (same pattern as `sendEmail`).

## Relevant Product Docs

- `docs/product/notifications.md` — email channel, Resend integration

## Acceptance Criteria

- A React Email template `emails/mention-email.tsx` exists with:
  - `mentionedByName: string` — who mentioned them
  - `cardTitle: string` — the card where the mention happened
  - `boardName: string` — the board
  - `cardLink: string` — full URL to the board
  - Follows the same visual style as `emails/assign-email.tsx` and
    `emails/invite-email.tsx` (Planora branding, same layout).
- `notifyMentioned` in `lib/notification.ts` fetches the mentioned user's
  email (currently only `userId` + `name` are selected). Add `user: { select: { email: true } }`
  to the member query, or do a separate lookup after resolving userIds.
- After `createNotification`, `notifyMentioned` calls `sendEmail()` with the
  `MentionEmail` template — same try/catch + console.error pattern as
  `notifyCardAssigned`.
- Self-mentions are still excluded (no email to self).
- The existing `notifyMentioned` test in `tests/server-actions/list-card.test.ts`
  still passes.
- `npx tsc --noEmit` and `npm test` green.

## Design Notes

- **Template file:** Create `emails/mention-email.tsx`. Use the same imports
  and layout shell as `emails/assign-email.tsx`:
  ```tsx
  import {
    Body, Container, Head, Heading, Html, Link, Preview,
    Section, Text,
  } from "@react-email/components";
  ```
- **Member email query:** The current `notifyMentioned` member query fetches
  `{ userId, user: { name } }`. Add `user: { email: true }` to the select,
  and build a `userId → email` map alongside the existing `memberMap`.
- **Email integration point:** Inside `notifyMentioned`, after resolving
  `resolvedUserIds` and filtering the commenter, for each resolved user ID:
  1. Look up their email from the member map.
  2. If no email found (shouldn't happen for real users), skip.
  3. Call `sendEmail({ to: email, subject, react: <MentionEmail ... /> })`.
  4. Wrap in try/catch so one email failure doesn't block others.
- **Environment:** `NEXT_PUBLIC_APP_URL` is already used by `notifyCardAssigned`
  — reuse the same pattern for `cardLink`.
- **No new env vars:** Resend is already configured.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-019 --unit 1 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | Test `notifyMentioned` with a mock for `sendEmail`: verify it's called with correct recipient email, subject, and template. Test that self-mentions don't trigger email. Test that missing RESEND_API_KEY doesn't throw. |
| Integration | n/a — pure notification-side effect, no new Server Action. |
| E2E | Manual QA: mention a user in a comment, check that email is received (or logged if no API key). Automated E2E deferred. |
| Platform | n/a |
| Release | `npx tsc --noEmit`, `npm run lint`, `npm test` green. |

## Harness Delta

Seventh child of epic `E04-board-parity` (Theme B of IN-01). No new artifact
locations. Completes the mention notification story (in-app + email).

## Evidence

_Add commands, reports, screenshots, or links after validation exists._
