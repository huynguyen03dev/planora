# Design — US-071 Forgot Password & Email Verification

## Domain Model

No new persistence — Better Auth owns the `verification` and password-reset
token lifecycle via the Prisma adapter. This story wires client + routes to BA's
existing operations.

Conceptual states:

- **Forgot password:** `requesting → requested (email sent) → (out-of-band) →
  resetting (token) → done → sign-in`.
- **Email verification (enforce — decision 0023):** `signed-up-unverified →
  verify-pending (resend) → verified → app`.
- **Verification recovery (decision 0033):** `requesting → pending → resend
  cooldown`, or `token → verifying → success → safe callback`; invalid/expired
  tokens return to the requesting state without another password submission.

## Application Flow

```
Forgot password (Better Auth method names verified against dist):
  POST requestPasswordReset({ email }) → BA emails reset link
  GET  /reset-password?token=…            → reset form
  POST resetPassword({ newPassword, token }) → BA invalidates old pw
  → redirect to /sign-in

Email verification (enforce — decision 0023):
  signUp.email({...})                     → BA creates the unverified user
  sendVerificationEmail({...})            → BA sends the verification email
  → show "verify your email" state (not router.push to /boards)
  GET  /verify-email[?token=…]            → request/pending/token hub
  verifyEmail({ token })                  → verified → safe callbackURL
  sendVerificationEmail({ email, callbackURL }) → neutral resend response
```

> **Method names (verified against `node_modules/better-auth/dist/`):**
> `requestPasswordReset` / `resetPassword` (NOT `forgetPassword`),
> `sendVerificationEmail` / `verifyEmail` (NOT `emailVerification`).
> There is **no** `resendVerificationEmail` — to resend, re-call
> `sendVerificationEmail`.

`lib/auth-client.ts` currently destructures `signIn, signUp, signOut, …` — extend
with `requestPasswordReset`, `resetPassword`, `sendVerificationEmail`,
`verifyEmail`.

## Interface Contract

New public routes (under `app/(public)/`):

| Route | Purpose |
| --- | --- |
| `/forgot-password` | email request → `requestPasswordReset` |
| `/reset-password` | token consume → `resetPassword` |
| `/verify-email` | verification request/pending/token/success/expired hub |

Sign-in form gains: `<Link href="/forgot-password">Forgot password?</Link>`.

Sign-up form gains (posture-dependent): a "verify your email" intermediate
instead of immediate `router.push`, plus a resend control.

All new forms reuse the US-070 error model (`role="alert"` + field-scoped
`aria-invalid` + `autocomplete` tokens: `"email"`, `"new-password"`). Signup
and reset-password add `confirm-password`; it must match locally and is never
included in a Better Auth payload. `EMAIL_NOT_VERIFIED` is represented as a
verification transition, not a destructive alert.

`callbackURL` is passed through signup, resend, the app-owned verification email
link, and token consumption. Browser-provided values are normalized with
`safeInternalPath`; missing or unsafe values fall back to `/boards`.

`emailVerification.sendOnSignUp` stays disabled. The signup client requests the
verification email explicitly after account creation so it can route to a
truthful `delivery=sent|failed` recovery state instead of treating account
creation as proof that the provider accepted the message.

## Data Model

None. Token storage is Better Auth's (Prisma adapter). If BA's schema for
`verification` is not yet migrated, that is a **stop condition** (schema/migration
risk) — surface it, don't silently push a migration.

## UI / Platform Impact

- Reuse the public `Card` surface (DESIGN.md) — no new elevation language.
- Deep links (reset/verify tokens) must work from email clients on mobile; ensure
  `BETTER_AUTH_URL` / redirect base is correct (cross-platform/deep-link
  adjacency — no native shell today, so browser-only).

## Observability

- Surface BA errors via the same US-070 error model.
- Avoid revealing whether an email exists ("if that account exists, we've sent a
  link") to prevent user-enumeration via the forgot-password endpoint.
- A verification resend reports success only when the Better Auth client result
  has no error. Provider failures use a generic retryable message; unknown and
  already-verified addresses retain the same neutral success state.

## Alternatives Considered

1. **Magic-link instead of password reset.** Out of scope; would not solve the
   verification-posture question and adds a new auth method.
2. **Enforce verification via DB flag instead of BA.** Rejected — BA already owns
   the `verification` table; duplicating the gate is a correctness hazard.
3. **Skip verification, ship only forgot-password.** Viable interim if the human
   defers the verification decision; would split this story. Flagged as an option
   in the Stop Conditions, not the default.
