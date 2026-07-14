# Exec Plan — US-071 Forgot Password & Email Verification

## Goal

Close the two standard gaps in the public auth surface: a working forgot-password
recovery flow and a decided (and implemented) email-verification posture.

## Scope

In scope:

- **Forgot password:**
  - Sign-in form gains a "Forgot password?" link.
  - New route(s) under `app/(public)/` for request-email → `requestPasswordReset`,
    and reset (`?token=…`) → `resetPassword` → sign-in.
  - Wire `requestPasswordReset` / `resetPassword` from `lib/auth-client.ts`.
  - Errors/empty/invalid-token states reusing the US-070 error model.
- **Email verification:**
  - Implement the enforce posture (decision 0023): verify-email state +
    `/verify-email` route + resend, reflected in `sign-up-form.tsx`.
  - Wire `sendVerificationEmail` / `verifyEmail` from the client if enforcing.

Out of scope:

- OAuth / magic-link / passkeys.
- Sender-identity changes (US-026).
- Form a11y/error-handling polish (US-070) and structural polish (US-072) — but
  the new routes **reuse** the US-070 error model so they ship accessible.

## Risk Classification

Risk flags:

- **Auth** — new login-session-affecting flows (password reset, verification
  gate).
- **External systems** — email delivery for reset + verification links.
- **Public contracts** — new public routes + changed signup outcome.
- **Existing behavior** — changes what `onSuccess` means on signup.
- **Weak proof** — neither flow exists today; no tests.

Hard gates:

- **Auth** (hard gate) and **External systems** → **high-risk**.

## Work Phases

1. **Discovery** — confirm Better Auth exposes `requestPasswordReset`,
   `resetPassword`, `sendVerificationEmail`, `verifyEmail`, and the
   `requireEmailVerification` config in `lib/auth.ts`. Posture **resolved** →
   decision 0023 (enforce); transport **configured in this local checkout**
   (`RESEND_API_KEY` in `.env`) — must be smoke-verified in each target env.
2. **Design** — `design.md`; decision record once the verification posture is
   locked.
3. **Validation planning** — `validation.md`; client/RTL for the request form,
   route-level for token handling; an email-not-sent resilient state.
4. **Implementation** — forgot-password end-to-end first; then the chosen
   verification posture.
5. **Verification** — `npm test` + `npm run lint` + `npm run build`; manual drive
   of request → email → reset → sign-in.
6. **Harness update** — product doc + decision + TEST_MATRIX + story row; PR into
   `dev`.

## Stop Conditions

Pause for human confirmation if:

- The **email-verification posture is decided** (0023: enforce). The remaining
  gates are: (a) smoke-verify the configured `RESEND_API_KEY` actually
  delivers in each target env (key presence in `.env` ≠ key validity), and
  (b) add the US-009 E2E proof (unverified account cannot accept an invite)
  before declaring done.
- Better Auth's client/server API for these flows differs from the assumed shape
  (e.g. token transport, expiry).
- Email deliverability cannot be validated locally (then scope a manual/SMTP
  proof and note it).
- Any change weakens an existing auth/validation requirement.
