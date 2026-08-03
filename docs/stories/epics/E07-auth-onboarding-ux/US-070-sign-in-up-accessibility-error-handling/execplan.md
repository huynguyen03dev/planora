# Exec Plan — US-070 Sign-in/Sign-up Accessibility & Error Handling

## Goal

Make the public auth forms correct and resilient: accessible errors (AT-announced,
field-linked, non-color), reliable password-manager filling, and a submit button
that can never wedge.

## Scope

In scope:

- Wire `aria-invalid` to inputs when an error is present; link error text via
  `aria-describedby`; render the error `<p>` with `role="alert"` (it appears
  dynamically, so it must be announced).
- Add `autocomplete` tokens: email (`"email"`), sign-in password
  (`"current-password"`), sign-up password (`"new-password"`), name (`"name"`).
- Reset `loading` on every terminal path — move state reset to `onSuccess` and a
  `finally` (or always-on `finally`) so neither success-without-redirect nor a
  soft failure leaves the button disabled.
- Add a password helper line on sign-up ("Minimum 8 characters").

Out of scope:

- Forgot-password / email-verification → **US-071**.
- Structural polish (indent, DRY util, header CTA, name trim) → **US-072**.
- The input-height **split** (decision 0024) is in scope here: add a
  `pointer-coarse` Tailwind v4 variant in `app/globals.css` and apply
  `h-9 pointer-coarse:h-11` to the shared `Input`. Desktop/pointer inputs stay
  36px (unchanged); touch devices get 44px.

## Risk Classification

Risk flags:

- **Auth** — changes behavior of the login/sign-up submission and error surface.
- **Public contracts** — client-visible form behavior and markup contract.
- **Existing behavior** — alters how errors render and how the submit lifecycle
  resolves on forms that already ship.
- **Weak proof** — the forms have no component tests today; RTL only landed
  recently (US-068).

Hard gates:

- **Auth** — this is the authentication submission surface. Per FEATURE_INTAKE
  the Auth flag is a hard gate, so the story is **high-risk** regardless of how
  small the markup looks.

## Work Phases

1. **Discovery** — done (UI/UX review): defects enumerated with file:line evidence.
2. **Design** — see `design.md`; input-height split is decided (decision 0024):
   `pointer-coarse` variant + `h-9 pointer-coarse:h-11` on the shared Input.
3. **Validation planning** — see `validation.md`; add RTL tests for the two forms.
4. **Implementation** — error wiring + `autocomplete` + loading lifecycle +
   helper text, per form.
5. **Verification** — `npm test`, `npm run lint`, `npm run build` green; manual
   drive with a screen reader + a password manager.
6. **Harness update** — product doc + TEST_MATRIX + story row; PR into `dev`.

## Stop Conditions

Pause for human confirmation if:

- **Input height split is decided** (decision 0024): keep `h-9` (36px) default
  for pointer/desktop — **no density regression** — and add `pointer-coarse:h-11`
  (44px) under `@media (pointer: coarse)` for touch. No app-wide sweep needed
  because desktop is byte-identical to today; just confirm touch renders 44px.
- The error model needs to differ between the two forms (it should not — keep
  them symmetric).
- Any change would weaken an existing validation requirement.
