# US-008 CI pipeline — lint + typecheck + test gate on PRs

## Status

implemented

## Lane

normal

## Product Contract

Every pull request into `dev` or `main` (and every push that lands there) must
pass lint, TypeScript typecheck, and the full Vitest suite before it can be
considered green. Nothing gates merges today — `.github/workflows/` did not
exist — so the US-006 security and US-007 RBAC suites only ran when someone
remembered to. This story makes the suite run automatically on every change, so
a regression that breaks lint, types, or tests is visible on the PR.

## Relevant Product Docs

- `docs/product/workspaces-and-access.md` — the RBAC/security behavior the suite
  protects (US-006, US-007).
- `docs/TEST_MATRIX.md` — the contract-to-proof map this gate now enforces.

## Acceptance Criteria

- A GitHub Actions workflow runs on `pull_request` and `push` targeting `dev`
  and `main`.
- The workflow runs, in order: `npm run lint`, `npx tsc --noEmit`, `npm test`.
- It generates the Prisma client first (gitignored output) so typecheck and
  tests resolve `@/app/generated/prisma`.
- It needs no live database (dummy `DATABASE_URL`; DB-touching tests mock
  Prisma).
- A newer push to the same ref cancels the in-flight run (concurrency).

## Design Notes

- Commands: `.github/workflows/ci.yml`, single `verify` job.
- Queries: none.
- API: none.
- Tables: none.
- Domain rules: lint + typecheck + test must all pass; fail-fast per step.
- UI surfaces: none (CI only).
- Node 22; `actions/setup-node` npm cache keyed on `package-lock.json`.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Existing 362-test suite runs in CI |
| Integration | Same suite (Server Action security + RBAC) runs in CI |
| E2E | n/a (no E2E configured yet) |
| Platform | Workflow runs on `ubuntu-latest`, Node 22 |
| Release | Gate applies to the `dev → main` promotion PR too |

## Harness Delta

None. The gate enforces the existing `docs/TEST_MATRIX.md` proofs; it does not
change harness instructions. A future story may add branch-protection
*required status checks* so the gate is blocking, not just advisory.

## Evidence

- `.github/workflows/ci.yml`.
- Local dry-run of the exact CI steps with a dummy `DATABASE_URL`: `prisma
  generate` OK, `tsc --noEmit` clean, `npm run lint` clean, `npm test` →
  362 passed (13 files).
- First live run linked from PR into `dev`.
