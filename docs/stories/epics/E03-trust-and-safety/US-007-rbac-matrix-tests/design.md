# Design

## Seam choice — why this is not tautological

US-006 mocks `auth.api.hasPermission` and delegates the decision to a faithful
*copy* of the matrix (`roleGrants`), because its goal was to prove the boundary
shape (gate present, called with the resource-derived workspace). US-007's goal
is the opposite: prove the **decision** itself is correct. So US-007 must touch
the real sources and must **not** route through `roleGrants` as the oracle.

The real Better Auth roles (`admin`/`editor`/`viewer` from `lib/permissions.ts`)
are plain objects exposing `.authorize(request) → { success: boolean }`. That is
exactly the function Better Auth invokes server-side once it has resolved a
member's role. Calling it directly — no DB, no session, no HTTP — reproduces the
real per-role decision with zero mocking. This is the oracle for the whole
suite; nothing in US-007 asserts a matrix against another copy of itself.

## Layer 1 — Server matrix (authoritative)

Build the *expected* matrix as data, independent of `permissions.ts`'s structure
(spelled out per cell, not derived from the same literals), then iterate every
role × entity × verb and assert `role.authorize({entity:[verb]}).success`.

Full statement set and verbs (from `ac` statements + `ownerAc`):

| entity       | verbs                      |
| ------------ | -------------------------- |
| organization | update, delete             |
| member       | create, update, delete     |
| invitation   | create, cancel             |
| board        | create, update, delete     |
| list         | create, update, delete     |
| card         | create, update, delete     |
| comment      | create, update, delete     |

Expected allow set:

- **admin** — every cell true.
- **editor** — `board:update`; `list:{create,update,delete}`;
  `card:{create,update,delete}`; `comment:{create,update,delete}`. Everything
  else (incl. `board:create`, `board:delete`, all organization/member/
  invitation) false.
- **viewer** — `comment:{create,update,delete}` only. Everything else false.

Also assert the **AND semantics** that the gate relies on: a multi-verb request
(`board:["update","delete"]`) succeeds only if the role grants *all* of them —
`editor` → false, `admin` → true. Several actions request multiple verbs at
once, so this is load-bearing, not decorative.

## Layer 2 — UI map ↔ server agreement

`getBoardPagePermissionsForRole(role)` returns `BoardPagePermissions`. Map each
field to the server (entity, verb) it must mirror, then assert equality for all
three roles:

| BoardPagePermissions field | server cell    |
| -------------------------- | -------------- |
| canEditBoard               | board:update   |
| canDeleteBoard             | board:delete   |
| canCreateList              | list:create    |
| canEditList                | list:update    |
| canDeleteList              | list:delete    |
| canCreateCard              | card:create    |
| canEditCard                | card:update    |
| canArchiveCard             | card:update    |
| canComment                 | comment:create |

`canArchiveCard` maps to `card:update` (archive is a soft-delete via
`archivedAt`, performed as a card update, consistent with how the archive action
gates in `boards/[boardId]/actions.ts`). Assertion: for each field and each
role, `uiMap[field] === server.authorize({entity:[verb]}).success`.

## Layer 3 — Harness copy ↔ real matrix

For every role × entity × verb, assert
`roleGrants(role, {entity:[verb]}) === role.authorize({entity:[verb]}).success`.
This binds `tests/server-actions/_harness.ts` to the real definitions; if either
drifts, US-007 fails and points at the discrepancy, keeping US-006 honest.

## File layout

One new file, alongside the US-006 suite so they share the harness and run under
the same `tests/**` include:

- `tests/server-actions/rbac-matrix.test.ts`

No mocks needed beyond what the imported modules pull in. `lib/permissions.ts`
imports only Better Auth access primitives (pure, no `server-only`, no DB), so
it loads cleanly in the node test env. `lib/authorization.ts` imports
`server-only` and `@/lib/prisma`; the matrix functions used here
(`getBoardPagePermissionsForRole`) are pure, but to keep the import side-effect
free we reuse the existing `__mocks__/server-only.ts` alias (already configured
in `vitest.config.ts`) and the project's `@` alias.

## Risk / blast radius

Test-only addition. No production code changes. If Layer 2 or 3 reveals a real
drift, that becomes a separate change request (and a decision if it changes
intended behavior) — this story does not silently "fix" the matrix to make a
test pass.
