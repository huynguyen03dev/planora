# Validation

## Proof Strategy

The story is `implemented` when every mutating Server Action in the coverage
table below has all three assertions (A1 auth, A2 permission, A3 isolation) plus
a positive-control allow case, all green under `npm test`, and a deliberate
sabotage (move a permission check after its write, or derive `workspaceId` from
input) turns the suite red. No production action code changes.

## Coverage Matrix (mutating actions)

Every row needs A1 / A2 / A3 + allow. `verb` = the `hasWorkspacePermission`
request the action makes.

| Action | File | verb | Notes |
| --- | --- | --- | --- |
| `createWorkspaceAction` | boards/actions.ts | (session only) | No workspace yet — A1 only; no A3. |
| `createBoardAction` | boards/actions.ts | `board:create` | `workspaceId` from input — A3 = non-member of that WS denied. |
| `updateBoardAction` | boards/actions.ts | `board:update` | WS from loaded board. **Worked-example first.** |
| `deleteBoardAction` | boards/actions.ts | `board:delete` | WS from loaded board. |
| `createListAction` | boards/[boardId]/actions.ts | `list:create` | WS from loaded board. |
| `updateListAction` | boards/[boardId]/actions.ts | `list:update` | WS from `getListWithBoard`. |
| `updateListIsDoneAction` | boards/[boardId]/actions.ts | `list:update` | WS from `getListWithBoard`. |
| `deleteListAction` | boards/[boardId]/actions.ts | `list:delete` | WS from `getListWithBoard`. |
| `createCardAction` | boards/[boardId]/actions.ts | `card:create` | WS from `getListWithBoard`. |
| `archiveCardAction` | boards/[boardId]/actions.ts | `card:update` | WS from `getCardWithListAndBoard`. |
| `reorderListAction` | boards/[boardId]/actions.ts | `list:update` | WS from `getListWithBoard`. |
| `reorderCardAction` | boards/[boardId]/actions.ts | `card:update` | WS from `getCardWithListAndBoard`. |
| `updateCardEstimateAction` | boards/[boardId]/actions.ts | `card:update` | WS from `getCardWithListAndMembers`. |
| `updateCardDueDateAction` | boards/[boardId]/actions.ts | `card:update` | WS from `getCardWithListAndMembers`. |
| `moveCardAction` | boards/[boardId]/actions.ts | `card:update` | **Two-workspace — extra cases (see design.md).** |
| `updateCardDetailsAction` | boards/[boardId]/actions.ts | `card:update` | WS from `getCardWithListAndBoard`. |
| `createCommentAction` | boards/[boardId]/actions.ts | `comment:create` | Viewer is allowed here (positive control matters). |
| assign card member | boards/[boardId]/actions.ts (~1226) | `card:update` | Confirm exact export name when implementing. |
| unassign card member | boards/[boardId]/actions.ts (~1435) | `card:update` | Confirm exact export name. |
| label attach/detach/CRUD | boards/[boardId]/actions.ts (~1536/1755/1801) | `card`/`board:update` | US-005 actions; confirm verbs when implementing. |
| `inviteMemberAction` | workspace/actions.ts | `member:create` | WS from input — A3 = non-member denied. |
| `updateWorkspaceTimezoneAction` | workspace/actions.ts | `organization:update` | WS from input. |
| `updateWorkspaceRequireEstimateAction` | workspace/actions.ts | `organization:update` | WS from input. |
| `updateWorkspaceAnalyticsLaunchAction` | workspace/actions.ts | `organization:update` | WS from input. |
| `getWorkspaceAnalyticsAction` | workspace/[slug]/dashboard/actions.ts | (read) | Read-isolation: non-member cannot read another WS's analytics. |
| `exportWorkspaceAnalyticsAction` | workspace/[slug]/dashboard/actions.ts | (read) | Read-isolation. |

The two read actions get an isolation-only case (A3): a non-member must not read
another workspace's analytics. Resolve the `~line` exports to real names during
implementation and tick them off here — the list is the completeness contract.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | The harness + per-action A1/A2/A3 + allow, per the coverage matrix. Plus the `moveCardAction` two-workspace cases. Sabotage check: reorder a gate after its write → suite goes red. |
| Integration | n/a for this story — DB is mocked (real-DB harness is a deferred, separate intake). |
| E2E | n/a (US-009 owns browser/realtime proof). |
| Platform | n/a (node/Vitest). |
| Performance | n/a. |
| Logs/Audit | The suite is the audit artifact; record the proof row in `TEST_MATRIX.md`. |

## Fixtures

- Identities: `userA` (member of WS-A), `userB` (member of WS-B), `anon` (no
  session).
- Membership map: `{ userA: { 'ws-a': 'editor' }, userB: { 'ws-b': 'editor' } }`
  — drives the fake `auth.api.hasPermission` seam. Add an `admin`/`viewer` entry
  only as needed for a positive control; full role matrix is US-007.
- Resource fixtures: board/list/card stubs whose `board.workspaceId` is `ws-a`,
  used to feed the loaders. A second card+list pair in `ws-b` for the
  `moveCardAction` cross-workspace case.
- `db` is a spy object (no resolved data needed on denied paths, since no write
  should be reached).

## Commands

```text
npm test                                          # full suite incl. new action tests
npx vitest run tests/server-actions               # this story's suite (path TBD at impl)
```

## Acceptance Evidence

**Implemented (2026-06-23).** 118 security tests across 4 files, all green;
full project suite 220 green.

- `tests/server-actions/_harness.ts` — capability matrix faithful to
  `lib/permissions.ts`, fixtures, `expectNoWrites`.
- `board.test.ts` (12), `list-card.test.ts` (84), `workspace.test.ts` (16),
  `analytics-read.test.ts` (6).
- Coverage: every mutating action in the matrix + 2 analytics reads. Each has
  A1 (auth) / A2 (permission) / A3 (isolation) + a positive control. The auth
  seam is mocked one layer below `hasWorkspacePermission` so the real
  resource→workspace derivation runs (A3 asserts the gate is asked about the
  resource's workspace, not the caller's).
- **Sabotage-verified (suite has teeth):** removing the permission gate from
  `updateBoardAction` turned its A2+A3 red; same for `moveCardAction`. Allow +
  auth cases stayed green. Production code reverted clean both times.

**Boundary findings (no gap):** `moveCardAction`'s same-board guard
(`target.list.boardId !== card.list.boardId`) blocks cross-workspace relocation
*before* the permission check — proven by a dedicated test where a fully
privileged WS-A admin still cannot move a card to a WS-B list. No fix intake was
needed.

**Run:** `npm test` or `npx vitest run tests/server-actions`.
