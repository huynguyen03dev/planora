# US-003 Invite link works for not-yet-registered users

## Status

implemented

## Lane

normal

## Product Contract

A person invited by email who has **no Planora account yet** must be able to go
from the invite email to accepting the invitation in one continuous flow:
context → sign up (with the invited email pre-filled) → back to the invitation →
accept → land in the workspace. The invited email is carried through auth so the
"wrong email" orphan case is prevented, and acceptance still requires the
signed-in email to match the invited email.

## Relevant Product Docs

- `docs/product/workspaces-and-access.md` (Members & invitations updated)

## Acceptance Criteria

- Invite email links to a **public** route (`/invite?invitationId=…`) reachable
  without a session (the old `/invitations` target is behind the authenticated
  layout, which bounced logged-out users to a bare `/sign-in` and lost the
  token).
- The landing handles all states: invalid/expired invite; logged-out (context +
  Create-account / Sign-in CTAs carrying `redirect` + pre-filled `email`);
  signed-in with a **different** email (explains the mismatch); signed-in with
  the matching email (inline Accept/Decline).
- Sign-up and sign-in honor a safe internal `redirect` param and pre-fill the
  `email` param; cross-links between them preserve the params.
- After sign-up (auto sign-in), the user returns to `/invite` and can accept;
  acceptance creates the `WorkspaceMember` and routes into the workspace.

## Design Notes

- Commands: reuses `acceptInvitationAction` / `declineInvitationAction` (no new
  mutation); reuses `ReceivedInvitationsList` for the accept UI.
- Queries: `getInvitationSummary` (public read for context).
- API: invite link target changed in `lib/auth.ts` (`/invitations` → `/invite`).
- Auth: no change to the permission model — acceptance already validates email
  match; pre-filling/locking the signup email just aligns the happy path with
  that guard.
- UI surfaces: `app/(public)/invite/page.tsx` (new), `sign-up/page.tsx`,
  `sign-in/page.tsx`.

## Validation

`scripts/bin/harness-cli story update --id US-003 --unit 0 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | n/a (routing/UI; no isolated pure logic added). |
| Integration | n/a |
| E2E | Manual browser walkthrough of every branch (below). |
| Platform | n/a |

## Harness Delta

Found during a review of "what happens if I invite an email not signed up yet"
(independent code trace confirmed the dead-end + orphan gaps). Implemented the
public landing + auth context carry.

## Evidence

- Lint + build clean.
- Manual browser E2E (2026-06-22) against the `analytics-demo` workspace:
  - Signed-in-as-different-email → "Different account" card naming both emails;
    "Switch account" link carries encoded `redirect` + `email`.
  - Logged-out → "You're invited to Analytics Demo" with Create-account / Sign-in
    CTAs carrying `redirect` + `email`.
  - Create account → sign-up **email pre-filled** (`invitee-test@example.com`);
    submit → auto-returned to `/invite` → Accept panel.
  - Accept → redirected to `/boards?workspace=…`; DB confirms invitation
    `status: accepted` and a `workspaceMember` row `role=editor`.

## Follow-ups (not in this story)

- Public-layout header still shows generic Sign In / Sign Up regardless of
  session (cosmetic).
- No in-app notification is created for an invitee who has no account yet
  (`notifyInvited` returns early); could be created on signup if a pending invite
  matches.
