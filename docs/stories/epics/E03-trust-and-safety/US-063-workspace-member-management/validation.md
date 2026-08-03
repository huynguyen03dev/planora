# Validation — US-063 Workspace Member Management

## Proof Strategy

The authorization boundary and the last-admin guard are the load-bearing
contracts and must be unit-proven before the story is done, in the same style as
`tests/server-actions/` (US-006 sabotage-verified) and the US-007 RBAC matrix.
UI wiring is proven by an end-to-end drive of the invite → accept → re-role →
remove/leave flow (Playmatrix/`verify` skill), since there is still no RTL.

Definition of done:

- Every new action denies (a) unauthenticated callers and (b) non-admin callers
  **before any write**, and (c) rejects cross-workspace targets via isolation
  scoping — asserted with sabotage (a passing test must fail if the guard is
  removed).
- The **last-admin guard** blocks remove/demote/leave of the sole admin and
  allows it when another admin remains.
- The RBAC matrix is extended so `member:update`/`member:delete` /
  `invitation:cancel` cells are proven against the real role objects.
- Unit/integration gate (`npm test`) and build/lint are green; the flow is
  observed working in the running app.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | `assertWorkspaceRetainsAdmin`: sole-admin remove→blocked, sole-admin demote→blocked, sole-admin leave→blocked, remove/demote/leave when ≥2 admins→allowed, editor/viewer removal never blocked. `withWorkspaceAdminLock`: acquires + releases (finally) even when `fn` throws. `userId→memberId` resolver returns null for a cross-workspace target. Zod DTO parsing (strict 32-char org-id regex, role enum, invitationId). |
| Integration | Per action (`removeMemberAction`, `updateMemberRoleAction`, `leaveWorkspaceAction`, `cancelInvitationAction`, extended `inviteMemberAction`): unauthenticated denied pre-call; non-admin (editor/viewer) denied pre-call; cross-workspace target denied via scope. Assert on the **`auth.api.*` mock** (`removeMember`/`updateMemberRole`/`cancelInvitation`/`leaveOrganization`/`createInvitation`) — mirror how the existing invite test mocks `createInvitation`; do **not** assert on `db` writes. Guard-violation returns typed error and the `auth.api` mutation is **never called**. Sabotage-verified. Extend `rbac-matrix.test.ts` for the new `member:update`/`member:delete`/`invitation:cancel` cells. |
| Concurrency | The orphan race: with two admins, simulate concurrent `removeMemberAction`/`updateMemberRoleAction` targeting each other; assert the advisory lock serializes them and the second is rejected by R2 (admin count never reaches 0). This is the reason the guard exists — it must be proven, not just the single-actor case. |
| E2E | Two-account flow: admin invites (Dialog, role incl. admin) → invitee accepts → admin changes role → admin removes a member (AlertDialog confirm; admin-on-admin also confirms) → non-admin member leaves → **on leave, redirected to chooser with a new active org** → sole-admin Leave/Remove/demote blocked with the guard message. Sidebar nav (Members/Settings/Analytics/Boards) routes correctly and active-state doesn't bleed onto members/settings. |
| Platform | N/A (browser only). |
| Performance | Member list query is single, workspace-scoped, `select`-limited; no N+1. |
| Logs/Audit | Actions surface errors via existing Server Action handling; no new audit sink this story (follow-up if a membership audit trail is wanted). |

## Fixtures

- Deterministic workspace with: two admins (A1, A2), one editor (E1), one viewer
  (V1), and one pending invitation (`status: pending`).
- A second workspace with its own admin (X1) to prove cross-workspace isolation
  (X1 cannot mutate the first workspace's members/invitations).
- Reuse existing test scaffolding in `tests/server-actions/` and the RBAC
  fixtures from US-007.

## Commands

```text
npx vitest run tests/server-actions/          # action auth + guard suites
npx vitest run -t "last admin"                # guard unit cases
npx vitest run tests/server-actions/rbac-matrix.test.ts
npm test                                       # full gate
npm run build                                  # type-check
npm run test:e2e -- <member-management spec>   # flow E2E
```

## Acceptance Evidence

Add results after verification (test output, and an observed run of the
invite→accept→re-role→remove/leave flow in the app).
