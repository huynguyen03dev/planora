# US-073 Mailpit dev/test mail sink + real E2E verification

## Status

in-progress

## Lane

normal (risk gate recorded in decision 0025 — external transport + existing E2E
behavior; verification requirement itself is unchanged from 0023)

## Product Contract

Email verification stays enforced in every environment (decision 0023). In
non-production, transactional mail (verification, reset, invite) is captured by a
local sink (Mailpit) instead of a live inbox, so the real link is retrievable
locally. Automated tests and local devs/agents complete signup by following the
actual verification link — never by disabling or bypassing verification.

## Relevant Product Docs

- `docs/product/workspaces-and-access.md` (auth/onboarding)
- `docs/decisions/0023-enforce-email-verification.md`
- `docs/decisions/0025-mailpit-dev-test-mail-sink.md`

## Acceptance Criteria

- `docker-compose.yml` has a `mailpit` service (SMTP `:1025`, UI/API `:8025`).
- `lib/email.ts` sends via Resend in production; in non-production with
  `SMTP_HOST` set it sends to Mailpit (React email rendered to HTML/text);
  otherwise it logs. A stray `SMTP_HOST` cannot affect production delivery.
- `emailAndPassword.requireEmailVerification` remains `true` (unchanged).
- E2E `signUp()` completes the real verification flow by fetching the link from
  Mailpit's API (`e2e/helpers/mail.ts`) and following it, then lands on `/boards`.
- `.env.example` documents `SMTP_HOST` / `SMTP_PORT`.

## Design Notes

- Commands: none (no server action changes).
- Queries: none.
- API: consumes Mailpit REST API in E2E only (`/api/v1/search`, `/api/v1/message/{id}`).
- Tables: none (no schema change; `emailVerified` already exists).
- Domain rules: verification enforced everywhere; transport selected by
  `NODE_ENV` + `SMTP_HOST`.
- UI surfaces: none.

## Validation

`scripts/bin/harness-cli story update --id US-073 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | `tsc`/lint/vitest green after transport change (no email unit test regressed). |
| Integration | Transport smoke: `sendEmail` → message visible via Mailpit API. |
| E2E | `signUp()` reaches `/boards` via the real Mailpit verification link; realtime specs that depend on it pass. |
| Platform | n/a |
| Release | Prod still uses Resend (unchanged path); non-prod gate verified. |

## Harness Delta

Adds decision 0025. Unblocks the CI E2E signup lockout that 0023's enforcement
introduced (CI has no `RESEND_API_KEY`).

## Evidence

- Transport smoke output + Mailpit API confirmation (added after run).
- E2E run of a signup-dependent spec (added after run).
