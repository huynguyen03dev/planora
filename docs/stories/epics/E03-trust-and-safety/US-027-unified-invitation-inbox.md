# US-027 Unify workspace invitations into the notification bell

## Status

in-progress

## Lane

normal

## Product Contract

Pending workspace invitations must surface in the single global "needs
attention" surface — the notification bell — instead of a separate, badge-less,
boards-only sidebar entry. An invitation is a standing decision (Accept /
Decline), so it must signal everywhere a user is, with the highest priority in
the inbox, and resolve inline without a page navigation.

This removes the prior split-inbox design where an invited account-holder saw
the same invite in up to three places (a boards-sidebar link, a top-bar link
next to the bell, and an `INVITE` notification row) with the weakest signal on
the one item that actually demanded action.

## Relevant Product Docs

- `docs/product/notifications.md` (→ *Unified inbox*)
- `docs/product/workspaces-and-access.md` (→ *Members & invitations*)

## Acceptance Criteria

- The notification bell badge counts unread notifications **plus** pending
  invitations, so a pending invitation is visible on every authenticated page.
- Opening the bell shows pending invitations as action cards pinned above
  activity notifications (soonest-to-expire first), each with inline Accept and
  Decline.
- Accept joins the workspace and navigates to `/boards?workspace=…`; Decline
  removes the card and decrements the badge. Both reuse the existing
  email-match-guarded Server Actions (no new authorization path).
- A workspace invitation no longer creates an `INVITE` `Notification` row, and
  the notification feed/unread-count exclude any legacy `INVITE` rows, so an
  invite is never double-listed or double-counted.
- The standalone "Invitations" entries (boards sidebar and top bar) are removed;
  `/invitations` remains reachable as the accept landing / full-list view.

## Design Notes

- Commands: reuses `acceptInvitationAction` / `declineInvitationAction`
  (`lib/invitation-actions.ts`) — Better Auth `acceptInvitation` /
  `rejectInvitation`, unchanged.
- Queries: `listReceivedPendingInvitationsByEmail` (existing);
  `getUnreadNotificationCount` / `getNotificationsForUser` now exclude
  `type = INVITE`.
- API: new `GET /api/invitations/pending` (session-scoped, serialized).
- Tables: none changed. `notifyInvited()` retained as a no-op.
- Domain rules: badge = unread notifications + pending invitations
  (`computeInboxBadgeCount`); invitations pinned above notifications
  (`buildInboxItems`). Both pure + unit-tested in `lib/notifications/inbox.ts`.
- UI surfaces: `notification-dropdown.tsx` (invitation cards),
  `notification-bell.tsx` (now presentational), `authenticated-header-actions.tsx`
  (owns counts + socket; top-bar Invitations link removed),
  `boards-sidebar.tsx` (Invitations link removed), `app/(authenticated)/layout.tsx`
  (seeds initial invitation count).

## Validation

`scripts/bin/harness-cli story update --id US-027 --unit 1 --integration 0 --e2e 0 --platform 0`
(run from the main checkout where harness-cli is installed).

| Layer | Expected proof |
| --- | --- |
| Unit | `lib/notifications/inbox.test.ts` — ordering (invitations pinned, soonest-expiry; notifications by recency), kind tagging, empty list, and badge-count sum/clamp. ✅ 8 tests pass. |
| Integration | Server Actions for accept/decline are pre-existing and unchanged; no new integration test added (no Server-Action harness for the new route yet). |
| E2E | Not automated (no Playwright in repo). Manual: invite an existing user → bell badge increments → open bell → Accept/Decline card resolves inline. |
| Platform | n/a |
| Release | Bundled in the `dev` integration line via PR. |

## Harness Delta

None. `harness-cli` is not present in fresh worktree checkouts (third-party,
untracked), so the durable proof row should be added from the main checkout.

## Evidence

- `npx vitest run` → 514/514 pass (incl. 8 new in `lib/notifications/inbox.test.ts`).
- `npx tsc --noEmit` → clean (full project).
- `npm run lint` → 0 errors (only pre-existing `<img>` warnings).
- Full Next/Turbopack build not run in-worktree: Turbopack refuses when `next`
  resolves from the parent repo's `node_modules` (worktree has an incomplete
  `node_modules`). Type-check covers the same surface; build runs normally in
  the main checkout / CI.
