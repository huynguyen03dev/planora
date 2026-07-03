# Design — US-063 Workspace Member Management

> Revised after senior review. Mutations route through Better Auth's `auth.api.*`
> (BA owns the org lifecycle); the last-admin invariant is closed with a Postgres
> advisory lock; DTOs key on `memberId`.

## Domain Model

Uses existing models only (no migration):

- `WorkspaceMember { id, organizationId (→ Workspace.id), userId (→ User.id),
  role: "admin"|"editor"|"viewer", createdAt }`, with `@@unique([organizationId,
  userId])`.
- `Invitation { id, organizationId, email, role, status: "pending"|"canceled"|…,
  expiresAt, inviterId, createdAt }` — no unique on `(organizationId, email)`;
  re-invite is gated by the app-level pending+unexpired check.
- `User { id, name, email, image }` — `email` is the row's secondary identifier
  (no username/handle exists).

**Business rules:**

- **R1 (admin-only mutation):** invite, revoke, remove, and role-change require
  the caller to hold the relevant `member:*` / `invitation:*` permission — i.e.
  `admin`. Enforced server-side; the UI mirrors it but never substitutes for it.
- **R2 (last-admin invariant):** a workspace must always retain ≥1 `admin`. The
  sole remaining admin cannot be removed, demoted, or leave. Better Auth already
  enforces this for **self-actions** (leave, self-demote) because `creatorRole`
  is `"admin"` (`lib/auth.ts:54`). This story additionally closes the
  **cross-actor race** (A removes/demotes B while B removes/demotes A) — see
  *Concurrency* below.
- **R3 (leave):** any member may leave **themselves** via
  `auth.api.leaveOrganization` unless R2 blocks them (sole admin). "Owner" in
  product language = the last remaining admin. On success BA nulls
  `session.activeOrganizationId`; the UI redirects to the workspace chooser and
  selects a remaining workspace as active (or the chooser if none).
- **R4 (self vs other):** an admin removing *themselves* is a leave (R3);
  removing/demoting *another* is `member:delete` / `member:update` under R1.
  A destructive action on **another admin** requires an `AlertDialog`
  confirmation (UI-level; no extra permission — admins are trusted).

There is **no distinct `owner` role** — app roles are admin/editor/viewer and
`admin` inherits owner-level org statements. "Owner who can't leave" = last admin.

## Application Flow

New Server Actions in `app/(authenticated)/(dashboard)/workspace/actions.ts` (or a
co-located `members/actions.ts`). Each follows the canonical contract —
`verifySession()` → permission check (`hasWorkspacePermission`) → resolve the
target within workspace scope (isolation) → Zod parse → **`auth.api.*` mutation**
(inside the advisory-lock section for admin-affecting ops) → `revalidatePath()` →
serializable return — **mirroring the existing `inviteMemberAction`, which already
calls `auth.api.createInvitation` (`workspace/actions.ts:102`).** No raw Prisma
writes on `WorkspaceMember`/`Invitation` (raw deletes would desync BA state — e.g.
leave a dangling `session.activeOrganizationId`).

| Action | Guard | BA call | Advisory lock? |
| --- | --- | --- | --- |
| `inviteMemberAction` (existing, extended) | `invitation:["create"]` | `auth.api.createInvitation` — now accepts `admin` role | no |
| `cancelInvitationAction` (new) | `invitation:["cancel"]` | `auth.api.cancelInvitation` (→ status `canceled`, drops from pending list) | no |
| `removeMemberAction` (new) | `member:["delete"]` + **R2** | `auth.api.removeMember` | **yes** |
| `updateMemberRoleAction` (new) | `member:["update"]` + **R2** | `auth.api.updateMemberRole` | **yes** |
| `leaveWorkspaceAction` (new) | membership + **R2/R3** | `auth.api.leaveOrganization` | **yes** |

**memberId resolution:** BA's `removeMember`/`updateMemberRole` take the
`WorkspaceMember.id` (member id), **not** `User.id`. Each action first resolves
`{ workspaceId, userId } → memberId` via a workspace-scoped query — which doubles
as the workspace-isolation check (no matching member row ⇒ denial before any
write).

## Concurrency — closing the last-admin race

The R2 invariant is a read-then-write (count admins, then mutate). Because the
write happens inside `auth.api.*` (its own transaction), we cannot wrap it in a
Prisma transaction. Instead, admin-affecting mutations (`removeMember`,
`updateMemberRole`, `leaveWorkspaceAction`) serialize per workspace with a
**Postgres session advisory lock**:

