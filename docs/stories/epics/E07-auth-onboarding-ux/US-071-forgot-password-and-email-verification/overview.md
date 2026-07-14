# Overview — US-071 Forgot Password & Email Verification

## Current Behavior

The public auth surface has two missing standard flows:

- **No "Forgot password?"** — confirmed: grep `requestPasswordReset|resetPassword|forgot`
  across the repo returns **0 matches**. A user who forgets their password has
  no recovery path. The sign-in form (`app/(public)/sign-in/sign-in-form.tsx`)
  has no link and no route.
- **No email verification.** `sign-up-form.tsx:45-46` calls `onSuccess →
  router.push(redirectTo)` immediately. Signup with a fake/unowned email is
  trivial; there is no `requireEmailVerification` gate and no "check your email"
  intermediate state.

## Target Behavior

- **Forgot password** — a "Forgot password?" link on sign-in leads to a flow:
  enter email → Better Auth `requestPasswordReset` sends a reset link → landing
  page on the reset token → set new password via `resetPassword` → sign in.
- **Email verification** — (decision 0023: enforce) `signed-up-unverified →
  verify-pending (resend) → verified → app`.

## Affected Users

- All unauthenticated users; in particular anyone who loses a password or signs
  up with a shared/throwaway mailbox.

## Affected Product Docs

- `docs/product/workspaces-and-access.md` (auth flows — add forgot-password and
  the verification posture).
- `DESIGN.md` (Inputs & Forms / elevation — any new routes reuse the public
  Card surface).

## Non-Goals

- Accessibility/error-handling polish on the existing forms → **US-070**.
- Structural polish → **US-072**.
- SSO / OAuth / magic-link / passkeys (not in scope; would be their own story).
- Changing the email transport/provider identity (US-026 owns sender identity).

## Decision (resolved 2026-07-14)

**Email verification posture: enforce.** See decision
[0023](../../../../decisions/0023-enforce-email-verification.md) (supersedes the
0018 deferral). `requireEmailVerification = true`; sign-up shows a "verify your
email" state instead of dropping into `/boards`, with a resend affordance and a
`/verify-email` route. Transport is **configured in this local checkout**
(`RESEND_API_KEY` present in `.env`); the 0018 lockout risk reappears in any
target env where the key is missing/invalid — a smoke check is required per
target env. The remaining work is implementation + the US-009 E2E proof
(unverified account cannot accept an invite).
