# 0025 Mailpit as the dev/test mail sink (verification stays enforced)

Date: 2026-07-19

## Status

Accepted — **extends** [0023](./0023-enforce-email-verification.md); does not
supersede it. `emailAndPassword.requireEmailVerification` remains `true` in every
environment. This decision only changes *where mail lands* in non-production.

## Context

0023 enforced email verification everywhere. It correctly rejected an
"env-flag-defaulting-off" alternative as a security foot-gun (it would drop the
verification claim in the default config). But enforcement created two real
frictions that 0023's own Follow-Up flagged:

1. **CI E2E lockout.** The E2E job (`e2e.yml`) runs with **no `RESEND_API_KEY`**,
   so `lib/email.ts` took the logging fallback and no verification link was ever
   produced. With verification enforced, a fresh signup can never reach
   `/boards` — the `signUp()` helper (`e2e/helpers/app.ts`) and every realtime
   spec that depends on it are blocked. This is the exact 0018/0023 "no transport
   → lockout" risk, now hitting the test lane.
2. **Local dev / agent onboarding.** A verification link delivered to a real
   inbox via Resend is unreachable to an automated agent or a local dev doing a
   quick check — there is no local way to retrieve it.

The naive fixes (disable verification in dev/test, or forge/skip the token) both
weaken or bypass the very claim 0023 established, and 0023 already rejected the
env-flag form of this.

## Decision

Introduce a **local SMTP sink (Mailpit)** for non-production, without touching
the verification requirement:

- Add a `mailpit` service to `docker-compose.yml` (SMTP `:1025`, web UI + REST
  API `:8025`).
- `lib/email.ts` selects transport by environment: **production always uses
  Resend**; **non-production with `SMTP_HOST` set** sends via nodemailer to
  Mailpit (React email rendered to HTML/text); otherwise the logging fallback is
  unchanged. The non-prod gate means a stray `SMTP_HOST` can never swallow real
  production mail.
- E2E retrieves the **real** verification link from Mailpit's REST API
  (`e2e/helpers/mail.ts`) and follows it; `signUp()` now completes verification
  through the actual flow — no bypass. Only the link's path+query is used, so a
  non-local `NEXT_PUBLIC_APP_URL` in the link still resolves to the test baseURL.

Verification is enforced identically in test/dev/prod; the only difference is the
inbox the mail is captured in.

## Alternatives Considered

1. Gate `requireEmailVerification` behind an env flag defaulting off. Rejected —
   this is 0023's already-rejected foot-gun; it drops the security claim in the
   default configuration.
2. Log the verification token to console/file in dev and scrape it. Rejected —
   it exercises a *different*, dev-only code path than production and reads as a
   backdoor; Mailpit exercises the real transport end-to-end.
3. Forge/seed a verified user to skip the flow (what an unbriefed agent did).
   Rejected — bypasses the flow entirely, proves nothing, and normalizes
   secret-reading / token-forging in automation.

## Consequences

Positive:

- Unblocks the CI E2E lockout 0023 introduced and lets agents/devs complete
  signup locally, **while keeping verification enforced everywhere** (0023's
  claim intact).
- The E2E suite now proves the *real* verification flow, not a stub.

Tradeoffs:

- Adds a dev/test infra dependency (Mailpit container) and `nodemailer`.
- One more transport branch in `lib/email.ts` to keep correct (mitigated by the
  non-prod gate + prod path left untouched).

## Follow-Up

- Story: US-073 (Mailpit dev/test mail sink + E2E verification helper).
- Validation: transport smoke (`sendEmail` → message visible in Mailpit API);
  E2E `signUp()` reaches `/boards` via the real link; unit suite green.
- Docs: `.env.example` documents `SMTP_HOST`/`SMTP_PORT`; `AGENTS.md` env note.
