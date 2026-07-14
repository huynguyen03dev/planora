# Validation — US-071 Forgot Password & Email Verification

## Proof Strategy

These are new auth flows on the Auth hard gate, so they need first-class tests
before they ship, in the style of the existing `tests/server-actions/` boundary
tests. Client/request forms are proven with RTL (US-068 harness); token-consume
semantics and the verification gate are proven by integration/E2E driving the
real Better Auth surface where feasible.

Definition of done:

- Forgot-password request: unknown emails return the **same neutral success** as
  known emails (no enumeration); known emails trigger `requestPasswordReset`.
- Reset with a valid token sets the new password and invalidates the flow;
  expired/invalid/garbage tokens are rejected with an accessible error.
- If enforcing verification: an unverified user cannot reach `/boards`; the
  verify route consumes the token exactly once; resend is rate-limited/idempotent
  enough not to spam.
- Unit/integration gate (`npm test`) + `npm run lint` + `npm run build` green.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit/RTL | Forgot-password request form: submits `requestPasswordReset({ email })`; renders the neutral "check your email" state on success; shows accessible error on client validation. Reset form: requires token + new-password; `aria-invalid` on mismatch/short; calls `resetPassword({ newPassword, token })`. Verify-email pending state: renders resend control (re-calls `sendVerificationEmail`). (Mock `@/lib/auth-client`.) |
| Integration | Token semantics against a real/seeded BA adapter: valid token → password changed + token invalidated; replay rejected; malformed token rejected. Enumeration guard: response shape identical for known vs unknown email. |
| Security | User-enumeration regression (neutral response); reset token single-use; verification token single-use; unverified user blocked from app (posture a). |
| E2E | Full drive: request → (stubbed email) → reset link → new password → sign-in succeeds. Verify: signup → "check email" → verify link → lands in app (posture a). |
| Platform | N/A (browser + email client deep links; no native shell). |
| Performance | N/A. |
| Logs/Audit | Ensure no PII (email) is logged on the request path beyond BA's own handling. |

## Fixtures

- A seeded user with a known email + a seeded reset token and verification token
  (via BA's test surface or direct adapter insert).
- A "unknown" email that must produce the identical response shape.
- RTL mock of `requestPasswordReset`/`resetPassword`/`sendVerificationEmail`/
  `verifyEmail` resolving success / error deterministically.

## Commands

```text
npx vitest run components/forgot-password-form   # once added
npx vitest run components/reset-password-form
npm run lint
npm run build
npm run test:e2e -- <auth spec>                   # once a Playwright auth harness exists
```

## Acceptance Evidence

Add results after verification: RTL + integration output, `npm run build` clean,
a manual drive note (request → email → reset → sign-in; verify link), and the
decision record number for the resolved verification posture.
