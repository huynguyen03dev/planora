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
| `editor` | Create/update boards; full list/card/comment CRUD | Delete boards, manage members |
| `viewer` | Read everything, create comments | Mutate board structure or cards |

Authorization is checked **server-side before every mutation**. Workspace
isolation (`where: { workspaceId }`) is applied on every query; a missing scope
is a data-leak bug and must be treated as high-risk.

## Members & invitations

- Members are listed and managed under `/workspace`.
- **Invite by email:** `inviteMemberAction` creates an `Invitation` (role +
  expiry, `status` pending) and sends a React Email template
  (`emails/invite-email.tsx`) via Resend.
- The invite email links to the **public** `/invite?invitationId=…` landing
  (`app/(public)/invite/page.tsx`), which works for recipients who have no
  account yet: it shows workspace/inviter context and routes through
  sign-up/sign-in carrying a return URL + the invited email (pre-filled), so the
  invitee returns to the invitation and accepts in one flow. Acceptance still
  requires the signed-in email to match the invited email.
- Signed-in members also see pending offers at `/invitations`. Accepting makes
  the user a `WorkspaceMember`.

## Workspace settings (admin)

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
