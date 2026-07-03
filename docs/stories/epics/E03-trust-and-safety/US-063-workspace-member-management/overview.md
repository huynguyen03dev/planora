# Overview — US-063 Workspace Member Management

## Current Behavior

- There is **no member list** anywhere in the product. `docs/product/workspaces-and-access.md`
  claims "Members are listed and managed under `/workspace`", but the `/workspace`
  page (`app/(authenticated)/(dashboard)/workspace/page.tsx`) only renders a
  workspace picker (query-param `?workspace=<id>`), an always-visible inline
  invite form, and a **pending-invitations** list. `WorkspaceMember` rows are
  never queried for display.
- The invite form (`components/workspace/invite-member-form.tsx`) uses a raw
  `<select>` (not shadcn `Select`) and offers only `editor`/`viewer` — `admin`
  is omitted even though the role exists in `lib/permissions.ts`.
- There is **no per-workspace navigation shell**. `/workspace/[slug]/dashboard`
  renders only `DashboardShell` (a page header). Per-workspace sub-navigation
  exists only as an expandable item in the global `/boards` sidebar
  (`WorkspaceItem`: Boards + Analytics links).
- No Server Actions exist to **remove a member**, **change a member's role**,
  **leave a workspace**, or **revoke a pending invitation**.
- Analytics/workspace settings (`AnalyticsSettingsForm`: timezone,
  require-estimate) live on the `/workspace` page mixed in with invitations.

## Target Behavior

- A dedicated **workspace shell** at `app/(authenticated)/(dashboard)/workspace/[slug]/layout.tsx`
  renders a left sidebar (**Boards · Analytics · Members · Settings**) and wraps
  the dashboard, members, and settings pages. Modeled on Trello's workspace
  settings surface.
- **`/workspace/[slug]/members`** shows the real member list: avatar · name ·
  email · role, with filter-by-name, an **Invite** button opening a shadcn
  Dialog (email + role incl. `admin`), **pending** rows with a PENDING badge and
  **revoke**, per-row **remove** and **inline role change**, and **Leave** for
  non-owner members.
- **`/workspace/[slug]/settings`** hosts the analytics/workspace settings moved
  off `/workspace`. `/workspace` collapses to a pure workspace chooser.
- All member/invitation **mutations are admin-only**, enforced server-side on the
  existing `member:*` / `invitation:*` access-control statements, with a
  **last-admin guard** (the sole remaining admin cannot be removed, demoted, or
  leave).

## Affected Users

- **admin** — gains full member management (invite/remove/role-change/revoke) and
  a dedicated surface for it.
- **editor / viewer** — can view the member list and **Leave** the workspace; no
  management actions (unchanged authorization posture).

## Affected Product Docs

- `docs/product/workspaces-and-access.md` — *Members & invitations*, *Roles &
  permissions*, *Workspace settings* sections.
- `docs/product/notifications.md` — invitation inbox is unchanged but referenced.
- `docs/TEST_MATRIX.md` — new member-management actions + their proofs.

## Non-Goals

- **Seats / seat cap** (`2/10`) — deferred to the subscription/billing work.
- **Guests** (single-board / multi-board) — no guest model; separate feature.
- **Join requests** — no join-request model; separate feature.
- **"Last active"** — no `lastSeen` field; not derived from sessions here.
- **Per-member board membership** (`Boards (1)`) — workspace members aren't
  linked to boards; out of scope.
- **`@handle` / usernames** — email is the secondary identifier; no username model.
- **Live cross-client sync** of the member list — mutations use `router.refresh()`;
  realtime member presence is out of scope.
- Changing the **invitation acceptance flow** or the public `/invite` landing.
