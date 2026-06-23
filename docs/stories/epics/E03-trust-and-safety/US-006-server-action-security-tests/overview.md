# Overview

US-006 — Server Action security tests: auth + permission gate + workspace
isolation on every mutation. First child sliced from
`docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md`
(Theme A — Trust & Safety, P0). Epic: `E03-trust-and-safety`.

## Current Behavior

Every write goes through a Server Action in `app/**/actions.ts` that follows the
core invariant: `verifySession()` → derive `workspaceId` from the resource →
`hasWorkspacePermission(workspaceId, …)` → Zod parse → Prisma → realtime emit →
`revalidatePath()`. The actions are written correctly, but **none of this
boundary is tested.** `docs/TEST_MATRIX.md` lists Server Actions, auth/RBAC, and
workspace isolation as the largest unproven gap. The only data-layer tests today
(`lib/label.test.ts`, `lib/card-history.test.ts`, etc.) exercise pure helpers
below the action — they never assert that a mutation is *refused* when the caller
lacks a session or permission, or when the resource belongs to another workspace.

For a multi-tenant app this is the highest-severity gap: a regression that
dropped or reordered the permission check (e.g. mutating before the gate, or
deriving `workspaceId` from caller input instead of the loaded resource) would
silently leak or corrupt another tenant's data, and nothing would catch it.

The sharpest untested path is `moveCardAction` — it touches **two** workspaces
(the source card's and the target list's) and must reject the move unless both
resolve to a workspace the caller can edit.

## Target Behavior

An automated suite proves, for every mutating Server Action, that:

1. **Auth gate** — an unauthenticated caller never reaches Prisma (`verifySession`
   redirects / the action returns failure; no `db.*.create/update/delete` runs).
2. **Permission gate** — when `hasWorkspacePermission` denies, the action returns
   its failure shape and performs **zero** writes (mutation is short-circuited
   *before* any Prisma mutation, and before any realtime emit).
3. **Workspace isolation** — the permission check is run against the workspace
   **derived from the loaded resource**, not from caller-supplied input, so a
   caller who is a member of workspace B cannot mutate a board/list/card/comment
   in workspace A. `moveCardAction` is rejected unless *both* the source card and
   the target list resolve to a workspace the caller may edit.

The proof moves the corresponding rows in `docs/TEST_MATRIX.md` from
planned/manual to unit-proven, and is wired into CI by US-008 so the gate has
teeth on every PR.

## Affected Users

- All roles (admin / editor / viewer) — this verifies the boundary that protects
  every tenant's data.
- Operators / the product owner — converts an asserted-by-hand safety claim into
  a standing, regression-proof guarantee.

## Affected Product Docs

- `docs/product/workspaces-and-access.md` — workspace isolation + RBAC boundary.
- `docs/product/boards-and-cards.md` — the mutating actions under test.
- `docs/TEST_MATRIX.md` — every action row this story proves.

## Non-Goals

- The full role-by-role allow/deny matrix (viewer vs editor vs admin per action)
  — that is **US-007**, which layers on the harness this story builds.
- Two-client realtime correctness — **US-009**.
- Changing any authorization behavior. This story *tests* the boundary. If a test
  surfaces a real gap (e.g. `moveCardAction` not checking the target workspace),
  fixing it is a follow-up change that needs its own intake + decision (see
  `execplan.md` stop conditions) — not part of this packet.
- E2E / browser proof. This is action-level (Vitest), no DB or HTTP.
