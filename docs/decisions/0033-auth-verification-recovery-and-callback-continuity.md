# 0033 Auth verification recovery and callback continuity

Date: 2026-08-10

## Status

Accepted

## Context

Decision 0023 enforced email verification and introduced a token-consume route,
but the implemented UX still has four failure modes: unverified sign-in is shown
as a destructive form error, expired links cannot request a replacement in
place, resend can claim success without inspecting the Better Auth response, and
the invitation return path is lost after signup verification. Signup and
password reset also accept a single password entry, making an unnoticed typo a
recoverability problem.

## Decision

- `/verify-email` is the single verification recovery hub. Without a token it
  accepts an email and sends a neutral verification response; with a token it
  owns verifying, success, and invalid/expired states. Every recoverable state
  offers resend without requiring another password submission.
- `EMAIL_NOT_VERIFIED` is an expected onboarding state. Sign-in routes to the
  verification hub and does not also render the raw Better Auth error as a
  destructive alert.
- Signup and reset-password require a matching confirmation value in the client.
  The confirmation is never sent to Better Auth; mismatches are field-scoped and
  block the request.
- Signup, resend, the email link, and token consumption preserve one
  `callbackURL`, validated by `safeInternalPath` at every browser-controlled
  boundary. Invitation signup therefore returns to the original invitation.
- Resend success is based on the Better Auth result, not absence of a thrown
  exception. Unknown and already-verified addresses retain Better Auth's neutral
  success envelope to avoid account enumeration. Provider failures use a generic
  actionable error and never claim delivery.
- Resend is bounded by a 30-second client cooldown. Server-side Better Auth rate
  limiting remains authoritative.

## Alternatives Considered

1. Keep resend embedded only in signup/sign-in. Rejected because reloads and
   expired links still become dead ends and the logic remains duplicated.
2. Display `Email not verified` as a normal form error plus a resend panel.
   Rejected because one recoverable state is represented simultaneously as a
   failure and an onboarding action.
3. Redirect every verified user to `/boards`. Rejected because it breaks the
   accepted invitation return-path contract.

## Consequences

Positive:

- Verification recovery has one durable URL and one state machine.
- Invitation onboarding resumes where it started.
- Password typos and false-positive resend feedback are prevented.

Tradeoffs:

- Public auth RTL and invitation E2E contracts must be updated together.
- Email delivery remains an external dependency; a provider failure is
  recoverable through retry but cannot be hidden as success.

## Follow-Up

- Extend US-071 and the auth row in `docs/TEST_MATRIX.md` with focused RTL and
  invitation callback E2E evidence.
- Keep production transport provisioning covered by deployment smoke checks.
