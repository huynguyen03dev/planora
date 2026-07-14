# Validation — US-070 Sign-in/Sign-up Accessibility & Error Handling

## Proof Strategy

The load-bearing contracts are the **accessibility wiring** and the **submit
lifecycle that never wedges**. RTL landed in US-068, so the two forms are now
testable as client components; that is the primary layer. Manual proof adds a
screen-reader pass and a password-manager capture/fill pass, since those are
exactly the regressions this story exists to prevent.

Definition of done:

- Error text is announced (`role="alert"`), linked to inputs
  (`aria-describedby`), and failing inputs carry `aria-invalid` (asserted via
  RTL `getByRole("alert")` + `toHaveAttribute`).
- Every input has the correct `autocomplete` token (asserted).
- Submit cannot wedge: after a rejected submit, the button returns to enabled
  and the field remains editable; after success, redirect proceeds (sign-up) /
  callbackURL redirect proceeds (sign-in).
- Unit/integration gate (`npm test`) + `npm run lint` + `npm run build` green.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit/RTL | `SignInForm`: renders email + password with `autocomplete="email"` / `"current-password"`; `onError` from `signIn.email` injects a message that appears under `role="alert"` and sets `aria-invalid` on the inputs; after error the submit button is re-enabled (loading reset). `SignUpForm`: name/email/password carry `autocomplete="name"`/`"email"`/`"new-password"`; password helper text present; error → `role="alert"` + `aria-invalid`; after error submit re-enabled. Mock `@/lib/auth-client` `signIn`/`signUp` to call `onError`/`onSuccess` deterministically. |
| Integration | N/A (no server boundary added). |
| E2E | (Optional, follow-up) Drive the real form with a password manager + a screen reader; confirm autofill populates and the error is read. Deferred until the Playwright auth harness exists. |
| Platform | N/A (browser only). |
| Performance | N/A. |
| Logs/Audit | N/A — no new audit sink. |

## Fixtures

- A mocked `signIn.email`/`signUp.email` that resolves `onError({ error: { message } })`
  for the failure case and `onSuccess()` for the success case (sign-in) /
  `onSuccess()` → `router.push` spy (sign-up).
- RTL render harness matching the existing US-068 client-component tests
  (`board-filter`, `card-detail-sheet`, `rule-builder-dialog`).

## Commands

```text
npx vitest run components/sign-in-form        # once test files are added
npx vitest run components/sign-up-form
npm run lint
npm run build
```

(Path the new tests land under is the existing components/ project convention
from US-068; place form tests next to the forms or under `components/` per the
workspace vitest config.)

## Acceptance Evidence

Add results after verification: RTL output, `npm run build` clean, and a
one-line note from the manual screen-reader + password-manager pass.