```
db.$transaction(async (tx) => {
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(workspaceId))`  -- held on tx conn
  adminCount = tx.workspaceMember.count({ organizationId, role: "admin" })
  assertRetainsAdmin(adminCount, willRemoveAdmin)   -- throw typed error, no BA call
  await auth.api.<mutation>(...)                     -- awaited *inside* the tx
})  -- commit releases the lock; the next caller reads the updated count
```

**Implementation note (verified against Postgres):** the lock is a
**transaction-scoped** `pg_advisory_xact_lock`, not a session-level
`pg_advisory_lock`. With Prisma's connection pool, a session lock's paired
`pg_advisory_unlock` could land on a *different* pooled connection and silently
fail to release; a transaction-scoped lock is held on the transaction's own
connection for the whole callback and auto-releases on commit/rollback. The
Better Auth mutation is awaited *inside* the callback (on its own pooled
connection) so its write commits before the lock releases — the next caller then
reads the updated admin count and R2 rejects it. `hashtext(text)` returns int4,
implicitly cast to the `bigint` lock key. This makes "≥1 admin remains" hold
deterministically across concurrent callers. Member management is low-frequency,
so briefly holding the connection across the BA write is acceptable; a 20s
transaction timeout bounds the worst case. BA also enforces the single-actor
last-admin guard on `removeMember`/self-`updateMemberRole`/`leaveOrganization`,
so this closes the residual **cross-actor** race.

Shared helpers `withWorkspaceAdminLock(workspaceId, fn)` (acquire + count under
lock, release on commit) and the pure `assertRetainsAdmin(adminCount,
willRemoveAdmin)` — both unit-tested (`lib/workspace-members.test.ts`).

## Interface Contract

- **Routes**
  - `app/(authenticated)/(dashboard)/workspace/[slug]/layout.tsx` — server layout:
    resolve `slug`→id, gate `isWorkspaceMember` (mirrors `dashboard/page.tsx:132-139`),
    render the sidebar + `{children}`. `notFound()` on miss.
  - `.../[slug]/members/page.tsx` — server: members + pending invites +
    `hasWorkspacePermission(..., { member:["update"] })` to decide admin affordances.
  - `.../[slug]/settings/page.tsx` — server: hosts `AnalyticsSettingsForm`.
  - `/workspace` — reduced to a workspace chooser (links into `[slug]`).
- **Shared reads (prerequisite refactor):** promote the page-local
  `getWorkspaceIdBySlug` and `getWorkspaceMembers` out of `dashboard/page.tsx`
  into `lib/workspace.ts`, and extend `getWorkspaceMembers` to select
  `{ userId, name, email, image, role, memberId }`.
- **Action DTOs** (Zod, at the boundary): `workspaceId: string` — the strict
  **32-char org-id regex** `/^[A-Za-z0-9]{32}$/` from `lib/schemas/invitation.ts:5`
  (org ids are Better-Auth nanoids, NOT UUIDs — do **not** use `.uuid()`, and
  match the invitation contract rather than the looser `.min(1).max(255)`);
  `targetUserId: string` (bounded, resolved to `memberId` server-side); `role:
  enum(admin,editor,viewer)`; `invitationId: string`.
- **Return:** `{ success: true }` | `{ success: false, error: string }` (mirrors
  `inviteMemberAction`). R2 violation → specific message ("A workspace must keep
  at least one admin"), no write.
- **Errors:** unauthenticated → denial before any read; non-admin → denial before
  any write; cross-workspace target → no member row in scope → denial; R2 → typed
  error, no BA call.

## Data Model

No new tables, columns, indexes, or migrations. Existing FKs + `@@unique(
[organizationId, userId])` suffice; queries stay workspace-scoped. Revoke is a BA
status transition to `canceled` (not a row delete). The advisory lock uses
Postgres' built-in `pg_advisory_lock`/`pg_advisory_unlock` — no schema object.

## UI / Platform Impact

- **New workspace sidebar** (DESIGN.md tokens: `bg-sidebar`, `hover:bg-sidebar-
  accent`, Hugeicons). Nav: Boards (→ `/boards?workspace=`), Analytics (→
  `[slug]/dashboard`), Members (→ `[slug]/members`), Settings (→ `[slug]/settings`),
  active-by-pathname. **Reconcile chrome:** the dashboard page already renders
  `DashboardShell` (its own header) — the new layout owns the sidebar/frame while
  `DashboardShell` stays page content; avoid a doubled header.
- **Fix global nav bleed:** `WorkspaceItem` computes `isAnalyticsActive =
  pathname.startsWith('/workspace/{slug}')` (`workspace-item.tsx:24`) — this would
  light "Analytics" on `/members` and `/settings`. Tighten to match the dashboard
  path only.
- **Members page:** filter input; rows (avatar, name, email, role `Badge`/inline
  `Select`); PENDING `Badge`; row actions. Destructive actions (remove, revoke,
  leave; and any destructive action on another admin per R4) use `AlertDialog`.
  Invite via `Dialog` + `Select`. Admin-only affordances hidden for non-admins
  (server decides; UI reflects). Missing primitives via `npx shadcn add`.
- Browser only; no mobile/desktop shell changes.

## Observability

Reuse existing Server Action error handling; the `auth.api` layer runs BA's own
hooks. No new audit sink this story (flagged as a follow-up if a membership audit
trail is wanted). No new metrics.

## Alternatives Considered

1. **Raw Prisma writes on `WorkspaceMember`/`Invitation`** — rejected (senior
   review BLOCKER): BA owns the lifecycle; raw writes skip BA guards/hooks and
   desync `session.activeOrganizationId`. Route through `auth.api.*`.
2. **Close the race with a Prisma transaction + `SELECT … FOR UPDATE`** —
   incompatible with routing through `auth.api` (BA's write isn't in our tx).
   Advisory lock chosen instead.
3. **Accept the race + self-heal recovery** (reclaim admin if orphaned) — rejected
   as best-practice for an auth surface; the advisory lock removes the window
   deterministically.
4. **Modal overlay / keep everything on `/workspace` / extend `WorkspaceItem`** —
   rejected in grill-me in favor of routes + a dedicated `[slug]` shell.
5. **Add an `owner` role / `Workspace.ownerId`** — rejected: last-admin invariant
   achieves "cannot orphan" without a migration; explicit ownership is a future
   decision.
6. **DTO on `targetUserId` passed to BA** — rejected: BA APIs take `memberId`;
   resolve `userId → memberId` server-side (doubles as isolation check).
