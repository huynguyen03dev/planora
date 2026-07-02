# 0018 Explicit session lifetime now; email verification deferred to pre-launch

Date: 2026-07-02

## Status

Accepted

## Context

The 2026-07-01 whole-project review (US-062, mn12) flagged `lib/auth.ts`:
`emailAndPassword.enabled` is `true` with **no** `requireEmailVerification` and
**no** explicit session expiry. Combined with invitation-accept-by-email
matching, an unverified signup on an invited email address could accept another
person's invitation. This trips two FEATURE_INTAKE hard gates (auth + external
provider), so the direction is recorded here.

Two facts constrain what can ship safely today:

1. **Email delivery is not guaranteed.** `lib/email.ts` logs instead of sending
   when `RESEND_API_KEY` is unset (the local/dev default, and possibly staging).
   Turning on `requireEmailVerification` before a verified transactional-email
   transport would lock **every** new signup out — a worse failure than the
   latent invite-acceptance hole.
2. **The end-to-end claim is unprovable in this repo.** The proof for mn12 is
   "an unverified user cannot accept an invite" — an E2E assertion, and there is
   no E2E harness (no Playwright). Enabling the flag here would also break the
   fresh-signup→login flow used for manual/agent testing.

## Decision

Split mn12 into what is safe-and-provable now versus the pre-launch gate:

- **Now:** pin an explicit session lifetime in `lib/auth.ts` —
  `session.expiresIn = 7 days`, `session.updateAge = 1 day`. These were
  previously implicit Better Auth defaults; making them explicit documents intent
  and pins them against library-default drift. No behavioural change, no external
  dependency.
- **Deferred to pre-launch:** enabling `requireEmailVerification` (with
  `sendVerificationEmail` wired to the existing `sendEmail` transport) plus an
  E2E proof that an unverified account cannot accept an invitation. This is gated
  on `RESEND_API_KEY` being provisioned in the target environment and an E2E
  harness existing. A `NOTE` comment in `lib/auth.ts` points here so the gate is
  not silently forgotten.

## Alternatives Considered

1. Enable `requireEmailVerification` now. Rejected: with no guaranteed email
   transport it locks out all new users, and the security claim cannot be proven
   here — worse than the latent risk it closes.
2. Gate `requireEmailVerification` behind an env flag defaulting off. Rejected as
   the shipping answer: it would not preserve the security claim in the default
   configuration, and it adds a foot-gun (silently-off verification). The honest
   posture is an explicit, documented pre-launch gate.

## Consequences

Positive:

- Session lifetime is now explicit and intentional.
- The email-verification gate and its prerequisites (email transport + E2E) are
  recorded, not lost.

Tradeoffs:

- The invite-acceptance-by-unverified-email risk remains open until launch. It
  is bounded: accepting an invite still requires knowing a valid pending
  invitation for the exact email, and workspace access is still role-gated.

## Follow-Up

- Pre-launch: provision `RESEND_API_KEY`, wire `emailVerification.sendVerificationEmail`,
  set `emailAndPassword.requireEmailVerification = true`, and add the E2E proof
  (extends US-009). Then supersede this decision's deferral.
