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
- Signup/reset confirmation mismatch is field-scoped and never reaches Better
  Auth. Unverified sign-in enters verification recovery without a destructive
  error. Resend provider failures never render a success claim.
- Invitation signup preserves its internal callback through the email link and
  returns to the invitation after verification; external/protocol-relative
  callbacks fall back to `/boards`.
- Unit/integration gate (`npm test`) + `npm run lint` + `npm run build` green.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit/RTL | Forgot-password request form: submits `requestPasswordReset({ email })`; renders the neutral "check your email" state on success; shows accessible error on client validation. Reset form: requires token + new-password; `aria-invalid` on mismatch/short; calls `resetPassword({ newPassword, token })`. Verify-email pending state: renders resend control (re-calls `sendVerificationEmail`). (Mock `@/lib/auth-client`.) |
| Integration | Token semantics against a real/seeded BA adapter: valid token → password changed + token invalidated; replay rejected; malformed token rejected. Enumeration guard: response shape identical for known vs unknown email. |
| Security | User-enumeration regression (neutral response); reset token single-use; verification token single-use; unverified user blocked from app (posture a). |
| E2E | Full drive: request → (stubbed email) → reset link → new password → sign-in succeeds. Verify: signup → "check email" → verify link → lands in app (posture a). |
| E2E callback | Invitation → signup → real Mailpit verification link → original invitation; unsafe callback denial remains unit-proven through `safeInternalPath`. |
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
NODE_ENV=test npx vitest run <changed auth/email suites>
DATABASE_URL=<test-postgres> NODE_ENV=test npm test
npx eslint . --ignore-pattern '.claude/worktrees/**' --ignore-pattern 'test-results/**' --ignore-pattern 'playwright-report/**'
DATABASE_URL=<test-postgres> NODE_ENV=production npm run build
DATABASE_URL=<test-postgres> NODE_ENV=development npm run test:e2e -- e2e/auth-invitation-verification.spec.ts
```

## Acceptance Evidence

- RED baseline: the changed auth suites failed 15 cases before implementation;
  `lib/email.test.ts` failed both provider-error cases while delivery errors were
  swallowed.
- Focused GREEN: 47/47 across signup, sign-in, reset-password, verify-email,
  invite-dialog, and email transport tests.
- Full unit/integration: 1710/1710 tests across 110 files, using the isolated
  Postgres test database.
- E2E callback: 1/1 in 30.6s. The test creates the owner and invitee through the
  real signup UI, reads both real verification messages from Mailpit, consumes
  the tokens, and asserts the invitee returns to the exact invitation URL.
- Production build completed, TypeScript completed, and `git diff --check` is
  clean.
- Current-repo ESLint completed with 0 errors and 4 pre-existing `<img>`
  warnings. Bare `npm run lint` also traverses an inherited nested worktree at
  `.claude/worktrees/unify-invitations-into-bell` and reports its unrelated
  generated/stale errors; that worktree was not modified or deleted.
- Decision records: 0023 (verification enforced) and 0033 (recovery hub,
  password confirmation, truthful resend, safe callback continuity).
