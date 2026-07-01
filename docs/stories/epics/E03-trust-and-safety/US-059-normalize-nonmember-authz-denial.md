# US-059 Normalize non-member authorization denial

## Status

implemented

## Lane

normal — **authorization is touched**, but the scope is explicitly narrowed to
the *error shape* of an already-denied request; the permission decision itself is
unchanged. Recorded this way per intake (the human narrows the hard gate). A
mandatory regression test proves denial still denies. Surfaced by the deep review
+ senior validation (2026-06-30).

## Product Contract

A request from a user who is not a member of the target workspace (or who lacks
the required permission) receives the same clean, serializable soft-deny
(`{ success: false, ... }`) as a role-denied request — never an unhandled 500.

## Relevant Product Docs

- `docs/product/workspaces-and-access.md` — workspace membership + roles.
- `AGENTS.md` — Server Action contract (return a plain serializable object).

## Acceptance Criteria

- `hasWorkspacePermission` (`lib/authorization.ts:115-128`) catches **only** the
  non-member `UNAUTHORIZED` throw from `auth.api.hasPermission` (Better Auth 1.5.5,
  `organization.mjs:75`) and returns `false` — discriminating on the error
  (`err instanceof APIError && err.status === 401`, the
  `USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION` code) and **re-throwing everything
  else**. Critically, `has-permission.mjs` also throws `INTERNAL_SERVER_ERROR` for
  a misconfigured role/AC — a blanket `catch { return false }` would silently
  convert that genuine 500 into a *deny*, masking a config bug. Do not swallow it.
- The affected call sites are **Server Actions** (~30 in `[boardId]/actions.ts`,
  plus a few in `boards/actions.ts` / `workspace/actions.ts`) that invoke the
  helper *before* their `try` — they now take their existing soft-deny branch
  instead of surfacing a 500. The 2 Server-Component **page** sites are already
  non-member-safe (they read only the user's own memberships / redirect first) and
  are out of scope — the earlier "all ~30 sites return a deny object" overstated
  the blast radius.
- **Regression test (mandatory):** a non-member is still denied every mutation
  (the decision does not change — only its shape), and a valid member/role is
  unaffected.

## Design Notes

- Root cause: `hasWorkspacePermission` delegates to `auth.api.hasPermission`,
  which throws for a non-member rather than returning `{ success: false }`; the
  helper does not catch it, and call sites call it before their `try`.
- Fix is one `try/catch` in the helper (return `false` on the thrown
  `UNAUTHORIZED`). **This does not change who is authorized** — a non-member was
  already denied; only the failure mode (500 → clean deny) changes.
- Keep the role-denied path (`hasPermission` returns `{ success: false }`)
  behaving exactly as today.
- **Existence masking preserved:** on role-deny, actions today return
  `{ success: false, error: "… not found" }` (not a 403); post-fix a non-member
  hits the same branch and gets the same "… not found" message — no new
  existence-leak, just 500 → clean deny.

## Dependencies

- Independent.

## Validation

`scripts/bin/harness-cli story update --id US-059 --unit 1 --integration 0 --e2e 0 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | non-member → helper returns `false` (no throw); member with permission → `true`; member without permission → `false`; a representative action returns `{ success: false }` (not a thrown 500) for a non-member; **a non-`UNAUTHORIZED` throw (e.g. `INTERNAL_SERVER_ERROR`) still propagates** — it is NOT swallowed into a deny. |
| Integration | n/a (helper-level unit + one action envelope test suffices; mock `auth.api`). |
| E2E | n/a. |
| Platform | n/a. |
| Release | Manual: call a board mutation as a non-member → clean deny, no server error. |

## Harness Delta

None.

## Evidence

- **Fix** (`lib/authorization.ts`): wrapped the `auth.api.hasPermission` call in
  `hasWorkspacePermission` with a `try/catch`. Verified the exact discriminator
  against Better Auth 1.5.5 source rather than assuming it:
  `organization.mjs:75` throws `APIError.from("UNAUTHORIZED", ...)`, and
  `better-call`'s `InternalAPIError` constructor sets `this.status` to the
  **string** status key (`"UNAUTHORIZED"`), not the numeric code — the numeric
  `401` lands on `err.statusCode`, not `err.status`. The catch discriminates on
  `err instanceof APIError && err.status === "UNAUTHORIZED"` (imported from the
  `better-auth` package root, which re-exports the same `@better-auth/core/error`
  class the organization plugin throws — confirmed via `instanceof` in tests, not
  just type-checked) and returns `false`; anything else re-throws unchanged.
- **Unit tests** (`lib/authorization.test.ts`, new, 5 tests): role-grants → `true`;
  role-denies → `false`; non-member (`hasPermission` rejects with the exact
  `APIError.from("UNAUTHORIZED", ...)` shape) → `false`, no throw; a non-member
  `INTERNAL_SERVER_ERROR` (`has-permission.mjs`'s misconfigured-role/AC throw) →
  still rejects, proving it is not swallowed into a deny; a non-`APIError` failure
  (e.g. a network error) also still rejects unchanged.
- **Server Action regression test** (`tests/server-actions/board.test.ts`, +1 test):
  extends the existing US-006 security-boundary suite for `updateBoardAction`.
  Makes the mocked `auth.api.hasPermission` reject with the same `UNAUTHORIZED`
  shape for one call (`mockRejectedValueOnce`) to simulate a genuine non-member,
  and asserts the action still returns the existing clean
  `{ success: false, error: "Board not found" }` deny with no writes — proving
  the fix at the Server Action boundary, not just inside the helper. Confirmed
  the pre-existing A2/A3 tests in this suite exercise *role*-denial (mocked
  `hasPermission` resolving `{ success: false }`), not the real non-member throw
  path — so this new test was a genuine gap, not a duplicate.
  Existence-masking is preserved: same error message as the role-deny branch.
- **Results:** `npm test` → 529/529 pass (24 files; count differs from other
  stories' evidence because this branch is cut from `dev` before US-058's PR is
  merged in). `npm run lint` → 100 problems, unchanged from baseline (confirmed
  clean on the touched files directly: `npx eslint lib/authorization.ts
  lib/authorization.test.ts tests/server-actions/board.test.ts` → no output).
  `npx tsc --noEmit` → only the pre-existing, unrelated
  `scripts/perf-measure.ts:36` error (untracked WIP script; same failure
  confirmed present on `dev` before this branch).
