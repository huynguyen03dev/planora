# US-026 Email sender identity — drop `noreply@`, add per-context display names

## Status

planned

## Lane

normal (plumbing — touches existing `sendEmail` path + 4 call sites, no new
Server Action, no schema migration, no auth path change). Risk flags:
external-systems (Resend deliverability), existing-behavior (every outbound
email changes its `from` header). No hard gate: Resend already configured and
verified for the domain; this is a header/address change, not new infra.

Follow-up to US-019 (mention email) and US-020 (due-date email). Those stories
wired email delivery but left the sender identity as a single static
`Planora <noreply@...>`. Resend's deliverability guidance explicitly warns
against `noreply@` (signals one-way communication → lower trust, more spam
complaints), and every email shows as bare "Planora" with no per-context
personalization. This story fixes both.

## Scope

**In scope:**

1. Change the configured sender from `noreply@` to `notifications@` (env only).
2. Add per-context **display name** support to `sendEmail` so the `from` header
   reads like `"Hazeruno mentioned you (Planora)"` instead of bare `"Planora"`.
3. Wire each of the 4 `sendEmail` call sites to pass an appropriate display
   name for its context.

**Deferred:**

- **Email for COMMENT notifications** — `notifyCommentOnCard` is in-app only;
  adding email there is a separate story (carry-forward from US-019).
- **`Reply-To` header** — routing replies (e.g. reply-to-comment) is a later
  story.
- **Email preferences / unsubscribe** — all-or-nothing delivery for now.

## Product Contract

Every outbound Planora email must:

- Come from `notifications@planora.hazeruno.dpdns.org` (verified domain), never
  `noreply@`.
- Carry a **context-specific display name** so the recipient sees who/what
  triggered it before opening:

| Trigger | Display name | Example |
| --- | --- | --- |
| Card assignment | `{assignedByName} (Planora)` | `Jane (Planora)` |
| @mention | `{commenterName} mentioned you (Planora)` | `Jane mentioned you (Planora)` |
| Workspace invite | `{inviterName} invited you to Planora)` | `Jane invited you to Planora` |
| Due-date reminder | `Planora` (system alert, no actor) | `Planora` |

- The underlying `<address>` stays identical across all types (one sending
  address → one reputation to warm). Only the name before `<>` changes.

Email remains best-effort: a Resend failure never rolls back the triggering
action (unchanged from current behavior).

## Relevant Product Docs

- `docs/product/notifications.md` — email channel, Resend integration

## Acceptance Criteria

- `sendEmail` in `lib/email.ts` accepts an optional `fromName?: string`. When
  provided, the `from` header is built as `"<fromName> <<address>>"` using the
  address parsed from `EMAIL_FROM`. When omitted, `from` is `EMAIL_FROM`
  verbatim (current behavior preserved).
- The `<address>` is extracted from `EMAIL_FROM` via the existing `<...>` part;
  if parsing fails, fall back to `EMAIL_FROM` verbatim (never crash on a
  misconfigured env string).
- `.env` `EMAIL_FROM` is changed to
  `Planora <notifications@planora.hazeruno.dpdns.org>`.
- `notifyCardAssigned` passes `fromName: \`${data.assignedByName} (Planora)\``.
- `notifyMentioned` passes `fromName: \`${data.commenterName} mentioned you (Planora)\``.
- `notifyDueDate` passes no `fromName` (falls through to base `Planora`).
- `sendInvitationEmail` in `lib/auth.ts` passes
  `fromName: \`${inviterDisplayName} invited you to Planora\`` using the
  inviter's name (fall back to the part before `@` in the inviter email if no
  name).
- `npx tsc --noEmit`, `npm run lint`, and `npm test` green.
- No change to email subjects, bodies, templates, or recipients.

## Design Notes

- **`lib/email.ts` signature:**
  ```ts
  export async function sendEmail({
    to, subject, react, fromName,
  }: {
    to: string;
    subject: string;
    react: React.ReactElement;
    fromName?: string;
  }): Promise<void>
  ```
  Address extraction:
  ```ts
  function resolveFrom(fromName?: string): string {
    if (!fromName) return EMAIL_FROM;
    const match = EMAIL_FROM.match(/<([^>]+)>/);
    const address = match ? match[1] : EMAIL_FROM;
    return `${fromName} <${address}>`;
  }
  ```
- **`EMAIL_FROM` default fallback** (line 3) can stay `"Planora <noreply@localhost>"`
  for local dev — only the real `.env` value changes to `notifications@`.
- **Inviter display name in `lib/auth.ts`:** Better Auth's `sendInvitationEmail`
  hook receives `{ inviter }` where `inviter.user` has `.email` (already used
  for `invitedByEmail`). The user's `.name` may be null; derive a display name
  as `inviter.user.name ?? inviter.user.email.split("@")[0]`.
- **No new env var.** The address lives in the existing `EMAIL_FROM`.
- **Test:** add/extend a unit test mocking the Resend client to assert the
  `from` header value for (a) a call with `fromName`, and (b) a call without.
  Existing `tests/` mock patterns for `sendEmail` should be followed.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-026 --unit 1 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | Test `resolveFrom` / `sendEmail`: with `fromName` → `from` is `"<name> <<address>>"`; without → `from` equals `EMAIL_FROM`; malformed `EMAIL_FROM` (no `<>`) doesn't crash. |
| Integration | n/a — header composition is pure; Resend call shape unchanged. |
| E2E | Manual QA: send a mention + invite to a real inbox, confirm the `from` display name in the inbox preview reads as specified (not bare "Planora", not noreply). Automated E2E deferred. |
| Platform | n/a |
| Release | `npx tsc --noEmit`, `npm run lint`, `npm test` green. |

## Harness Delta

Eighth child of epic `E04-board-parity` (continues the notification/email
thread started by US-019 + US-020). No new artifact locations. No schema
migration, no high-risk gate.

## Evidence

_Add commands, reports, screenshots, or links after validation exists._
