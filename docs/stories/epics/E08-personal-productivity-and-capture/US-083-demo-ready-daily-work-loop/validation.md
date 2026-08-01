# Validation Plan — US-083 Demo-Ready Daily Work Loop

## Proof Strategy

Every acceptance criterion below is observable (a command, an assertion, or a
deterministic UI state) — none are aspirational. Proof is layered:

- **Unit** for pure logic (today-grouping, capture default resolution, undo
  eligibility, badge-count math).
- **Integration** for Server Actions and read-model queries against mocked
  Prisma (`vi.mock("@/lib/prisma")`, established convention), including the
  permission/isolation matrix style used by `tests/server-actions/*`.
- **RTL** for the client components (dialog, snackbar, badge, dropdown) —
  following the US-068 RTL setup.
- **Two-client E2E** for every realtime claim (W1, W2) using the US-009/012
  harness (real `server.ts` + Postgres + two browser contexts).
- **Referenced-AC self-audit:** W6/W7 close only when every row of the
  overview's Referenced Acceptance (Self-Audit) table cites a passing
  evidence item (unit/integration/RTL/E2E case), re-checked at the story gate.
- **Sabotage/inversion** where it can literally prove a production guard:
  removing an emit turns the observer assertion red (W1); removing the room
  authorization check turns the cross-user denial red (W2); removing the
  restore gate turns the undo permission test red (W8); removing the
  active-parent guard turns the W8 parent-list-archived race test red.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | W6 `lib/today.test.ts`: date grouping boundaries (startOfDay/endOfDay, 7-day window, null due date), section ordering, archive filter logic. W7 `lib/quick-capture.test.ts`: default board/list resolution (active board → left-most list; fallbacks), shortcut focus guard predicate, submit payload mapping. W8 `lib/undo.test.ts`: eligibility map (archive-card ✓, archive-list ✓, every non-goal ✗), snackbar state machine (show/dismiss/expired). W2 badge-count math (`computeInboxBadgeCount` deltas in `lib/notifications/inbox.test.ts`). |
| Integration | W6 `tests/server-actions/today.test.ts` (or `tests/today.test.ts`): `getPersonalWorkCardsQuery` scoping — own cards only, other users' cards excluded, archived cards excluded, archived boards excluded, foreign workspace excluded (A3-style isolation), role access (viewer can read, non-member denied). W7 `tests/server-actions/quick-capture.test.ts`: capture invokes `createCardAction` with correct list/board/fields and position math; cross-workspace target rejected. W8 `tests/server-actions/undo-restore.test.ts`: undo calls `restoreCardAction`/`restoreListAction` with the archived id; archived-board guard; **parent-list-archived race: `restoreCardAction` with an archived parent list is rejected (existing active-parent guard in `getArchivedCardWithListAndBoard`), no invisible card restored, snackbar surfaces "restore the list first"**; viewer-denied / non-member-denied (A2/A3); sabotage: removing the permission gate turns the denial red. W2 `tests/server-actions/invitation-live.test.ts`: invite creates pending invitation visible to invitee only; signal payload scoped to invitee user room; denial: other workspace members do not receive it. |
| E2E (two-client) | W1 `e2e/realtime-event-proof.spec.ts` (or per-event specs): A updates a card → B sees in-place patch (`card:updated`); A creates a list → B sees it (`list:created`); A renames a list → B sees it live (`list:updated`); A archives/deletes a list → B sees it leave (`list:deleted`); **`notification:new`: A posts a comment mentioning B (existing deterministic mention mechanism) → B's badge increments without reload; B's assertion path contains no navigation, reload, or socket reconnect, so an emit-removal sabotage run cannot be masked by a fallback refresh**; A-triggered analytics-affecting action → B's analytics surface refreshes (`analytics:refresh`). Sabotage per event (emit removed → observer red). W2 `e2e/invitation-live-badge.spec.ts`: inviter (real account 1) invites invitee (real account 2, signed in on second context) → badge/inbox updates without refresh → invitee accepts → badge clears. W6 `e2e/today.spec.ts`: user assigned cards across 2 boards sees them grouped (Overdue/Due Today/Due This Week/Later); archived card/board disappears; cross-workspace board invisible. W7 `e2e/quick-capture.spec.ts`: from `/today`, `Cmd+K` opens dialog, capture lands on target board and appears live; `C` shortcut with focus guard (typing in an input does not open the dialog). W8 `e2e/undo-snackbar.spec.ts`: archive card → undo → card back in place with members/labels intact; archive list → undo → list restored with cards; **race: A archives card, B archives the parent list, A hits Undo → card stays archived (no invisible restore), failure surfaced**; non-goal check: no undo offered after permanent-delete, member-removal, label-deletion flows. |
| Platform | New surfaces at 375px (today page, capture dialog, snackbar) — no horizontal overflow; shortcuts inert on mobile-keyboard focus. |
| Performance | W6 `/today` renders for a representative workload (seed: 3 boards, ~60 cards) with no N+1 (single `findMany` + includes); W7 dialog opens without blocking input (existing action cost only). |
| Logs/Audit | W4: `harness-cli query sql` over `ruleExecutionLog` shape + `e2e/automation-log-retention.spec.ts` re-run; W5: `harness-cli audit` + `query matrix` evidence recorded in the story packet. |

## Fixtures

- Repeatable demo fixture (W3): demo-owner + 1 collaborator, one workspace,
  two boards ("Product Roadmap", "Sprint"), fixed lists/cards with relative
  due dates (pinned reference day), one archived card, one archived list, one
  pending invitation — produced by the W3 seed wrapper and reset between runs.
  Determinism is **logical**: shape/counts/titles/relative dates must repeat;
  DB UUIDs differ per run (seeds use `randomUUID()`) and are exposed via the
  W3 machine-readable manifest, unless implementation deliberately pins ids.
- E2E accounts: fresh `signUp()` users per run (existing `e2e/helpers` pattern;
  email verification via the Mailpit sink, `e2e/helpers/mail.ts`).
- Real two-account invite: inviter account + invitee account (separate browser
  contexts) — no forged sessions.

## Commands

**Focused node unit/integration subset** (planned; this is the story's
`verify_command` — a fast node-env subset, NOT the story's single/full gate).
Files land with their workstreams; the command only passes once every listed
file exists:

```bash
npx vitest run lib/today.test.ts lib/quick-capture.test.ts lib/undo.test.ts lib/notifications/inbox.test.ts tests/server-actions/today.test.ts tests/server-actions/quick-capture.test.ts tests/server-actions/undo-restore.test.ts tests/server-actions/invitation-live.test.ts
```

(`lib/notifications/inbox.test.ts` is the planned W2 badge-count unit surface
for `computeInboxBadgeCount`; the file exists today and gains the W2 delta
cases.)

**Full workstream exit additionally requires** (per workstream, not captured
by the subset): RTL suites green (`npm test` components project), the
workstream E2E specs green (`npm run test:e2e`), the W3 demo reset→reseed
round trip + stale-server restart rehearsal, `harness-cli audit`/`query matrix`
evidence for W4/W5, and `git diff --check` clean on the workstream diff.

E2E gate (per workstream):

```bash
npx playwright test e2e/realtime-event-proof.spec.ts e2e/invitation-live-badge.spec.ts e2e/today.spec.ts e2e/quick-capture.spec.ts e2e/undo-snackbar.spec.ts
```

Reconciliation evidence:

```bash
scripts/bin/harness-cli audit
scripts/bin/harness-cli query matrix
```

## Acceptance Evidence

Planned — implementation unstarted. Commands will be run and results recorded
here after each workstream gate, with the single final story status at the end.
