# Overview

US-007 — RBAC matrix tests: viewer/editor/admin allowed/denied per action.
Second child sliced from
`docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md`
(Theme A — Trust & Safety, P0). Epic: `E03-trust-and-safety`. Pairs with
[US-006](../US-006-server-action-security-tests/overview.md).

## Current Behavior

The role matrix lives in **two** places that must agree but are not tied
together by any test:

1. **`lib/permissions.ts`** — the authoritative server gate. `admin`/`editor`/
   `viewer` are Better Auth access-control roles built with `ac.newRole(...)`.
   When a Server Action calls `hasWorkspacePermission(...)` →
   `auth.api.hasPermission(...)`, Better Auth looks up the caller's role for the
   workspace and asks that role object `role.authorize(request)`. This is the
   real decision that allows or denies every mutation.
2. **`lib/authorization.ts` → `rolePermissionMap`** (returned by
   `getBoardPagePermissionsForRole`) — a hand-maintained boolean map the board
   **UI** consults to decide which buttons/affordances to show.

US-006 proved the *boundary* (auth → permission gate → workspace isolation) is
present and called with the right workspace on every mutating action. But US-006
delegates the permission **decision** to a hand-copied matrix (`roleGrants` in
`tests/server-actions/_harness.ts`) so the real resource→workspace derivation
runs. Nothing yet proves that:

- the **real** role definitions in `lib/permissions.ts` grant/deny exactly the
  intended verb on every entity, for every role;
- the **UI** map (`rolePermissionMap`) agrees with that server matrix — an
  over-grant means a user clicks a button the server then rejects; an
  under-grant means a permitted feature is unreachable;
- the **US-006 test copy** (`roleGrants`) still matches the real matrix — if it
  drifts, US-006 stays green while testing a fiction.

A regression that loosened `editor` to `board:["create","update","delete"]`, or
that left `rolePermissionMap.viewer.canComment` true while the real `viewer`
role lost `comment:create`, would pass every test today.

## Target Behavior

An automated suite proves the full role × action matrix against the **real**
sources, in three layers:

1. **Server matrix (authoritative).** For every role in {admin, editor, viewer}
   and every (entity, verb) cell in the complete statement set
   {organization, member, invitation, board, list, card, comment}, assert
   `role.authorize({entity:[verb]}).success` equals the intended allow/deny.
   This exercises the real Better Auth role objects — not a copy.
2. **UI ↔ server agreement.** Each `BoardPagePermissions` field maps to its
   server (entity, verb); assert the `rolePermissionMap` value equals the server
   decision for all three roles. Catches the two-sources-of-truth drift.
3. **Harness copy ↔ real matrix.** Assert `roleGrants(role, {entity:[verb]})`
   (the US-006 copy) equals `role.authorize(...).success` across the full
   matrix, so US-006's green is trustworthy.

## Out of Scope

- Changing any role definition or the UI map — this story only *proves* the
  current intended matrix; any mismatch it surfaces is a finding, fixed under
  its own change request.
- Board-level membership / public boards (US-022). The matrix here is
  workspace-role scoped.
- `board:create` is gated from the dashboard, not the board page, so it is
  absent from `BoardPagePermissions`; its server cell is covered by Layer 1 and
  its action boundary by US-006 `board.test.ts`.
