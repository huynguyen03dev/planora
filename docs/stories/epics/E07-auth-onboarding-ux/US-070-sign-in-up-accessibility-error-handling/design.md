# Design — US-070 Sign-in/Sign-up Accessibility & Error Handling

## Domain Model

No schema change. This story is about the client-side **error state model** of
the auth forms:

- `error: string` — current per-form message (already exists).
- **New:** a derived `hasError` boolean drives `aria-invalid` on inputs and the
  presence of the describedby target.

Keep the model field-level only if we later split per-field validation; today a
single form-level message is sufficient and matches Better Auth's
`onError(ctx).error.message`.

## Application Flow

Submission lifecycle today (sign-in):

```
handleSubmit → setLoading(true) → signIn.email({...}, { onError }) → ?
```

The `?` is the defect: only `onError` resets loading. New lifecycle:

```
handleSubmit → setLoading(true) → signIn.email(
   {...},
   { onError → setError + setLoading(false) },   // already present
)
// wrap the await in try/finally so loading ALWAYS resets on any path.
```

`onSuccess` on sign-in relies on `callbackURL` redirect (client nav), which is
fine; the `finally` covers the gap where no redirect fires.

Sign-up already has `onSuccess → router.push`; the same `finally` belt makes it
robust against a redirect that hasn't committed yet.

## Interface Contract

Markup contract changes (both forms):

| Element | Attribute(s) added |
| --- | --- |
| email `<Input>` | `autocomplete="email"`, `aria-invalid={hasError}`, `aria-describedby="form-error"` |
| sign-in password `<Input>` | `autocomplete="current-password"`, `aria-invalid`, `aria-describedby` |
| sign-up password `<Input>` | `autocomplete="new-password"`, `aria-invalid`, `aria-describedby` + helper `<p id="pw-help">` |
| name `<Input>` (sign-up) | `autocomplete="name"`, `aria-invalid`, `aria-describedby` |
| error `<p>` | `id="form-error"`, `role="alert"` |

No request/response DTO changes. No route changes.

## Data Model

None.

## UI / Platform Impact

- Browser/password-manager UX improves materially (autofill + capture).
- Screen readers announce errors; keyboard users see the destructive ring on the
  offending field (non-color channel).
- **Input height split (decision 0024):** the shared `Input` keeps `h-9`
  (36px) on pointer/desktop (unchanged — no density regression) and adds
  `h-11` (44px) under `@media (pointer: coarse)` via a Tailwind v4
  `pointer-coarse` variant in `app/globals.css`. Meets DESIGN.md's split
  (36px pointer / 44px touch) without the +8px desktop bump a blanket `h-11`
  would have caused.

## Observability

No new logs. Errors still surface from Better Auth's `onError` payload only.

## Alternatives Considered

1. **Per-field error map instead of a single `error` string.** Rejected for now —
   Better Auth returns one message and the value-add is small until client-side
   validation expands. Note as a follow-up.
2. **`aria-live="polite"` region instead of `role="alert"`.** `role="alert"` is
   correct for an injected, urgent validation message; `polite` would let AT
   finish reading first and delay the error. Chose `alert`.
3. **Reset loading only in `onSuccess`.** Insufficient — soft failures and
   verify-required paths may resolve without `onSuccess`. `finally` is the
   guarantee.
