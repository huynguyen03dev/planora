# 0019 Workspace member management is admin-only with a last-admin guard

Date: 2026-07-02

## Status

Accepted

## Context

US-063 introduces the first real workspace member-management surface (list,
invite, remove, role-change, revoke, leave). This adds mutating operations on
membership and roles — an authorization hard gate per `docs/FEATURE_INTAKE.md`.
Two semantics must be fixed before implementation:

1. **Who may manage members?** Planora's RBAC (`lib/permissions.ts`) already maps
   `admin` → owner-level org statements (`member:[create,update,delete]`,
   `invitation:[create,cancel]`), while `editor`/`viewer` hold none. The question
   is whether to follow that as-is or introduce a new scheme.
2. **How is the workspace protected from being orphaned?** Removing, demoting, or
   letting the last admin leave would leave a workspace with no one able to manage
   it. There is no distinct `owner` role or `Workspace.ownerId` field today.

## Decision

- **Admin-only.** All member/invitation mutations
  (invite, revoke, remove, role-change) are gated server-side on the existing
  `member:*` / `invitation:*` access-control statements — i.e. `admin` only. No
  new permission scheme; the UI mirrors the gate but never replaces it.
- **Mutations go through Better Auth.** All member/invitation writes call
  `auth.api.*` (`removeMember`, `updateMemberRole`, `cancelInvitation`,
  `leaveOrganization`, `createInvitation`) — mirroring the existing
  `inviteMemberAction`. Raw Prisma writes on `WorkspaceMember`/`Invitation` are
  prohibited: BA owns the org lifecycle, runs its own guards/hooks, and maintains
  `session.activeOrganizationId` (a raw leave-delete would leave it dangling).
- **Last-admin invariant.** A workspace must always retain at least one `admin`;
  the sole remaining admin cannot be removed, demoted, or leave. Better Auth
  already enforces this for **self-actions** (leave, self-demote) via
  `creatorRole: "admin"`. The remaining **cross-actor race** (two admins
  removing/demoting each other concurrently → zero admins) is closed by
  serializing admin-affecting mutations per workspace with a **Postgres session
  advisory lock** (`pg_advisory_lock(hashtext(workspaceId))`, released in
  `finally`) around the admin-count check and the `auth.api` call. A Prisma
  transaction cannot be used because BA's write is not in our transaction.
- **"Leave" is self-removal.** Any member may leave themselves (via
  `auth.api.leaveOrganization`) unless the invariant blocks them. On leave, BA
  nulls `session.activeOrganizationId`; the UI redirects to the workspace chooser
  and selects a remaining workspace as active. "Owner" in product language means
  the last remaining admin; no `owner` role/field is added.
- **Admin-on-admin friction.** Any admin may demote/remove a peer admin (no extra
  permission), but a destructive action on another admin requires a UI
  confirmation (`AlertDialog`).

## Alternatives Considered

1. **Allow editors to manage members** — rejected: contradicts the proven RBAC
   matrix (US-007) and widens the privilege surface with no product need.
2. **Add an `owner` role / `Workspace.ownerId`** — rejected for this story: the
   last-admin invariant achieves "cannot orphan" without a schema change; a first-
   class owner concept would be its own decision and migration.
3. **No guard; allow the last admin to leave and orphan/delete the workspace** —
   rejected: defines a data-lifecycle (auto-delete) behavior that is out of scope
   and higher-risk than blocking the action.
4. **Raw Prisma writes for the mutations** (with a Prisma transaction +
   `SELECT … FOR UPDATE` to close the race) — rejected: bypasses Better Auth's
   ownership of membership/invitations, skips its guards/hooks, and desyncs
   `session.activeOrganizationId`. The advisory lock closes the race while keeping
   BA authoritative.
5. **Accept the race + self-heal recovery** (reclaim admin if orphaned) — rejected
   as best practice for an auth surface; the advisory lock removes the window
   deterministically, so no recovery subsystem is needed (only a defensive
   post-mutation assertion).

## Consequences

Positive:

- No migration; reuses the already-tested RBAC and the canonical Server Action
  boundary. Workspaces can never be left unmanageable.
- Clear, single source of truth for the guard (one helper, unit-tested).

Tradeoffs:

- The sole admin must promote someone before leaving — a deliberate friction.
- "Owner" remains implicit (last admin) rather than an explicit, transferable
  role; if the product later needs ownership transfer, that is a new decision.

## Follow-Up

- If a membership **audit trail** is wanted, add it as a follow-up (no new audit
  sink in US-063).
- Revisit an explicit `owner` role when subscription/seat work lands.
