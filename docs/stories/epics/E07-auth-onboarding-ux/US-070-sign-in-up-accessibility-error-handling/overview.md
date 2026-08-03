# Overview — US-070 Sign-in/Sign-up Accessibility & Error Handling

## Current Behavior

The public auth forms (`app/(public)/sign-in/sign-in-form.tsx`,
`app/(public)/sign-up/sign-up-form.tsx`) render and submit, but the error and
input affordances are not production-grade:

- **Error is color-only and unreachable to AT.** The server error renders as
  `<p className="text-sm text-destructive">` (sign-in `:66`, sign-up `:68`)
  with no `role="alert"`/`aria-live`, no link to its inputs, and the `Input`
  component's `aria-invalid:border-destructive …` styles never fire because the
  forms never set `aria-invalid`. Violates DESIGN.md "error = border-destructive
  + message (never color alone)" and WCAG 1.4.1 / 3.3.1 / 4.1.3.
- **No `autocomplete`.** Email/password/name inputs miss `autocomplete="email"`
  / `"current-password"` / `"new-password"` / `"name"`, so password managers
  fill unreliably.
- **Submit button gets stuck.** Sign-in calls `setLoading(false)` only in
  `onError` (`:48`); any resolve path that neither errors nor redirects
  (soft failure, verify-required, network) leaves the button disabled forever.
- **No password requirement hint.** Sign-up enforces `minLength={8}` via native
  validation (`sign-up-form.tsx:101`) with no visible helper text.

## Target Behavior

- Errors are surfaced through the accessibility tree: each input pairs its
  `Label` + `aria-describedby` to a `role="alert"` message, and failing fields
  set `aria-invalid` so the destructive ring engages (non-color channel).
- Every input carries the correct `autocomplete` token so 1Password/Chrome/Apple
  Passwords capture and fill reliably.
- `loading` always resets — via `onSuccess`/`finally` — so the form can never
  wedge.
- Sign-up password shows a helper line stating the minimum length.

## Affected Users

- All unauthenticated users (the public entry surface).
- Disproportionately: screen-reader users, keyboard-only users, and anyone using
  a password manager or a mobile keyboard.

## Affected Product Docs

- `docs/product/workspaces-and-access.md` (§ auth surface — sign-in/sign-up).
- `DESIGN.md` (§ Inputs & Forms — error treatment; § Responsive & Accessibility —
  focus ring, touch targets).

## Non-Goals

- Forgot-password and email-verification flows → **US-071**.
- Cosmetic/structural polish (indent, DRY `safeInternalPath`, header CTA
  redundancy, `name` trim) → **US-072**.
- Changing the input height / touch-target policy — now **decided**: decision
  0024 applies a **pointer/touch split** (keep `h-9` 36px on desktop, bump to
  `h-11` 44px only on touch via a `pointer-coarse` variant). Desktop inputs are
  unchanged; no app-wide density regression.
