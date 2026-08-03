# US-072 Sign-in/Sign-up Polish

## Status

planned

## Lane

normal

## Product Contract

No behavior change. The public auth forms and their shared redirect logic are
cleaned up so they read as intentional code: deduplicated redirect-guarding
logic, correct indentation, no redundant active-page CTA, and a trimmed `name`.

## Relevant Product Docs

- `docs/product/workspaces-and-access.md` (auth surface — no contract change).

## Acceptance Criteria

- `safeInternalPath` / the `startsWith("/") && !startsWith("//")` guard exists in
  **one** place (e.g. `lib/redirect.ts`); the two server pages and the two
  client forms import it instead of re-implementing it (currently duplicated 4×).
- The mis-indented `CardFooter` blocks in `sign-in-form.tsx:91` and
  `sign-up-form.tsx:105` are fixed (consistent with surrounding JSX).
- The public header (`app/(public)/layout.tsx:25-30`) no longer shows the "Sign
  In" / "Sign Up" buttons that link to the page the user is already on — hide or
  reflect active state on `/sign-in` and `/sign-up`.
- Sign-up trims `name` before submit (`sign-up-form.tsx`) so a whitespace-only
  name cannot satisfy `required`.
- `npm run lint` + `npm run build` green; existing auth behavior unchanged.

## Design Notes

- Commands: none new.
- Queries: none.
- API: none.
- Tables: none.
- Domain rules: none.
- UI surfaces: `app/(public)/layout.tsx`, `sign-in/page.tsx`,
  `sign-up/page.tsx`, `sign-in-form.tsx`, `sign-up-form.tsx`; new tiny util under
  `lib/`.
- The redirect guard already lives (duplicated) in the two pages and two forms;
  this is a pure DRY extraction with byte-identical behavior. Prefer the existing
  signature so the call sites are mechanical.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-072 --unit 1 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | A `lib/redirect.test.ts` for the extracted guard (internal path passes; `//evil`, `https://…`, `undefined` → fallback). Existing auth tests unchanged. |
| Integration | N/A. |
| E2E | Existing auth/invite redirect behavior unchanged (covered by current suite). |
| Platform | N/A. |
| Release | `npm run lint` + `npm run build`. |

## Harness Delta

None expected. If the `safeInternalPath` duplication turns out to recur
elsewhere, record a `harness-cli backlog add` for a repo-wide redirect-utility
rule.

## Evidence

Add commands, reports, or links after validation exists.
