# Workspaces & Access

Workspaces are the tenancy and collaboration boundary. Authentication and
role-based access control are built on **Better Auth** with its organization
plugin, remapped to Planora's domain.

## Authentication

- **Better Auth** (`lib/auth.ts`), email + password enabled, Prisma adapter
  (`prismaAdapter(db, { provider: "postgresql" })`), sessions via Next cookies.
- All auth requests flow through the catch-all `app/api/auth/[...all]/route.ts`.
- Client hooks come from `lib/auth-client.ts` (`useSession`, `signIn`, `signUp`,
  `signOut`, `organization`, `useActiveOrganization`, …).
- Server code resolves identity with `verifySession()` (`lib/dal.ts`) — the
  first step of every Server Action. Never trust client-supplied identity.

## Workspace = Organization

The organization plugin is remapped: `organization` → **`Workspace`**,
`member` → **`WorkspaceMember`**. A workspace has a unique `slug`, a `timezone`
(used by analytics), a `logo`, and policy flags (`requireEstimateBeforeDone`,
`analyticsLaunchAt`). Creating a workspace is `createWorkspaceAction`.

## Roles & permissions

Three roles (`WorkspaceMember.role`, default `viewer`), defined as access-control
statements in `lib/permissions.ts` and enforced via
`hasWorkspacePermission(...)` in `lib/authorization.ts`:

| Role | Can | Cannot |
| --- | --- | --- |
| `admin` | Everything: board/list/card/comment CRUD, member & org management | — |
| `editor` | Update boards; full list/card/comment CRUD | Create or delete boards, manage members |
| `viewer` | Read everything, create comments | Mutate board structure or cards |

Authorization is checked **server-side before every mutation**. Workspace
isolation (`where: { workspaceId }`) is applied on every query; a missing scope
is a data-leak bug and must be treated as high-risk.

**Proof (US-006):** the security boundary — `verifySession()` → permission check
against the *resource-derived* workspace → write — is unit-proven for every
mutating Server Action (and analytics read isolation) in
`tests/server-actions/`. Each action asserts: an unauthenticated caller and a
permission-denied caller never reach a write, and a member of another workspace
cannot mutate this one's data (`moveCardAction` cross-workspace relocation is
rejected by the same-board invariant before any write).

**Proof (US-007):** the full role × action allow/deny matrix above is
unit-proven against the **real** `admin`/`editor`/`viewer` role objects in
`tests/server-actions/rbac-matrix.test.ts` (every entity × verb cell, plus the
multi-verb AND semantics the gate relies on). The same suite proves the
board-page UI permission map (`getBoardPagePermissionsForRole`) never over- or
under-grants relative to the server matrix, and that the US-006 harness's matrix
copy stays faithful to the real roles. (Surfaced during US-007: `editor` cannot
*create* boards — `board:["update"]` only — and this table was corrected to
match.)

## Members & invitations

- **Workspace shell (US-063):** `/workspace/[slug]` renders a left sidebar
  (Boards · Analytics · Members · Settings) that wraps the analytics, members,
  and settings pages. `/workspace` (no slug) is a pure workspace **chooser**.
- **Member list:** `/workspace/[slug]/members` shows every `WorkspaceMember`
  (avatar · name · email · role) with a name/email filter. All members can view
  the list; management affordances are admin-only (gated server-side on
  `member:["update"]`).
- **Admin management (US-063):** admins can invite (shadcn `Dialog`, any role
  incl. `admin`), change a member's role inline (`updateMemberRoleAction`),
  remove a member (`removeMemberAction`), revoke a pending invitation
  (`cancelInvitationAction`), and any member can leave (`leaveWorkspaceAction`).
  All four route through Better Auth's `auth.api.*` (BA owns the org lifecycle);
  destructive actions confirm via `AlertDialog`.
- **Last-admin invariant (decision 0019):** a workspace always keeps ≥1 admin —
  the sole admin cannot be removed, demoted, or leave. BA enforces the
  single-actor case; the cross-actor race is closed by a per-workspace Postgres
  transaction-scoped advisory lock (`lib/workspace-members.ts`). Leaving nulls
  the active org, so the app reselects a remaining workspace and redirects to the
  chooser.
- **Invite by email:** `inviteMemberAction` creates an `Invitation` (role +
  expiry, `status` pending) and sends a React Email template
  (`emails/invite-email.tsx`) via Resend.
- The invite email links to the **public** `/invite?invitationId=…` landing
  (`app/(public)/invite/page.tsx`), which works for recipients who have no
  account yet: it shows workspace/inviter context and routes through
  sign-up/sign-in carrying a return URL + the invited email (pre-filled), so the
  invitee returns to the invitation and accepts in one flow. Acceptance still
  requires the signed-in email to match the invited email.
- Signed-in users see pending offers in the **notification bell's unified
  inbox** as Accept / Decline cards, surfaced live from the `invitation` table
  on every page (see `docs/product/notifications.md` → *Unified inbox*). The
  `/invitations` page is retained as the accept landing and full-list view but
  is no longer a standalone nav entry. Accepting makes the user a
  `WorkspaceMember`.

## Workspace settings (admin)

Hosted at `/workspace/[slug]/settings` (US-063), admin-only; a non-admin sees a
read-only notice.

- `updateWorkspaceTimezoneAction` — sets the timezone for analytics date math.
- `updateWorkspaceRequireEstimateAction` — toggles the
  "require estimate before done" policy.
- `updateWorkspaceAnalyticsLaunchAction` — sets `analyticsLaunchAt`, the
  post-backfill confidence boundary for analytics (admin-only).

## Data ownership & cascades

Deleting a workspace cascades to its members, invitations, boards (and all
nested lists/cards/labels/etc.), activity, and card-history events. Any change
to roles, permissions, invitation flow, or tenancy scoping is **high-risk** —
record a decision and prefer the high-risk story template.
