# Exec Plan — US-063 Workspace Member Management

## Goal

Give workspaces a real, Trello-style member-management surface: a dedicated
per-workspace navigation shell plus a members page where admins can invite,
remove, re-role, and revoke, and any non-owner member can leave — all gated on
the existing RBAC, with a last-admin guard so a workspace can never be orphaned.

## Scope

In scope:

- New workspace shell layout `[slug]/layout.tsx` with a left sidebar
  (Boards · Analytics · Members · Settings); dashboard route re-parented under it.
- New route `/workspace/[slug]/members` — member list, filter, invite Dialog,
  pending rows + revoke, remove, inline role change, Leave (non-owner).
- New route `/workspace/[slug]/settings` — analytics/workspace settings moved off
  `/workspace`; `/workspace` reduced to a chooser.
- New Server Actions: `removeMemberAction`, `updateMemberRoleAction`,
  `leaveWorkspaceAction`, `cancelInvitationAction` (+ reuse `inviteMemberAction`,
  extended to allow `admin` role). **All route through `auth.api.*`** (BA owns the
  org lifecycle) — no raw Prisma writes on `WorkspaceMember`/`Invitation`.
- Prerequisite refactor: promote `getWorkspaceIdBySlug` + `getWorkspaceMembers`
  from `dashboard/page.tsx` into `lib/workspace.ts`; add `email`/`role`/`memberId`.
- Upgrade invite UI to shadcn `Dialog` + `Select`; add `admin` to invitable roles.
- Admin-only enforcement + **last-admin invariant**: BA covers self-leave/
  self-demote; this story closes the cross-actor orphan race with a per-workspace
  **Postgres advisory lock** (`withWorkspaceAdminLock`) — shared, unit-tested.
- Product-doc + TEST_MATRIX updates; decision record 0019.

Out of scope:

- Seats/billing, guests, join-requests, last-active, per-member boards,
  usernames, live member-list sync, changes to invitation acceptance / `/invite`.
- Schema/migration changes — this story uses only existing models
  (`WorkspaceMember`, `Invitation`, `User`). If any field turns out to be
  required, that is a stop condition (see below).

## Risk Classification

Risk flags:

- **Authorization** — remove/role-change/revoke/leave gate on `member:*` /
  `invitation:*`; role change alters a member's privileges.
- **Existing behavior** — relocates invite/settings UI and the `/workspace` page's
  responsibilities; touches the workspace nav.
- **Weak proof** — no member-management UI or actions exist today; the new actions
  need first-class tests.
- **Multi-domain** — workspace nav + members + settings + invitations.

Hard gates:

- **Authorization** — new mutating actions on membership and roles.

## Work Phases

1. Discovery — completed (grill-me): decisions locked, RBAC + slug/gating
   patterns and `getWorkspaceMembers` query identified for reuse.
2. Design — `design.md` (this packet) + decision 0019 (admin-only + last-admin
   guard semantics).
3. Validation planning — `validation.md`; extend the RBAC matrix + add
   last-admin-guard unit tests and action sabotage tests.
4. Implementation — actions first (with tests), then shell + pages + dialog.
5. Verification — unit/integration gate green; drive the flow end-to-end
   (invite → accept → re-role → remove/leave) per the `verify` skill.
6. Harness update — product doc, TEST_MATRIX, story/decision rows; PR into `dev`.

## Stop Conditions

Pause for human confirmation if:

- A member/role/leave behavior needs a **schema change** (e.g. a real `owner`
  field, or a `status`/`lastSeen` column) — this story assumes none.
- The advisory-lock approach proves unworkable against the Prisma/pg pool in
  practice (e.g. pool exhaustion), forcing a different concurrency mechanism.
- `auth.api` does not expose an operation the design assumes
  (`removeMember`/`updateMemberRole`/`cancelInvitation`/`leaveOrganization`).
- Any validation requirement would need to be weakened to ship.
- The nav restructure would change board/analytics routing contracts.

*(Resolved by senior review: the concurrent-orphan race is closed by the
per-workspace advisory lock; mutations route through `auth.api`; DTOs key on
`memberId`.)*
