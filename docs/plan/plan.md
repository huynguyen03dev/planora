# Refactor Plan: Split Workspace Management vs Invitations

## Context
The current implementation combines two concerns in `app/(authenticated)/(dashboard)/workspace/page.tsx`:
1. **Workspace member management** (admin/scoped by selected workspace)
2. **Received invitations** (personal/global)

This causes UX confusion for users with no workspace memberships. A user can still have pending invites, but the route semantics (`/workspace`) suggest workspace-scoped settings instead of a personal inbox.

Target outcome:
- `/workspace` is clearly workspace/member management
- `/invitations` is the global route for personal incoming invites
- sign-in/sign-up fallback stays `/boards` (your preference)
- invitations are discovered via in-app navigation (visible link), not URL-only
- invitation delivery for this scope is in-app only (no email integration in this refactor)

## Approach
Refactor navigation and route responsibilities:
1. Keep `/workspace` for workspace-scoped management (invite members, view pending invites for selected workspace if authorized).
2. Introduce `/invitations` as a global personal inbox for received invitations (accept/decline).
3. Reuse existing invitation actions and DAL helpers; avoid duplicating logic.
4. Keep post-auth default destination at `/boards` (your preference), and ensure `/invitations` is easy to discover/reach for users with pending invites.
5. Add discoverability links (header/sidebar) so users can always find invitations.

## Files to modify
- `app/(authenticated)/(dashboard)/workspace/page.tsx`
- `app/(authenticated)/(dashboard)/workspace/actions.ts` (only if action responses need route update)
- `app/(authenticated)/(dashboard)/invitations/page.tsx` (new)
- `components/workspace/received-invitations-list.tsx`
- `components/workspace/invite-member-form.tsx` (if route assumptions exist)
- `components/workspace/workspace-invitations-list.tsx`
- `components/authenticated-header-actions.tsx` (add invitations nav entry)
- `components/boards/boards-sidebar.tsx` (add invitations nav entry)
- `app/(public)/sign-in/page.tsx`
- `app/(public)/sign-up/page.tsx`
- `lib/workspace.ts` (reuse membership query)
- `lib/invitation.ts` (reuse pending invites query)

## Reuse
- Existing server actions:
  - `inviteMemberAction`
  - `acceptInvitationAction`
  - `declineInvitationAction`
  - from `app/(authenticated)/(dashboard)/workspace/actions.ts`
- Existing read helpers in `lib/invitation.ts`:
  - `listReceivedPendingInvitationsByEmail`
  - `listWorkspacePendingInvitations`
- Existing membership helper in `lib/workspace.ts`:
  - `listWorkspaceMembershipsByUserId`
- Existing auth/session gate in `lib/dal.ts`:
  - `verifySession`

## Steps
- [ ] Create `app/(authenticated)/(dashboard)/invitations/page.tsx` using `verifySession` + `listReceivedPendingInvitationsByEmail` and render `ReceivedInvitationsList`.
- [ ] Remove “Received invitations” section from `/workspace` so it focuses on workspace management only.
- [ ] Keep `/workspace` behavior for selected workspace member-invite management and permission-gated pending list.
- [ ] Ensure `ReceivedInvitationsList` redirects to `/boards?workspace=<id>` after accept (already present) and refreshes on decline.
- [ ] Add a persistent navigation entry to `/invitations` in both header and sidebar.
- [ ] Keep sign-in redirect fallback as `/boards`.
- [ ] Keep sign-up success redirect as `/boards` for this refactor.
- [ ] Ensure users with pending invites can easily navigate from `/boards` to `/invitations` via visible header + sidebar links.
- [ ] Add lightweight empty-state copy for `/invitations` when no pending invites.
- [ ] Keep route authorization rules clear: `/invitations` is user-level inbox; `/workspace` is workspace-scoped management.

## Verification
- [ ] Existing member signs in → lands on `/boards` (or requested redirect) and can still open `/invitations` from header/sidebar.
- [ ] New user with no workspace and no invites → lands on chosen empty/onboarding destination.
- [ ] New user with no workspace but pending invite → can access `/invitations` directly and accept.
- [ ] Accepting invite from `/invitations` redirects to `/boards?workspace=<id>` and workspace becomes visible.
- [ ] Declining invite removes it from list without errors.
- [ ] `/workspace` no longer acts as personal inbox; only workspace management UI remains.
- [ ] No regressions in auth guard (`proxy.ts`) and `/boards` route.
