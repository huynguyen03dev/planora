# 0023 Enforce email verification (supersedes the 0018 deferral)

Date: 2026-07-14

## Status

Accepted — supersedes the **email-verification deferral** portion of
[0018](./0018-session-lifetime-and-deferred-email-verification.md). The
session-lifetime portion of 0018 (explicit 7-day session / 1-day updateAge)
stands unchanged.

## Context

0018 (2026-07-02, Accepted) deliberately deferred
`emailAndPassword.requireEmailVerification` to the pre-launch gate, because two
prerequisites were unmet:

1. **Email transport was not guaranteed.** `lib/email.ts` logs instead of sending
   when `RESEND_API_KEY` is unset. Enforcing verification then would have locked
   **every** new signup out — a worse failure than the latent
   invite-acceptance-by-unverified-email hole.
2. **The security claim was unprovable here.** "An unverified user cannot accept
   an invite" is an E2E assertion, and no Playwright harness existed yet.

This decision (recorded as part of epic E07-auth-onboarding-ux, US-071) resolves
the open question: **enforce email verification** (posture (a) in the US-071
design), superseding the deferral.

Both prerequisites that justified the deferral are now addressable:

1. **Transport — configured in this local checkout, NOT proven for other envs.**
   `RESEND_API_KEY` is present and non-empty in this repo's `.env` (verified),
   so `lib/email.ts` takes the live Resend send path (`:9`), not the logging
   fallback (`:38-40`), in this environment. **This is not a guarantee for any
   other deployed environment** — the 0018 lockout risk reappears in any
   target env where the key is missing, invalid, or not provisioned. Flipping
   `requireEmailVerification` therefore requires a smoke check that the key
   actually delivers in each target env, not just here.
2. **Proof — achievable.** The Playwright E2E harness now exists (US-009), so
   the unverified-invite assertion can be written where it could not in 0018.

## Decision

Enforce email verification, exactly as 0018's Follow-Up prescribed:

- Wire `sendVerificationEmail` to the existing `sendEmail` transport (now
  backed by a configured Resend key).
- Set `emailAndPassword.requireEmailVerification = true`.
- Sign-up `onSuccess` no longer drops the user straight into `/boards`; show a
  "verify your email" state with a resend affordance, plus a `/verify-email`
  token-consume route (see US-071 design).
- Add the E2E proof that an unverified account cannot accept an invitation
  (extends US-009).

Because the transport is configured, there is no remaining safety gate blocking
the flag — only the normal implementation + proof work.

## Alternatives Considered

1. Keep deferring (status quo). Rejected by this decision: both deferral
   prerequisites are now addressable, and the user has chosen to close the gap.
2. Gate behind an env flag defaulting off. Rejected (as in 0018): it would not
   preserve the security claim in the default configuration and is a foot-gun.
3. Enforce without the verify-email UI state (let BA block silently). Rejected:
   a user-facing "check your email" state + resend is required for a usable
   flow, not just the server flag.

## Consequences

Positive:

- Closes the unverified-signup-accepts-invite hole 0018 left open.
- Signup contract now matches the product expectation (owned mailboxes only).

Tradeoffs:

- Added friction at signup + a dependency on transactional email delivery
  working in every environment that runs the flag (any env without a valid
  `RESEND_API_KEY` reintroduces the lockout — keep the key provisioned).
- New client state + route (`/verify-email`) and a resend affordance to build
  and test.

## Follow-Up

- Implementation: US-071 (verify-email state + `/verify-email` route + resend,
  and the forgot-password flow).
- Validation: smoke-verify the configured `RESEND_API_KEY` actually delivers a
  verification email; then add the E2E proof (unverified account cannot accept
  an invitation, extends US-009).
- Update `lib/auth.ts` `NOTE` comment (US-062 mn12) to point at 0023 once flipped.
