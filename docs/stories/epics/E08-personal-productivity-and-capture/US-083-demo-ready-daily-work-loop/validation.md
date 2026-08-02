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
| Unit | W6 `lib/today.test.ts`: calendar-day bucket boundaries (diff <0 / 0 / 1..7 / ≥8 at both local-midnight edges, DST-exact day-number arithmetic, null/unparseable due date), section ordering/sort, completed-card exclusion, en-US-pinned labels; `app/(authenticated)/(dashboard)/today/page.test.tsx` RSC wiring (verifySession → `getPersonalWorkCards(userId)` → TodayView props + metadata). W7 `lib/quick-capture.test.ts`: default board/list resolution (active board → left-most list; fallbacks), shortcut focus guard predicate, submit payload mapping. W8 `lib/undo.test.ts`: eligibility map (archive-card ✓, archive-list ✓, every non-goal ✗), snackbar state machine (show/dismiss/expired). W2 badge-count math (`computeInboxBadgeCount` deltas in `lib/notifications/inbox.test.ts`). |
| Integration | W6 `tests/server-actions/today.test.ts` (or `tests/today.test.ts`): `getPersonalWorkCardsQuery` scoping — own cards only, other users' cards excluded, archived cards excluded, archived boards excluded, foreign workspace excluded (A3-style isolation), role access (viewer can read, non-member denied). W7 `tests/server-actions/quick-capture.test.ts`: capture invokes `createCardAction` with correct list/board/fields and position math; cross-workspace target rejected. W8 `tests/server-actions/undo-restore.test.ts`: undo calls `restoreCardAction`/`restoreListAction` with the archived id; archived-board guard; **parent-list-archived race: `restoreCardAction` with an archived parent list is rejected (existing active-parent guard in `getArchivedCardWithListAndBoard`), no invisible card restored, snackbar surfaces "restore the list first"**; viewer-denied / non-member-denied (A2/A3); sabotage: removing the permission gate turns the denial red. W2 `tests/server-actions/invitation-live.test.ts`: invite creates pending invitation visible to invitee only; signal payload scoped to invitee user room; denial: other workspace members do not receive it. |
| E2E (two-client) | W1 `e2e/realtime-event-proof.spec.ts` (or per-event specs): A updates a card → B sees in-place patch (`card:updated`); A creates a list → B sees it (`list:created`); A renames a list → B sees it live (`list:updated`); A archives/deletes a list → B sees it leave (`list:deleted`); **`notification:new`: A posts a comment mentioning B (existing deterministic mention mechanism) → B's badge increments without reload; B's assertion path contains no navigation, reload, or socket reconnect, so an emit-removal sabotage run cannot be masked by a fallback refresh**; A-triggered analytics-affecting action → B's analytics surface refreshes (`analytics:refresh`). Sabotage per event (emit removed → observer red). W2 `e2e/invitation-live-badge.spec.ts`: inviter (real account 1) invites invitee (real account 2, signed in on second context) → badge/inbox updates without refresh → invitee accepts → badge clears. W6 `e2e/today.spec.ts` (4/4 green 2026-08-02): assigned cards across the user's own workspaces group into the four buckets incl. the exact +7/+8 boundary arrangements; archived card/board disappears on refresh; an assigned card in a workspace the viewer is NOT a member of never appears (foreign-workspace exclusion, second user/second context); both empty states. W7 `e2e/quick-capture.spec.ts`: from `/today`, `Cmd+K` opens dialog, capture lands on target board and appears live; `C` shortcut with focus guard (typing in an input does not open the dialog). W8 `e2e/undo-snackbar.spec.ts`: archive card → undo → card back in place with members/labels intact; archive list → undo → list restored with cards; **race: A archives card, B archives the parent list, A hits Undo → card stays archived (no invisible restore), failure surfaced**; non-goal check: no undo offered after permanent-delete, member-removal, label-deletion flows. |
| Platform | New surfaces at 375px (today page, capture dialog, snackbar) — no horizontal overflow; shortcuts inert on mobile-keyboard focus. |
| Performance | W6 `/today` renders for a representative workload (seed: 3 boards, ~60 cards) with no N+1 (single `findMany` + includes); W7 dialog opens without blocking input (existing action cost only). |
| Logs/Audit | W4: `RuleExecutionLog` shape verified against `prisma/schema.prisma` + migration `20260707021956_automation_logs_survive_rule_deletion` (the harness DB has no app tables, so `harness-cli query sql` is not the schema source) + `e2e/automation-log-retention.spec.ts` re-run; W5: `harness-cli audit` + `query matrix` evidence recorded in the story packet. |

## Fixtures

- Repeatable demo fixture (W3): demo-owner + 1 collaborator, one workspace,
  two boards ("Product Roadmap", "Team Operations"), five lists, seven cards
  with relative due dates (pinned reference day: +0 / +1 / +3 / -2 / -3 / +7 /
  none) and one completed card per board — produced by the W3 seed wrapper and
  reset between runs. The fixture deliberately does NOT pre-create archived
  cards/lists or a pending invitation: archive→undo and the live invitation
  badge are performed live during the demo/rehearsal through the real UI. The
  workspace id is seeded in the app's 32-char workspace-id format (the
  invitation/board/automation schemas reject UUIDs — see the rehearsal
  section); board `createdAt` values are pinned 1ms apart so the demo path's
  quick-capture default board (first creatable = "Product Roadmap") is
  deterministic (same-timestamp nested creates used to fall to the random-UUID
  id tiebreak — rehearsal-caught fix). Determinism is **logical**:
  shape/counts/titles/relative dates must repeat; ids differ per run (seeds
  use `randomUUID()`) and are exposed via the W3 machine-readable manifest,
  unless implementation deliberately pins ids.
- E2E accounts: fresh `signUp()` users per run (existing `e2e/helpers` pattern;
  email verification via the Mailpit sink, `e2e/helpers/mail.ts`).
- Real two-account invite: inviter account + invitee account (separate browser
  contexts) — no forged sessions.

## Commands

**Focused node unit/integration subset** (this is the story's
`verify_command` — a fast node-env subset, NOT the story's single/full gate):

```bash
npx vitest run lib/today.test.ts lib/quick-capture.test.ts lib/undo.test.ts lib/invitation.test.ts lib/notifications/inbox.test.ts tests/server-actions/today.test.ts tests/server-actions/quick-capture.test.ts tests/server-actions/undo-restore.test.ts
```

**Repair (final close, 2026-08-02):** the originally planned command listed
`tests/server-actions/invitation-live.test.ts` — a phantom file that does not
and will not exist (locked decision: no redundant live-invitation unit file
was created). The W2 invitation surfaces live in `lib/invitation.test.ts`
(`getPendingInvitationCount`, 3) and `lib/notifications/inbox.test.ts`
(`computeInboxBadgeCount` + `buildInboxItems`, 8); the command now points at
those real files and is what `harness-cli story verify US-083` runs (green,
8 files / 114 tests, recorded in the final-close section).

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

### W4 — Automation execution-log retention reconciliation (LANDED 2026-08-02 — committed dc1fd0a)

Evidence chain for each reconciled claim (see the W4 claims table in the
execplan for the full stale→evidence mapping):

- **Durable schema** — `prisma/schema.prisma` `RuleExecutionLog` (lines
  481–506): `workspaceId` + `ruleName` denormalized, `ruleId String?`,
  workspace FK `onDelete: Cascade`, rule FK `onDelete: SetNull`,
  `@@unique([ruleId, dedupKey])`, `error String?`, `metadata Json?`, indexes
  `[workspaceId, executedAt]` / `[ruleId, executedAt]` / `[cardId]` /
  `[chainId]`.
- **Migration** — `prisma/migrations/20260707021956_automation_logs_survive_rule_deletion/migration.sql`
  (CASCADE → SET NULL, denormalized columns backfilled before NOT NULL).
- **No retention window / no pruning** — no `ruleExecutionLog.deleteMany` or
  retention job anywhere in production code (only the generated client and
  tests reference it); logs clear solely via the workspace cascade.
- **One row per evaluation** — `lib/automation/evaluator.ts` (`logExecution`,
  claim-first finalize) + `lib/automation/effects.ts`
  (`logRuleExecutionError`, post-rollback); `actionType` is always
  `"sequence"`; per-step audit only in `metadata.steps` when ≥1 step failed
  (decision 0030). No `errorDetails` column exists (`error` + `metadata`).
- **Runtime proof (focused E2E re-run)** —
  `npm run test:e2e -- e2e/automation-log-retention.spec.ts` → **1 passed
  (32.5s)**: create rule → trigger (card-created → set-priority) → log shows
  "Retention Rule" / success → delete rule via the real AlertDialog → reload
  → log still shows the denormalized rule name, "No rule executions yet"
  absent, no fallback text. Fresh dev server per the W3 stale-server policy;
  fixture cleaned up by the spec's `afterAll`; E2E/services/DB lock released
  on handback.
- **Static checks** — `git diff --check` clean on the W4 doc diff.

Planned — implementation unstarted for the remaining workstreams (W6–W8). Commands
will be run and results recorded here after each workstream gate, with the
single final story status at the end.

### W5 — Tracker/harness truth reconciliation (LANDED 2026-08-02 — committed b1280f8)

All harness commands below were run personally against `harness.db` on
2026-08-02 (`scripts/bin/harness-cli`); outputs observed directly. The
protected `harness.db.bak-20260714-105049` and `tmp/` were not touched.

**Reconciliation evidence (commands + observed results):**

```bash
# before (same session, prior to W5 writes):
scripts/bin/harness-cli audit
# → Orphaned stories (planned/in-progress, no traces): 15 (incl. US-066, US-075, US-083)
# → Unverified stories: 34 (incl. US-075, US-083 — US-066 has no
#   verify_command, so it is not on this list)
# → Unverified decisions: 3 (0011/0012/0019 — pre-existing, out of W5 scope)
# → Open backlog without outcomes: 0; Stale stories: 0; Broken tools: 0
# → Entropy score: 100/100

scripts/bin/harness-cli query sql "SELECT id, status, unit_proof, integration_proof, e2e_proof FROM story WHERE id IN ('US-083','US-066','US-075')"
# → US-083 planned 0 0 0 0 | US-066 planned 0 0 0 0 | US-075 planned 0 0 0 0
scripts/bin/harness-cli query sql "SELECT id, title, status, doc_path FROM decision WHERE id LIKE '0029%' OR id LIKE '0030%'"
# → (no rows — the recorded 0029/0030 durable-row drift)

# durable-layer reconciliation (this pass):
scripts/bin/harness-cli story update --id US-083 --status in_progress --unit 1 --integration 1 --e2e 1 --platform 0 --evidence "…"
scripts/bin/harness-cli story update --id US-066 --status implemented --unit 1 --integration 1 --evidence "…"
scripts/bin/harness-cli story update --id US-075 --status implemented --unit 1 --integration 1 --evidence "…"
scripts/bin/harness-cli story verify US-075
# → Running: npx vitest run tests/server-actions/automation-failure-isolation.test.ts
# → 4 passed (1.33s); Story US-075 verification: pass
scripts/bin/harness-cli decision add --id 0029-permanent-delete-cloudinary-attachment-guard --title "0029 Permanent Delete Cloudinary Attachment Guard" --status accepted --doc docs/decisions/0029-permanent-delete-cloudinary-attachment-guard.md --notes "…"
scripts/bin/harness-cli decision add --id 0030-automation-rule-failure-isolation-semantics --title "0030 Automation Rule Failure Isolation Semantics" --status accepted --doc docs/decisions/0030-automation-rule-failure-isolation-semantics.md --notes "…"
scripts/bin/harness-cli query sql "UPDATE story SET notes = 'Implemented via PR #92 (feat/us-075-automation-failure-isolation, merged 81a6e0d; cc23e69 + dc0fb4a). Decision 0030 (Accepted): best-effort continuation, two-class error taxonomy. Isolates action errors and missing targets; decision gate resolved inside packet. Story verify pass recorded 2026-08-02.' WHERE id = 'US-075'"
# → US-075 notes field rewritten from the stale "Planned / implementation
#   unstarted" to the implemented/verified + decision 0030 state (`story
#   update` exposes no --notes flag; scoped query sql UPDATE is the
#   established mechanism)
scripts/bin/harness-cli trace --summary "US-083 W5 tracker/harness truth reconciliation landed: backlog/IN-04/TEST_MATRIX/product docs reconciled, harness story+decision rows refreshed, audit evidence recorded" --story US-083 --agent pi-implementer --outcome completed --actions '["ran harness-cli audit/query matrix before+after; story update US-083/066/075; story verify US-075 (pass); decision add 0029+0030; edited backlog.md","IN-04","TEST_MATRIX.md","docs/product/overview.md","e2e spec header","US-083 packet"]' --changed '["docs/stories/backlog.md","docs/stories/initiatives/IN-04-daily-work-and-structured-intake.md","docs/TEST_MATRIX.md","docs/product/overview.md","e2e/realtime-comment-list-reorder.spec.ts","US-083 packet (overview/execplan/validation)"]' --notes "W5 exit gate: audit output recorded in validation.md; touched files carry no claim contradicting harness rows; git diff --check clean"
# → trace id 3 recorded (US-083, outcome completed); this clears US-083
#   from the orphaned list (in_progress stories stay orphan-class until a
#   linked trace exists)

# after:
scripts/bin/harness-cli audit
# → Orphaned stories: 12 (US-066/US-075 no longer listed — status change to
#   implemented; US-083 left via this pass's trace — it stays on the
#   unverified list because its verify_command is the W6–W8 file subset and
#   cannot run until those files land)
# → Unverified stories: 33 (US-075 no longer listed — story verify pass;
#   US-083 remains; US-066 was never on this list — no verify_command)
# → Unverified decisions: 3 (0011/0012/0019 unchanged)
# → Entropy score: 100/100 (capped; residual drift is other epics' rows)
scripts/bin/harness-cli query decisions
# → 0029 + 0030 rows present with doc_path; status accepted
scripts/bin/harness-cli query matrix --numeric | grep -E 'US-066|US-075|US-083'
# → US-066 implemented 1 1 0 0 | US-075 implemented 1 1 0 0 | US-083 in_progress 1 1 1 0
```

> **Non-blocking chronology annotation (accepted 2026-08-02):** the command
> list above spans **two moments and is not chronological**. The US-075 notes
> UPDATE (`query sql UPDATE story SET notes … WHERE id = 'US-075'`) and the
> US-066 overview.md status rewrite were **closure-pass work performed after
> trace id 3 (after the W5 audit)** — they are grouped with the pre-trace
> commands for readability, not because they ran in that order. The audit
> output recorded above therefore reflects the state *before* those two
> closure edits; the closure pass itself removed the last two residual
> contradictions (US-075 notes, US-066 overview status) without re-running
> the audit, and the residual-gaps list below documents that explicitly.

**Files changed this pass** (tracker/docs only; no product code):
`docs/stories/backlog.md`, `docs/stories/initiatives/IN-04-daily-work-and-structured-intake.md`,
`docs/TEST_MATRIX.md`, `docs/product/overview.md`, `e2e/realtime-comment-list-reorder.spec.ts`
(header comment only), US-083 packet (overview.md / execplan.md / validation.md),
plus the inherited W4 uncommitted docs (preserved). `harness.db` rows updated
via the CLI (story ×3, decision ×2, verify ×1, trace ×1; US-075 notes via
the scoped `query sql` UPDATE above).

**Residual gaps (explicit, not hidden):**

- US-083 harness row stays in the "unverified" audit list (and its
  verify_command cannot run yet) because the command is the W6–W8 vitest
  subset (files do not exist until W6–W8; see the planned command above).
  Intentional; the W5 trace removed it from the orphaned list.
- US-066 packet status: US-066 overview.md previously still opened "planned
  (high-risk) — new feature intake" while TEST_MATRIX + the harness row said
  implemented; it was NOT in the W5 working-tree diff (only design.md/
  execplan.md were, and neither carries a status line), so the W5 gate did
  not reach it. Closed by the W5 closure pass: the overview status line now
  reads implemented with PR #78 + dc1fd0a citations, matching TEST_MATRIX
  and the harness row. The US-075 packet status WAS rewritten in W5 (it is a
  W4-touched file and its "planned — implementation unstarted"
  Status/Evidence/gate lines contradicted the reconciled harness row).
- 12 orphaned + 33 unverified stories + 3 unverified decisions remain in the
  audit: rows belonging to other epics, untouched by this story.
- `docs/product/notifications.md` needed no change: W2 (committed 3f238be)
  already rewrote the unified-inbox/live-arrival section; re-verified no stale
  claim remains (incl. `notifyInvited()` retained no-op — still accurate).

### W6 — Today / My Work cross-workspace read model (LANDED 2026-08-02 — committed dcc481b)

RED-first TDD: all five W6 test files were authored against non-existent
production modules and observed RED before any implementation, then GREEN
after (exact RED observations below). Focused Vitest/RTL + typecheck
green; the E2E/shared-server lock was granted 2026-08-02 and
`e2e/today.spec.ts` ran **4/4 green (1.1m)** — one arrange-defect repair
(`createWorkspace` user-menu path, E2E run record at the end of this
section).

**RED (tests only, no production code):**

```bash
npx vitest run lib/today.test.ts tests/server-actions/today.test.ts
# → RED — 2 failed, 0 tests: "Failed to load url ./today … Does the file
#   exist?" (lib/today.test.ts) + "Cannot find module '@/lib/today-query'"
npx vitest run components/today/today-view.test.tsx components/today/today-nav-link.test.tsx "app/(authenticated)/layout.test.tsx"
# → RED — 1 failed + 2 module-resolution failures: today-view.tsx /
#   today-nav-link.tsx missing; layout renders but "Unable to find an
#   accessible element with the role 'link' and name 'Today'" — the chrome
#   entry was not wired (behavioral RED, not just missing-module RED)
```

**GREEN (production implemented):**

```bash
npx vitest run lib/today.test.ts tests/server-actions/today.test.ts
# → GREEN — 2 files, 23 passed (16 unit + 7 integration)
npx vitest run components/today/ "app/(authenticated)/layout.test.tsx"
# → GREEN — 3 files, 12 passed (9 today-view RTL + 2 nav-link RTL + 1 layout)
npx vitest run components/authenticated-header-actions.test.tsx
# → GREEN — 4 passed (adjacent header suite untouched by the layout edit)
npx tsc --noEmit
# → clean (one correction pass: Card has no direct `board` relation — the
#   select goes through `list.board`; the select-shape integration assertion
#   updated to match)
npx eslint <changed files>   # → clean (removed one unused test fixture const)
git diff --check             # → clean
```

**W6 corrections pass (2026-08-02) — hydration/locale hardening + proof
seams** (from independent review; RED observed where feasible, exact runs
below):

```bash
npx vitest run components/today/today-view.test.tsx
# → RED — the two new SSR-determinism cases fail on the shipped W6 code: the
#   server-rendered markup embeds time-grouped sections + tiles computed with
#   the injected clock (same cards: "Late" in Overdue count 1 for a summer
#   clock vs Later count 2 for a winter clock) and contains no loading
#   status — a remote viewer whose clock/zone/locale differs from the
#   server's would rebucket on hydration. This is exactly the hazard the
#   corrections remove.
npx vitest run "app/(authenticated)/(dashboard)/today/page.test.tsx"
# → new file; green immediately (the seam already exists) — it is a
#   regression GUARD locking the wiring, not a bug-driven RED
npx vitest run lib/today.test.ts
# → green in this runner (en_US) both before and after; the locale pin is
#   only observable as fake-red in a non-en-US runner — that is the point of
#   the fix (explicit en-US makes the literals deterministic everywhere)
```

**Corrections landed (all focused suites 40/40 + adjacent header 4/4 green,
`tsc --noEmit` clean, changed-file ESLint clean, `git diff --check` clean):**

1. **Hydration boundary (required).** `TodayView` renders time-dependent
   grouping/labels only after a client-mounted boundary: server HTML and the
   first client paint are a deterministic accessible skeleton (one
   `role="status"` "Loading your day…" announcement + the loading.tsx
   skeleton shape; Skeleton blocks aria-hidden per the ui/skeleton contract),
   and the buckets/tiles/due chips render with the viewer's clock once
   mounted. The clock is captured once at first client render and the mounted
   flag uses `useSyncExternalStore` (server snapshot → client snapshot), so
   SSR and hydration can never disagree on bucket structure — no
   `suppressHydrationWarning` anywhere. Empty states (zero memberships /
   nothing assigned) are props-only and still render immediately on both
   sides; loading.tsx gains the matching `role="status"` announcement.
2. **Explicit English locale (required).** `describeTodayDue` formats date
   labels with `toLocaleDateString("en-US", …)` — the English Planora UI is
   pinned, so a non-en-US server/browser locale can no longer produce
   different labels (or server/client label divergence). Unit/RTL literals
   assert the pinned English output.
3. **RSC page wiring test (required).**
   `app/(authenticated)/(dashboard)/today/page.test.tsx` (3 cases) proves
   `verifySession` → `getPersonalWorkCards(session.user.id)` → `TodayView`
   props (workspaceCount + cards passthrough) and the metadata seam
   (`title: "Today"`).
4. **E2E foreign-workspace exclusion arrangement (required, landed 2026-08-02).**
   `e2e/today.spec.ts` gains a fourth test: a card ASSIGNED to the viewer on
   a board in a workspace the viewer is NOT a member of (created by a second
   user in a second browser context) never appears on `/today`, while the
   viewer's own card in their own workspace does — the Due Today count stays
   1 (not 2) and the foreign card link has count 0. Every DB write is
   parameterized; teardown via the existing per-workspace `cleanup` entries.
5. **E2E exact bucket-boundary arrangements (preferred option taken).** Test
   1 now seeds the +7 (last Due This Week day) and +8 (first Later day)
   calendar-day boundaries alongside the interior points (-3/0/+3/+30/none):
   counts stay small (Overdue 1 / Due Today 2 / Due This Week 2 / Later 3).
6. **Wording fixed (required).** The E2E layer-table row no longer claims
   "cross-workspace board invisible" as proven; it names the actual authored
   arrangements and was marked authored/unrun until the 2026-08-02
   shared-server lock run made them green (4/4, E2E run record below).
7. **Dead code removed (required).** `startOfDayLocal` export + its test were
   unused by any production code — removed; the Unit row no longer cites
   nonexistent startOfDay/endOfDay boundary tests.
8. **Residual follow-up (recorded, NOT fixed by design).** The personal read
   model is unbounded: `getPersonalWorkCards` returns every live assigned
   card across all member workspaces in one `findMany` with no pagination/
   limit. AC1 forbids hiding cards, so no silent cap was added this pass;
   cursor pagination / lazy section hydration for large personal workloads is
   a scale follow-up (the Performance row's representative workload stands).

**Evidence mapping (self-audit rows for US-077 AC1–AC6):**

| Referenced AC | Evidence |
| --- | --- |
| AC1 — cross-workspace membership-scoped (`/today` shows cards assigned to the user across every member workspace; scope server-derived, never client-supplied) | `tests/server-actions/today.test.ts` (7: membership-derived `in` clause, foreign workspace id never in the query, `getPersonalWorkCards` takes only `userId`); `e2e/today.spec.ts` test 1 (cross-workspace card renders with `Globex · Sprint · Backlog` context) + test 4 (assigned card in a workspace the viewer is NOT a member of never appears — foreign-workspace exclusion) — E2E 4/4 green 2026-08-02 |
| AC2 — four sections with exact date-window predicates | `lib/today.test.ts` (16: diff<0 / 0 / 1..7 / ≥8 boundaries at both local-midnight edges, calendar-day-not-24h, DST-exact day-number arithmetic, unparseable date → Later, completed-card exclusion, section ordering/sort) |
| AC3 — card tile opens the existing card detail (board/card deep link) | `components/today/today-view.test.tsx` (tile href `/boards/{boardId}?cardId={cardId}`); `e2e/today.spec.ts` (tile click → URL + `#card-detail-title` visible) — E2E 4/4 green 2026-08-02 |
| AC4 — workspace membership + board authorization respected | AC1 integration row (membership-derived scope) + live-card where shape (board `archivedAt: null`) |
| AC5 — archiving a card or board removes it on next refresh | integration where shape (`archivedAt: null` at card/list/board levels) + `e2e/today.spec.ts` (real archive-card UI then refresh → absent; real board-menu archive then refresh → absent) — E2E 4/4 green 2026-08-02 |
| AC6 — zero new tables/migrations | W6 diff contains no `prisma/` change; `git diff --stat` code side is read model + page + components + tests only |

**Files added this pass (code):** `lib/today.ts` (pure grouping, client-safe),
`lib/today-query.ts` (server read model), `app/(authenticated)/(dashboard)/today/page.tsx`
(async RSC), `app/(authenticated)/(dashboard)/today/loading.tsx`,
`components/today/today-view.tsx` (client boundary), `components/today/today-nav-link.tsx`
(global chrome entry), `e2e/today.spec.ts` (E2E 4/4 green 2026-08-02), `e2e/helpers/db.ts`
(+`setCardDueDate`, `assignCardMember` arrange helpers). **Modified:**
`app/(authenticated)/layout.tsx` (Today nav entry), `e2e/helpers/app.ts`
(`createWorkspace` gained the user-menu path for members with workspaces —
the one arrange-defect repair from the lock run; zero-workspace fast path
unchanged).

**Files changed this pass (docs):** US-077 packet (AC1 + design notes amended
to the cross-workspace interpretation), US-083 overview (self-audit AC1 row +
Target Behavior), US-083 execplan (W6 progress section), this validation.md,
`docs/product/overview.md` (cross-board → cross-workspace),
`docs/product/boards-and-cards.md` (section-name drift reconciled to the
locked buckets), `docs/product/workspaces-and-access.md` (new "Personal
cross-workspace reads" isolation subsection), `docs/TEST_MATRIX.md` (US-083
row W6 cells + evidence).

**E2E run record (2026-08-02, shared-server lock, personally observed):**

```bash
npm run test:e2e -- e2e/today.spec.ts
# → 4 passed (1.1m): four-bucket cross-workspace flow incl. the exact
#   +7/+8 boundary arrangements, deep-link sheet, card-archive +
#   board-archive refresh removal; foreign-workspace exclusion; zero-
#   membership empty state; nothing-assigned empty state
```

First run was RED (**1 failed, 3 passed**): test 1's second
`createWorkspace(page, "Globex")` timed out (60s) waiting for a "Create
workspace" button. Mechanism: the helper's contract silently assumed the
zero-workspace empty state — the only state prior specs exercised it in;
a member with workspaces creates one through the real user-menu dropdown
(both affordances open the same dialog). Repair: `e2e/helpers/app.ts`
`createWorkspace` keeps the direct-button fast path and falls back to the
avatar dropdown → "Create workspace" menuitem for members with workspaces.
Re-runs: focused test 1 green (29.3s), full spec 4/4 green (1.1m) — run
log also in the execplan W6 section. `tsc --noEmit`, changed-file ESLint,
`git diff --check` clean. No product, schema, or realtime code touched —
the W6 implementation itself needed no change; the defect was in the test
arrangement helper.

### W7 — global quick capture (landed 2026-08-02 — focused-test checkpoint + final E2E gate)

RED-first TDD evidence (all personally observed; no commit).
Each RED row states its exact code state; row 2's precondition was a
PARTIAL production state, not a tests-only one (see the note under it).
The E2E gate record (5/5 green) is in the "Final E2E gate" section below.

**RED runs:**

```bash
npx vitest run lib/quick-capture.test.ts
# → RED: Failed to load url ./quick-capture — module missing (tests-only
#   state — no production code existed yet)

npx vitest run tests/server-actions/quick-capture.test.ts
# → RED: 11 failed, 5 passed — PRECONDITION: a PARTIAL production state,
#   not a tests-only/module-missing state and not a "rejects" state.
#   lib/quick-capture-options.ts existed but the options export FAILED, and
#   the pre-W7 createCardSchema STRIPPED the optional keys at parse (zod
#   object default) — description/dueDate/priority were silently dropped
#   before the transaction, so the options-action cases and the
#   persist/fidelity cases failed. "11 failed / 5 passed" is exact ONLY
#   for that stated precondition.

npx vitest run components/quick-capture/quick-capture.test.tsx \
  components/quick-capture/quick-capture-shortcuts.test.tsx
# → RED: 2 suites failed to load — component module missing (tests-only)

npx vitest run tests/board-store.test.ts components/authenticated-header-actions.test.tsx
# → RED: 2 failed — W7 reducer-fidelity case (payload dueDate/priority
#   dropped by the unextended reducer) + chrome Quick Capture button case
#   (not yet mounted in the authenticated header)
```

**GREEN runs (final post-correction run, 2026-08-02 — exact counts):**

```bash
npx vitest run lib/quick-capture.test.ts tests/server-actions/quick-capture.test.ts \
  components/quick-capture/quick-capture.test.tsx \
  components/quick-capture/quick-capture-shortcuts.test.tsx \
  components/authenticated-header-actions.test.tsx tests/board-store.test.ts
# → GREEN: 6 files, 146 tests — per-file: 33 + 18 + 23 + 13 + 5 + 54
#   (baseline was already 141, not 140; the correction pass added 5 cases:
#   2 RTL lifecycle + 2 action + 1 reducer)

npx vitest run tests/server-actions/list-card.test.ts tests/server-actions/card-priority-cover.test.ts \
  tests/server-actions/automation-failure-isolation.test.ts tests/server-actions/checklist.test.ts \
  lib/card-history.test.ts tests/board-store.test.ts \
  "app/(authenticated)/(dashboard)/boards/[boardId]/board-store-provider.test.tsx" \
  "app/(authenticated)/layout.test.tsx"
# → GREEN: 8 files, 229 tests (affected-area regression — existing
#   createCardAction/restoreCardAction consumers, realtime/store consumers,
#   chrome; board-store.test.ts is counted in BOTH runs by design)

npx tsc --noEmit          # clean
# changed-file ESLint     # clean
git diff --check          # clean
```

**Correction pass (reviewer + proof-auditor findings, 2026-08-02 — no
commit; the E2E spec stays authored/unrun):**

1. **Quick Capture stuck-ref lifecycle (product bug):** closing the dialog
   while the options fetch was in flight left `fetchStartedRef` true, so
   every later open was permanently stuck on "Loading boards…". Fixed: a
   close invalidates the in-flight request (`fetchSeqRef` bump) and clears
   the started flag; each fetch captures its request id and a late
   resolve/reject of a stale request can never overwrite the newer one.
   Proof: 2 new discriminating RTL cases (late resolve / late rejection of
   the stale deferred against a fresh request — RED on the old lifecycle,
   GREEN on the fix), `components/quick-capture/quick-capture.test.tsx`.
2. **Board/list Radix Select uncontrolled→controlled flip (zero-warning):**
   while lazy options loaded, `value={boardId ?? undefined}` made the
   selects uncontrolled, then controlled once the default resolved (33
   "uncontrolled to controlled" + 6 reverse warnings on the pre-fix
   component). Fixed: `value={boardId ?? ""}` / `value={listId ?? ""}` —
   controlled from first mount. The suite now runs with ZERO
   uncontrolled↔controlled warnings. (Pre-existing happy-dom `act()` noise —
   4× "An update to QuickCapture" on the submit test + 3 Radix select
   warnings — reproduces identically on the pre-fix component and is not
   part of this finding; recorded as residual.)
3. **restoreCardAction emit fidelity (product fix):** its `card:created`
   emit lacked the dueDate/priority fidelity `createCardAction` now has, so
   a restored card's meta vanished for observer clients. Fixed: the emit
   carries `dueDate` (ISO) / `priority` from the archived-aware resolver
   (fields already selected). Proof: new action case pins the full payload
   (id/listId/title/position/dueDate/priority) + revalidate + the pinned
   CARD_RESTORED history row — RED on the unpatched emit, GREEN on the fix,
   `tests/server-actions/quick-capture.test.ts`.
4. **E2E route-default test was vacuous (arrangement bug):** it created ONE
   board, so the route board "won" without competing with a first-creatable
   board, and its comment claimed a second board existed. Fixed: an
   earlier-created board ("Alpha") makes the deterministic first-creatable
   fallback distinct from the route board ("Roadmap"), which still wins on
   its own page — non-vacuous; comment corrected. Still authored/unrun.
5. **RED row-2 narrative corrected:** see the RED block above — partial
   production state (options export existed but failed; pre-W7 zod stripped
   optional keys), not tests-only, no "rejects". The exact "11 failed / 5
   passed" is preserved for that precondition.
6. **Counts reconciled:** baseline focused gate was already 141 (not 140);
   the final post-correction run is 146 focused / 229 regression with the
   exact per-file numbers above. overview/execplan/US-078/TEST_MATRIX carry
   the same final numbers.
7. **Automation preservation is now load-bearing in W7:** new focused case
   asserts the REAL create transaction invokes the evaluator's
   `tx.rule.findMany` (workspaceId + triggerType card-created + enabled
   only) — the extended create can never bypass the US-066 path.
8. **History payload pinned:** the AC4 case now pins the CARD_CREATED row
   (workspaceId/boardId/cardId/eventType + dueDate metadata,
   skipDuplicates false), not merely "createMany called".
9. **preventDefault proof completed:** handled Ctrl+K and Meta+K assert
   exactly-once preventDefault; every guarded case (typing targets, copy,
   Shift+C, repeat, IME, already-open dialog, open overlay/listbox) asserts
   zero.
10. **Reducer absent-field fallback proven:** new store case — a pre-W7
    payload without dueDate/priority yields `null` for both (not stale
    spread values).

**Post-checkpoint fixes (root, 2026-08-02, before the final E2E run):**

11. **Hydration-readiness marker for the global shortcut (E2E race fix):**
    a fast navigation could lose the first C keydown while the
    shortcut listener was still hydrating. The chrome button now exposes
    `data-shortcuts-ready` (owned by the keydown-listener effect; `"true"`
    only after `addEventListener` ran), and the spec's `openCapture` waits
    for the attribute before pressing C. Narrow saved-destination run 1/1
    green; the full spec green afterwards.
12. **US-043 two-Escape semantics in the focus-guard test (test fix):**
    the card detail sheet intentionally keeps its open state on the first
    Escape while a title draft is unsaved (revert), closing only on the
    second Escape. The guard test now presses Escape twice before
    asserting the input is gone and the C guard has released. Narrow run
    1/1 green.

**Final E2E gate — `e2e/quick-capture.spec.ts` 5/5 GREEN (2026-08-02):**

```bash
# port 3000 verified free before/after; Playwright boots its own server
# (fresh, single worker). Heavy suites run sequentially — nothing else ran.
npm run test:e2e -- e2e/quick-capture.spec.ts
```

→ **5 passed (≈1.3–1.4m).** First official green observed by the root seat
(≈1.3m); independently re-run green twice by the W7 finalization seat —
run 1 ≈1.4m (log `/tmp/w7-quick-capture-e2e.log`), run 2 ≈1.3m on the fully
edited final tree incl. the spec-header record (log
`/tmp/w7-quick-capture-e2e-final.log`), 2026-08-02:
per-test ✓ 1 C from /today + optional fields + deep-link toast (19.0s),
✓ 2 saved-destination fallback (14.3s), ✓ 3 route default + C input-focus
guard, US-043 two-Escape (15.0s), ✓ 4 two-client live appearance with W1
barrier + connect-resync settle + masking tripwire, priority chip visible
(19.3s), ✓ 5 Cmd/Ctrl+K opener (6.5s). No assertion weakened — the tripwire
counters, the readiness-marker wait, and the two-Escape sequence all ran as
written.

**Full-suite gate at the stable checkpoint (2026-08-02, after the
readiness-marker edit):**

```bash
npm test                    # → 85 files, 1351 tests, all passed (37.8s)
npx tsc --noEmit            # clean
npx eslint <16 changed ts/tsx files>  # clean
npm run test:e2e -- e2e/quick-capture.spec.ts  # 5/5 (above)
```

**Files added:** `lib/quick-capture.ts` (pure defaults/shortcut/storage
logic), `lib/quick-capture.test.ts` (33), `lib/quick-capture-options.ts`
(server read model, four bounded queries), `components/quick-capture/
quick-capture.tsx` (button + dialog + form + toast, self-contained),
`components/quick-capture/quick-capture.test.tsx` (23),
`components/quick-capture/quick-capture-shortcuts.test.tsx` (13),
`tests/server-actions/quick-capture.test.ts` (18),
`e2e/quick-capture.spec.ts` (5 tests — **5/5 green** on the final
shared-server run, 2026-08-02).

**Files modified:** `lib/schemas/card.ts` (createCardSchema optional
fields, backward-compatible), `app/(authenticated)/(dashboard)/boards/
[boardId]/actions.ts` (createCardAction: one atomic create + emit payload
fidelity; restoreCardAction: emit fidelity — correction pass #3),
`lib/realtime/types.ts` (CardSnapshot dueDate/priority),
`app/(authenticated)/(dashboard)/boards/[boardId]/board-store.ts` (reducer
fidelity, null fallback), `app/(authenticated)/actions.ts`
(`getQuickCaptureOptionsAction`), `components/authenticated-header-actions.tsx`
(+test), `tests/board-store.test.ts`
(+2: fidelity + null-fallback), `DESIGN.md` (Keyboard Shortcuts convention
— first global shortcut owner).

**Contract decisions locked:** see the W7 section of the execplan (D1
defaults/per-field saved validity, D2 shortcut semantics + preventDefault-
only-when-handled + Cmd/Ctrl+K browser-chrome reservation caveat, D3 options
action membership/role isolation + determinism + no N+1, D4 schema/action
extension in one transaction, D5 realtime fidelity with null fallbacks,
D6 lazy first-open options + self-contained toast/no auto-navigation).

**Residual:** pre-existing happy-dom `act()` noise in the RTL suite (see
correction pass #2 — reproduces identically on the pre-fix component);
Cmd/Ctrl+K remains browser-chrome-reserved in real browsers (documented
caveat, authoritative proof is the RTL/unit guard suites — bare C is the
reliable demo path); W8 (bounded undo) is the next workstream. The full
`npm test` gate and the E2E gate are both closed at this checkpoint.

### W8 — bounded undo (landed 2026-08-02 — focused gates green; E2E 5/5 GREEN, gate below)

**RED first (all personally observed, before any production edit):**

| # | Code state | Run | Result |
| --- | --- | --- | --- |
| 1 | tests only (no production code) | `npx vitest run lib/undo.test.ts` | **RED** — `@/lib/undo` unresolved, 0 tests ran |
| 2 | tests only | `npx vitest run tests/server-actions/undo-restore.test.ts` | **RED** — 4 failed (sequential discrimination, true-race abort, list-row-gone generic failure, FOR UPDATE call-shape) |
| 3 | tests only | `npx vitest run components/undo/undo-snackbar.test.tsx components/boards/archive-card-dialog.test.tsx components/boards/list-column.test.tsx` | **RED** — 3 suites failed to load (`@/components/undo/undo-snackbar` unresolved) |
| 4 | real-DB proof, guard flipped OFF (mirrors the pre-W8 production protocol: sequential pre-read only) | `npx vitest run tests/db-undo-race-proof.test.ts` | **RED** — invariant test failed on real Postgres: the archiver-commits-first interleaving committed the invisible card (the concurrency bug demonstrated) |

**GREEN (after production implementation):**

| # | Run | Result |
| --- | --- | --- |
| 5 | focused gates: `lib/undo.test.ts` (13) + `lib/card.test.ts` (18, incl. the 3 resolver discrimination cases) + `tests/server-actions/undo-restore.test.ts` (13) | 44 passed (3 files) |
| 6 | `components/undo/undo-snackbar.test.tsx` (12) + `components/boards/archive-card-dialog.test.tsx` (2) + `components/boards/list-column.test.tsx` (7 incl. the new seam test) | 21 passed |
| 7 | `tests/db-undo-race-proof.test.ts` (guard ON) | 3 passed (real Postgres, lock_timeout-deterministic) |
| 8 | affected-area regressions: list-card, list-lifecycle, card-priority-cover, quick-capture, automation-failure-isolation (198) + card-detail-sheet, archived-cards-dialog, list-card-item, board-filter (43) + board-store-provider, board-store (57) | all green |
| 9 | `npm test` full suite (pre-correction checkpoint) | **1395 passed, 90 files** — final post-correction full run: **1400 passed, 90 files** |
| 10 | `npx tsc --noEmit` / changed-file ESLint / `git diff --check` | clean |

**Sabotage / disconfirm evidence (both RED, both fully restored, no marker left):**

| # | Sabotage | Run | Result |
| --- | --- | --- | --- |
| 11 | in-transaction revalidation branch disabled in `restoreCardAction` (the race case asserts `card.update` never runs) | `npx vitest run tests/server-actions/undo-restore.test.ts` | **RED** — 1 failed at `race: parent list archived between pre-read and tx`; restored → 13/13 GREEN |
| 12 | real-DB proof guard flipped OFF (WITH_GUARD=false) | `npx vitest run tests/db-undo-race-proof.test.ts` | **RED** — 2 failed: test 1 (the unguarded interleaving commits the invisible card) AND test 3 (no FOR UPDATE lock → the archiver's UPDATE no longer hits lock_timeout); test 2 is the unguarded control and stays green. Corrected after the proof-audit: test 3's lock acquisition was initially hardcoded (only test 1 went red); it is now wired through the same WITH_GUARD switch as the production protocol. Restored → 3/3 GREEN |

`grep -c SABOTAGE` over production/test code at handback: 0 (the packet's own
evidence narrative legitimately uses the word).

**Design realized (locked contract):**

- **Concurrency safety:** `restoreCardAction` enforces the parent-list check
  INSIDE the transaction (`SELECT id, "archivedAt" FROM "list" WHERE id = $1
  FOR UPDATE` + `archivedAt IS NULL` revalidation — the US-074 pattern;
  call-shape-pinned). The sequential pre-read now DISCRIMINATES
  (`getArchivedCardWithListAndBoard` returns `parentListArchived`) instead of
  nulling, so the dedicated `"Restore the list first."` outcome
  (`code: "PARENT_LIST_ARCHIVED"`) is surfaced only after the
  card-exists + remains-archived + parent-list-archived + board-active +
  caller-authorized predicate — missing/foreign/already-restored/
  permanently-removed/archived-board keep the generic not-found (no existence
  leak; viewer/foreign denial pinned even when the parent list is archived).
  Double-undo keeps the generic failure contract (residual, decision 0031).
- **Undo host:** `components/undo/undo-snackbar.tsx` `UndoHost` mounted in
  the board page inside `BoardStoreProvider` (page.tsx, wrapping the board
  UI) — survives archived-entity unmount and realtime/RSC updates; context
  reaches both seams; outside a host `useUndo()` is a documented no-op.
  Pure `lib/undo.ts`: eligibility map (card/list ✓, every non-goal ✗),
  reducer (OFFER/DISMISS/UNDO_START/UNDO_OK/UNDO_FAIL; latest-offer-wins;
  late outcomes can't resurrect a dismissed snackbar), 8s offer TTL / 4s
  success TTL constants.
- **Exactly two seams:** shared `ArchiveCardDialog` (board face + detail
  sheet) and the `ListColumn` archive menu — `offerUndo({ kind, id, label })`
  with call-site ids/titles; `deleteListAction`'s legacy-alias identity is
  irrelevant to eligibility (the intended archive UI call site decides).
- **Interaction:** pessimistic restore via the real actions; in-flight
  `Restoring…` + disabled; manual dismiss; navigation dismissal; thrown
  actions → generic failure alert (never stuck); polite `role="status"`
  success, assertive `role="alert"` failure with the action's own error; no
  focus steal (RTL-pinned). No app-wide toast framework, no entity/migration,
  no new realtime event.
- **Real-DB proof scope note:** `tests/db-undo-race-proof.test.ts` proves the
  production transaction PROTOCOL at the SQL level (db-index-proof style);
  the action wiring (statements + branches) is pinned by the call-shape tests
  in `tests/server-actions/undo-restore.test.ts`, whose sabotage (branch
  removal) goes red. The E2E race test covers the sequential discrimination
  path end to end; the true in-tx race is covered by the mocked-tx action
  test + the real-DB proof.

**E2E — 5/5 GREEN (2026-08-02 Root-granted shared-server run; gate section below).** `e2e/undo-snackbar.spec.ts` (5 tests):
(1) card archive → Undo restores the card in place — tripwire (reload/socket
counters; the acting page's own action POSTs are excluded by window design)
+ DB `archivedAt IS NULL`; (2) list archive → Undo restores the list with its
cards (DB assertions); (3) two-client race — A archives the card, B archives
the parent list, A's snackbar SURVIVES the realtime update (observer window,
all four tripwire counters clean), A's Undo fails truthfully with
`Restore the list first.` (assertive alert), card stays archived (DB + UI, no
invisible restore); (4) non-goal absence: member removal + label deletion
offer no undo; (5) non-goal absence: permanent list deletion (exact-title
confirm flow) offers no undo and the row is gone. Run requires the shared
server (W3 policy); the seat is requested from Root after review. No E2E run
is claimed in any doc.

**Files changed (W8):** `lib/undo.ts` (+test), `lib/card.ts`
(`getArchivedCardWithListAndBoard` discrimination, +tests),
`app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts`
(`RestoreCardResult` code + PARENT_LIST_ARCHIVED_MESSAGE + pre-read
discrimination + in-tx FOR UPDATE revalidation),
`app/(authenticated)/(dashboard)/boards/[boardId]/page.tsx` (UndoHost mount),
`components/undo/undo-snackbar.tsx` (+12 RTL), `components/boards/
archive-card-dialog.tsx` (+2 RTL), `components/boards/list-column.tsx`
(+1 RTL seam), `tests/server-actions/undo-restore.test.ts` (13),
`tests/db-undo-race-proof.test.ts` (3, real Postgres), `tests/server-actions/
quick-capture.test.ts` (makeTx gains `$queryRaw` for the new lock seam),
`e2e/undo-snackbar.spec.ts` (authored), `e2e/helpers/db.ts`
(`getCardArchivedAt`/`getListArchivedAt`/`listExists`), `DESIGN.md`
(Transient Feedback convention), `docs/product/boards-and-cards.md`,
`docs/TEST_MATRIX.md`, decision 0031 (implementation note), this packet's
overview/execplan/validation.

**Residual / open:** double-undo keeps the generic failure contract
(documented residual); the failure snackbar persists until dismissed/next
offer/navigation (no auto-TTL — assertive semantics); E2E unrun pending the
shared-server lock; `deleteListAction` naming remains a legacy alias
(pre-existing).


### W8 correction pass (2026-08-02 — proof-audit findings; no commit, no Playwright run)

| # | Finding | Fix | RED → GREEN |
| --- | --- | --- | --- |
| C1 | Production state-machine race: an outcome from Undo offer A (in flight) could overwrite a newer offer B — `UNDO_OK`/`UNDO_FAIL` only checked that SOME offer exists. | `UndoAction` outcome actions are now tagged with the offer's stable **generation** (`OFFER` bumps it; `UNDO_START`/`OK`/`FAIL` carry it); the reducer drops outcomes whose generation no longer matches, while still clearing the in-flight marker; `inFlightGeneration` in state replaces the host's ref (one undo at a time, self-healing when the stale outcome lands). Latest-offer-wins preserved; no toast framework/idempotency scope added. | RED: 2 reducer tests + 2 RTL tests written first against the old reducer/host — 2 failed + 2 failed (A's success/failure overwrote B). GREEN after the fix: `lib/undo.test.ts` 16/16 (incl. stale-success, stale-failure, and in-flight-blocking-then-honored sequences), `components/undo/undo-snackbar.test.tsx` 14/14 (incl. the RTL race: A starts, B offered with its Undo disabled, A resolves success → B stays offered with its Undo enabled and working; failure variant). |
| C2 | E2E non-goal absence assertions ran while the Radix detail sheet / archived dialog aria-hid the page — vacuously green. | `e2e/undo-snackbar.spec.ts`: the sheet is now CLOSED (Escape + `#card-detail-title` count 0) before every no-snackbar/no-alert assertion (member removal, label deletion, permanent list deletion — the archived-items dialog is closed the same way), with decisive completion observations (remove-buttons count 0 after removal; `listExists` false after purge). The intermediate vacuous assertions were removed, not just surrounded. | Verified in the W8 E2E gate below (5/5 GREEN) — the vacuous path is structurally removed: every absence assertion is preceded by a modal-close + count-0 assertion, so a hidden snackbar can no longer satisfy it. |
| C3 | E2E race baseline could capture A's own post-archive route refresh in flight; snackbar reassert after B's archive was not immediate. | `waitForLoadState("networkidle")` settles A's post-archive RSC refresh/sheet-close BEFORE the tripwire baseline; the snackbar is re-asserted visible + text immediately after B's `archiveList` and again before the Undo click. | Same as C2 — verified in the W8 E2E gate below (5/5 GREEN); the baseline/tripwire windows are now quiescent by construction. |
| C4 | List happy-path E2E had no tripwire — "in place, no reload" was not enforced there. | `armProofTripwire` added to the list-undo test around the Undo window (reload/socket counters; the acting page's own action POSTs are excluded by window design, same as the card test), with a `networkidle` settle before the baseline. | Same as C2 — verified in the W8 E2E gate below (5/5 GREEN). |
| C5 | `getCardArchivedAt` conflated a missing row with a live card (both null). | Fail-closed: exactly one row required, else throws with the id + count. | Covered by the E2E helper's fail-loud contract; verified in the W8 E2E gate below (5/5 GREEN). |
| C6 | Evidence typos: lib/undo count was 15 (actual 13), resolver count 2 (actual 3), guard-off DB sabotage reddened only test 1 (test 3's lock was hardcoded). | Counts corrected in the W8 tables (rows 5/12 above); test 3's lock acquisition wired through the WITH_GUARD switch and the sabotage re-run: **2 failed (tests 1 + 3) | 1 passed**, restored → 3/3. | Observed above (real Postgres). |

Re-verified after the pass: `lib/undo.test.ts` 16, `tests/server-actions/undo-restore.test.ts` 13, `lib/card.test.ts` 18 (3 resolver), `components/undo/undo-snackbar.test.tsx` 14, `archive-card-dialog.test.tsx` 2, `list-column.test.tsx` 7, `tests/db-undo-race-proof.test.ts` 3, `quick-capture.test.ts` 18, `list-card.test.ts` 116 — all green (3+3+3 files = 47 + 23 + 137); `tsc --noEmit`, changed-file ESLint, `git diff --check` clean; zero SABOTAGE markers in production/test code. Final gates: full `npm test` 1400 passed (90 files); W8 E2E 5/5 GREEN (gate section below).


### W8 E2E gate — shared-server run (2026-08-02, lock granted by Root; all personally observed)

**Final result: `npm run test:e2e -- e2e/undo-snackbar.spec.ts` → 5/5 GREEN (1.5m).**
Per-test: card undo 19.0s / list undo 11.5s / two-client race 20.0s / non-goal
member-removal + label-deletion 21.3s / non-goal permanent-delete 11.3s.

**Run log (first run → diagnosis → fix → final):**

| # | State | Result | Classification |
| --- | --- | --- | --- |
| 1 | final tree, first full run | **5 failed** — every test failed in `signUp` (`#name` never rendered) | **PRODUCT DEFECT (W8 scope):** `export const PARENT_LIST_ARCHIVED_MESSAGE` in the `"use server"` file `boards/[boardId]/actions.ts` violates Next's only-async-functions-may-be-exported rule → the whole authenticated module graph (quick-capture → actions.ts) failed to compile, so every page render after the error 500'd. Vitest/tsc cannot see this (no use-server semantics). **Fix (minimal):** de-exported the constant (module-private; verified zero external importers; the runtime contract is the result shape). |
| 2 | fix applied | focused `-g "card archive offers undo"` → **1 passed (24.2s)** | fix verified |
| 3 | fix applied | full spec → **3 passed / 2 failed** | **TEST DEFECTS:** (a) race test: `getByRole("alert")` matched Next's permanent `#__next-route-announcer__` (`role="alert"`) instead of the failure snackbar — locator scoped to `[role="alert"]:not(#__next-route-announcer__)`; (b) non-goal test: second `signUp` on the SAME page after the owner is authenticated — `/sign-up` redirects away, `#name` never appears — Carol moved to her own browser context (repo multi-user convention). |
| 4 | fixes applied | focused `-g "two-client race\|non-goal absence: member removal"` → race **1 passed (25.9s)**; non-goal **failed** at `openCardDetail` #2 | **TEST DEFECT (race):** the card click right after the sheet-close `router.replace` was swallowed by the in-flight transition (two plain GETs settle after the close). Fixed with a `waitForLoadState("networkidle")` settle before re-opening. |
| 5 | + settle | `--trace on` focused non-goal → **failed** at the manage-labels Escape close | **TEST DEFECT (focus-dependent close):** after `deleteBoardLabel`'s confirm AlertDialog closes, Radix restores focus to the deleted row's button (now removed) → focus falls to `<body>` → the dialog's content-bound Escape listener never fires. Replaced ALL Escape closes in test 4 with deterministic topmost-overlay clicks (`[data-slot="dialog-overlay"]` last, corner position), each gated on the named layer count-0. |
| 6 | overlay-close fix | focused non-goal → **1 passed (27.7s)** | fix verified |
| 7 | final tree | full spec → **5 passed (1.5m)** — timings above | final |

No DB assertion, overlay gate, tripwire, realtime-survival, or non-goal
absence check was weakened at any point. Production change from the gate: the
de-export of `PARENT_LIST_ARCHIVED_MESSAGE` (module-private) — the 8s TTL and
all W8 behavior otherwise untouched. Test-only changes: alert locator scoping,
two-context sign-up, overlay-close helper + settle, and the earlier
generation-race RTL/reducer fixes (all re-verified below).

---

## W3 exit gate — EXECUTED for real (final close, 2026-08-02)

The W3 exit gate was run for real, not just planned: the two demo users were
provisioned through the actual sign-up flow + Mailpit verification (decision
0025 — no bypass), then the seed→reset→seed round trip was executed and the
two runs compared logically.

**User provisioning (real UI + Mailpit):** the two demo users were first
provisioned for the round trip through a throwaway /tmp script driving the
real sign-up form + Mailpit verification (initial execution, below). The
rehearsal spec is now SELF-PROVISIONING (correction pass 2026-08-02): it
signs both users up through the real flow itself when they are absent on the
current database, so a fresh CI database needs nothing but Postgres + Mailpit
(proven on a disposable database — see the correction-pass section).

```bash
# /tmp/provision-demo-users.ts (throwaway; imports repo helpers via a /tmp
# node_modules symlink; Mailpit mailbox cleared first) — INITIAL execution
npx tsx /tmp/provision-demo-users.ts
# → provisioned+verified: owner@example.com (Demo Owner)
# → provisioned+verified: collaborator@example.com (Demo Collaborator)
# → PROVISION_OK
```

Both users verified through the real email flow; no verification was forged.
(The script's first attempt failed on a relative-URL `page.goto` — test-script
defect, fixed by prefixing the base URL; the partial unverified `owner`
row created by that attempt was deleted before the clean re-run.)

**Round trip (commands + observed results):**

```bash
npm run demo:seed -- --owner-email owner@example.com --collaborator-email collaborator@example.com
# → Seeded reserved demo workspace: planora-us083-demo
# → Workspace id: 98ed998e-… (run 1)
# → Logical shape: 2 boards, 5 lists, 7 cards
# → Manifest: .demo/fixture-manifest.json  (copied to /tmp/us083-manifest-run1.json)
npm run demo:reset -- … # → Deleted reserved demo workspace 98ed998e-…
npm run demo:seed -- …  # → Workspace id: 8f279808-… (run 2); manifest copied to /tmp/us083-manifest-run2.json
```

**Comparison (logical, ids may differ):** a throwaway script
(`/tmp/compare-manifests.mjs` + `/tmp/fixture-shape.mjs` — the latter reads the
live DB and computes each card's due-date offset from the manifest's
`generatedAt`) verified:

| Property | Run 1 | Run 2 | Match |
| --- | --- | --- | --- |
| logicalShape (boards/lists/cards) | 2 / 5 / 7 | 2 / 5 / 7 | ✓ |
| board titles | Product Roadmap + Team Operations (3+2 lists, 5+2 cards) | identical | ✓ |
| list/card titles | identical | identical | ✓ |
| members + roles | owner=admin, collaborator=editor | identical | ✓ |
| relative due-date offsets | 0, +3, +1, -2, -3, +7, none | identical | ✓ |
| workspace id | 98ed998e-… (UUID) | 8f279808-… (UUID) | differ ✓ |
| all 14 board/list/card entity ids | random | random | all differ ✓ |
| generatedAt | 09:59:38Z | 10:00:02Z | differs ✓ |

`ROUND_TRIP_OK`. Re-run after the fixture fixes (see the rehearsal section)
with the same result, plus the workspace id now in the app's 32-char format
and "Product Roadmap" deterministically first by pinned `createdAt`.

**Fixture state left behind (deliberate):** the final seeded fixture remains
in place — workspace `planora-us083-demo` (manifest `.demo/fixture-manifest.json`),
users `owner@example.com` + `collaborator@example.com` (verified, password
`demo-password-123`), 2 boards / 5 lists / 7 cards — exactly the state the
DEMO_RUNBOOK expects before a demo/rehearsal. Reset anytime with `demo:reset`.

## Platform proof — `e2e/platform-375.spec.ts` (final close, 2026-08-02)

New 375px DOM-level spec (no visual-test infrastructure — overflow via
scrollWidth/clientWidth, usability via the real actions) covering the three
new demo surfaces. RED first-run recorded, then GREEN:

| Run | Result | Classification |
| --- | --- | --- |
| 1 (first) | **1 passed / 2 failed** | TEST-ARRANGEMENT defect (not product): `addCard`'s click resolves before the Server Action commit, and the spec queried the DB id immediately — a 375px-only exposure of a latent race the desktop specs mask by looping more interactions. The 375px assertions themselves were green on this run (the Quick Capture test — dialog, capture, focus guard, overflow — passed first try). |
| 2 (fix: `addCardAndSettle` waits for the card face before any DB lookup) | **3/3 passed (45.5s)** | fix verified |

What is proven (3 tests): `/today` renders all four buckets at 375px with
`documentElement`/`body` horizontal overflow ≤ 1px; Quick Capture opens via
the bare C shortcut, captures a real card, and the C guard stays inert while
an editable field holds focus (typed "c" lands in the input, no dialog; after
focus leaves the editable, C opens the dialog) — all without overflow; the
undo snackbar at 375px offers Undo for an archived card and restores it in
place (reload/socket tripwire clean) without overflow.

## Demo rehearsal — `e2e/demo-rehearsal.spec.ts` (final close, 2026-08-02)

One continuous test runs the ENTIRE locked demo path from the seeded fixture
in one sitting — this is the rehearsal, not a collection of separate specs.
RED-first chain (all personally observed):

| Run | Result | Classification |
| --- | --- | --- |
| 1 | RED — sign-in "Invalid email or password" | TEST defect: the spec assumed the E2E password; the demo users are provisioned with `demo-password-123` (fixed). |
| 2 | RED — the captured card never reached the collaborator's Product Roadmap board | **PRODUCT/FIXTURE defect (real):** both fixture boards share one transaction `now()`, so quick capture's default board (first creatable by `createdAt`, then random id) fell to the random-UUID tiebreak — in this run "Team Operations" won, so the capture landed there. The demo path's capture target was nondeterministic between seeds. **Fix:** the fixture pins 1ms-offset board `createdAt` values ("Product Roadmap" < "Team Operations" deterministically). |
| 3 | RED — Undo click intercepted by a dialog overlay | TEST defect: missing `networkidle` settle after the archive (W8-spec pattern); added. |
| 4 | RED — afterAll fixture check: 6 cards ≠ 7 | **TEST defect (real, vacuity):** the shared `archiveCard` helper's `getByRole("button", { name: "Archive card" }).first()` matched the COMPLETED seeded card's face archive button (US-069 renders `aria-label="Archive card"` on completed card faces, and main content sorts before the sheet portal) instead of the sheet's — the seeded "Document safety invariants" was archived, and the spec's assertions could not detect it (vacuous). **Fix:** the rehearsal archives through the sheet-scoped button and pins the offer title + DB archivedAt transitions for BOTH the captured card and the seeded completed card (non-vacuous). Residual recorded: the shared helper stays ambiguous when a completed card shares the board — W8's committed boards never have one; the rehearsal uses the pinned flow. |
| 5 | RED — offer-label assertion on the status div | TEST defect: the offer title is the Undo button's aria-label, not the status text; asserted `toHaveAccessibleName("Undo archive of …")`. |
| 6 | RED — invite: "Invalid workspace ID" | **PRODUCT/FIXTURE defect (real):** the seeded workspace id was a UUID, but the app's workspaceId schemas (invitation/board/automation) require the BA 32-char format — invites (and board creation, and automation rules) were impossible in the demo workspace. **Fix:** the fixture seeds `randomUUID().replace(/-/g, "")` (32-hex, matches `^[A-Za-z0-9]{32}$`). |
| 7 (final, local DB) | **1/1 passed (42.6s)** | full path green; fixture preserved |
| 8 (fresh disposable DB — correction pass) | **1/1 passed (56.2s)** | self-provisioning: users absent → real sign-up + Mailpit verification + checked-in `demo:seed` inside the spec; full path green; fixture preserved; DB dropped after verification (correction-pass section) |

The green run proves, in one sitting on the real UI from the seeded state:
`/today` shows the seeded relative-date relationships (owner: +0 in Due Today,
+1 and +7 in Due This Week, the completed -3 card excluded, Overdue/Later
empty; the collaborator's -2 card never on the owner's view); the bare C
shortcut captures to the deterministic default (Product Roadmap → Inbox) and
the collaborator's already-loaded board shows the card LIVE (presence barrier
+ connect-resync settle + masking tripwire, `expectNoRoutePosts`); archive
card → Undo restores in place (offer pinned to the captured card, "Card
restored" status, DB `archivedAt` null, seeded completed card untouched,
tripwire clean); archive Inbox list → Undo restores the list with its three
cards (DB asserts); the owner invites a registered outsider through the real
members dialog and the outsider's already-loaded page shows the badge
increment live ("Notifications (1 unread)", tripwire clean, inbox lists the
invitation); and after the run the seeded logical shape is intact (2 boards /
5 lists / 7 cards — the rehearsal's own artifacts — the captured card + its
history rows, the outsider user + invitation — are removed in `afterAll`;
the demo workspace is never touched).

## Combined US-083 E2E gate + full suite (final close, 2026-08-02)

```bash
npx playwright test e2e/realtime-event-proof.spec.ts e2e/invitation-live-badge.spec.ts \
  e2e/today.spec.ts e2e/quick-capture.spec.ts e2e/undo-snackbar.spec.ts \
  e2e/platform-375.spec.ts e2e/demo-rehearsal.spec.ts
```

| Run | Result | Classification |
| --- | --- | --- |
| 1 (first, full tree) | **24 passed / 1 failed** | COMMITTED-spec flake: `undo-snackbar` non-goal test — the second `openCardDetail` never opened the sheet (click succeeded; DOM snapshot showed the plain board). Mechanism: the sheet-close's `router.replace` (strips `?cardId=`) had not COMMITTED when the reopen `router.push` ran, and Next dedupes a push to the same `?cardId=` URL — `networkidle` cannot cover a replace whose fetch hasn't started. Fix (assertion-preserving): wait for `cardId` to leave the URL before re-opening. Focused re-runs 3/3 green (one flaky pass with `--trace on` confirmed the timing character). |
| 2 (final) | **25/25 passed (6.7m)** | gate green on the final tree |

Then the full suite on the final tree — **FINAL provenance (post-self-provisioning
correction, 2026-08-02, exclusive shared-server lock, complete log at
/tmp/us083-full-e2e-final3.log):**

```bash
npm run test:e2e
# → 36 passed (10.2m) — the test count REMAINS 36 (all 36 E2E tests across
#   every spec, incl. the seven US-083 specs, on one fresh server)
```

This replaces the earlier pre-correction 36/36 provenance: the count is now
explicitly measured on the final self-provisioning tree. Correction chain from
this gate (first-run results recorded, no assertion/provisioning/Mailpit/
tripwire/cleanup/fixture-preservation gate weakened):

| Full-suite run | Result | Classification / fix |
| --- | --- | --- |
| 1 | **35 passed / 1 failed** | `realtime-card-create.spec.ts` (US-009 baseline) — Bob's page loaded but the `card:created` broadcast missed him. Root cause: the baseline spec's "confirmed present" was only the list-title visibility — no presence barrier — so under full-suite load Alice's emit could fire while Bob's socket was still JOINING the room (failure snapshot showed both avatars only at failure time). Fix (W1 discipline, assertion-preserving): await the connect-resync route POST and require TWO presence avatars on both pages before Alice acts. Focused reruns 2/2 green. |
| 2 | **35 passed / 1 failed** | `realtime-card-move.spec.ts` test 1 (US-009 baseline) — same root cause, same fix (presence barrier + resync settle before Alice drags). Focused rerun 2/2 green. |
| 3 (final) | **36 passed (10.2m)** | green on the final tree; zero server/browser errors in the run log |

**Observed, pre-existing, OUT of US-083 scope (recorded, not fixed):** during
run 1 the US-066 spec's tail triggered a transient `TypeError: Cannot read
properties of null (reading 'name')` in `lib/workspace-members.ts:41` — the
automation-log-retention spec leaves its module-level page open after the
test, and a socket-reconnect badge resync re-rendered the automation page
while the afterAll cleanup had deleted the workspace's owner user, so
Prisma's two-query `include` merge yielded `member.user = null`. No test
failed from it, the workspace was cleaned up normally, and it did not recur
in runs 2–3; it is a latent pre-existing race outside this story's gates.

No tripwire, DB assertion, overlay gate, or Mailpit verification was weakened
at any point.

## Final close — static gates + harness (2026-08-02)

```bash
npm test                       # → 90 files, 1400 tests, all passed (42.4s)
npx tsc --noEmit               # → clean (exit 0)
npx eslint <4 changed/new files>  # → clean
git diff --check               # → clean
```

Harness (`harness.db` edited only via `harness-cli`):

```bash
# before (recorded):
scripts/bin/harness-cli audit
# → Orphaned stories: 12 (US-083 not listed — has a trace)
# → Unverified stories: 33 (incl. US-083)
# → Unverified decisions: 3 (0011/0012/0019 — other epics, unchanged)
# → Entropy score: 100/100
scripts/bin/harness-cli query matrix --numeric | grep US-083
# → US-083 in_progress 1 1 1 0
scripts/bin/harness-cli query sql "SELECT id, verify_command FROM story WHERE id='US-083'"
# → verify_command still listed the phantom tests/server-actions/invitation-live.test.ts

# verify_command repair (decision 1): point at the real W2 surfaces
scripts/bin/harness-cli story update --id US-083 --verify "npx vitest run lib/today.test.ts lib/quick-capture.test.ts lib/undo.test.ts lib/invitation.test.ts lib/notifications/inbox.test.ts tests/server-actions/today.test.ts tests/server-actions/quick-capture.test.ts tests/server-actions/undo-restore.test.ts"
# → Story US-083 updated (the repaired subset itself ran green first: 8 files, 114 tests)

scripts/bin/harness-cli story verify US-083
# → Story US-083 verification: pass (114 passed)

scripts/bin/harness-cli story update --id US-083 --status implemented --unit 1 --integration 1 --e2e 1 --platform 1 --evidence "…"
# → US-083 implemented 1 1 1 1 (row confirmed via query sql)

scripts/bin/harness-cli trace --summary "US-083 final close: …" --story US-083 --agent pi-implementer --outcome completed --duration 300 --actions "…" --changed "…" --notes "…"
# → Trace #4 recorded (outcome completed)

# later, same session, same local-only harness.db (still gitignored, edited
# only via harness-cli):
# → Trace #5 recorded — correction pass (self-provisioning/CI-safe rehearsal)
# → Trace #6 recorded — final full-suite gate on the self-provisioning tree

# after (recorded):
scripts/bin/harness-cli audit
# → Orphaned stories: 12 (unchanged)
# → Unverified stories: 32 (US-083 LEFT the list — verify pass recorded)
# → Unverified decisions: 3 (unchanged)
# → Entropy score: 100/100 (capped; residual drift is other epics' rows)
scripts/bin/harness-cli query matrix --numeric | grep US-083
# → US-083 implemented 1 1 1 1
```

Delta: status `in_progress → implemented`; `platform_proof 0 → 1`; US-083
moved off the unverified list; completed close trace #4 recorded, then
trace #5 (correction pass — CI-safe/self-provisioning rehearsal) and trace #6
(final full-suite gate on the self-provisioning tree). The US-083
harness row's evidence now covers W1–W8 plus the W3 round-trip execution, the
continuous rehearsal, the platform proof, and the combined/full E2E gates.
All harness records above live in the local-only, gitignored `harness.db`
(edited only via `harness-cli`; never staged/committed).
Claims are branch-local: implemented and locally accepted on
`feature/us-083-demo-ready-daily-work-loop` (8 commits ahead of dev through
b272685); the PR/merge remains a separate authorization gate — no commit, PR,
push, or merge was performed by the close pass.

---

## Correction pass (reviewer findings, 2026-08-02)

A review found a shipping blocker in the rehearsal evidence: the spec assumed
pre-provisioned demo users + a seeded fixture, which CI (fresh Postgres +
Mailpit, no demo data) cannot provide. All six findings were corrected:

1. **Self-provisioning rehearsal (CI-safe).** `e2e/demo-rehearsal.spec.ts`
   no longer has any external precondition. Its setup (`ensureDemoFixture`)
   (a) ensures the two fixed demo users — signing them up through the REAL
   sign-up form + Mailpit verification when absent (Mailpit mailbox cleared
   first so the fixed-email verification link is unambiguous), or reusing
   them only after a real sign-in probe with the documented demo password
   (`demo-password-123`); wrong password or an existing-but-unverified user
   fails loudly with the remedy (delete the row / verify it), and (b)
   re-seeds the reserved fixture through the CHECKED-IN `npm run demo:seed`
   code path (`scripts/demo-fixture.ts` + `lib/demo-fixture.ts`) on every
   run, so each run starts fresh and same-day; the seed fails closed on a
   mismatched ownership marker. No /tmp prerequisite, no silent skip.
2. **Workspace-scoped cleanup.** The rehearsal's `afterAll` deletes ONLY rows
   created by that rehearsal, scoped by the demo workspace id (card + history
   subqueries join through list → board → workspace; the invitation delete is
   scoped by email AND organizationId; the outsider user carries a unique
   per-run email). No title-global DELETEs remain.
3. **Focused unit coverage for the fixture contracts** — the W3 test file
   `tests/demo-fixture.test.ts` (8 pre-existing safety cases, committed with
   827f222) gained 4 contract cases: the workspace id matches the app's
   32-char format; board `createdAt` is pinned 1ms apart with Product Roadmap
   first; the logical shape 2/5/7; and the write path persists both contracts.
   RED→GREEN demonstrated: with both fixture fixes temporarily reverted the
   suite went **3 failed / 9 passed** (exactly the two contract tests + the
   write-through test; the pre-existing safety cases stayed green), restored
   **12/12 passed**.
4. **TEST_MATRIX unit cell restored**: W3 is covered by
   `tests/demo-fixture.test.ts` and is listed again in the unit-proof column.
5. **SABOTAGE-marker wording scoped** to production/test code everywhere in
   the packet (the packet's own evidence narrative legitimately uses the
   word; `grep -c SABOTAGE` over production/test code at handback: 0).
   Durability stays harness-local: `harness.db` is gitignored and edited only
   via `harness-cli`; `harness.db.bak-20260714-105049`, `.demo/`, and repo
   `tmp/` are never staged/committed/deleted; bulky /tmp logs are NOT
   archived into Git — the command/result tables in this document are the
   durable record.
6. **Protected paths untouched**; explicit path-scoped staging discipline
   remains for the eventual commit. Backup note: the main backup file
   `harness.db.bak-20260714-105049` stayed PRISTINE (163840 bytes, mtime
   unchanged); the `-shm` and zero-byte `-wal` sidecar files beside it were
   READER ARTIFACTS created by SQLite during `harness-cli` audits of this
   session — they remain untracked/excluded and are neither deleted nor
   staged.

### Fresh-database proof (the decisive CI-safety check, 2026-08-02)

A genuinely disposable Postgres database was created, migrated, exercised,
and dropped — nothing else shared its state:

```bash
# 1. create a disposable database on the same Postgres instance (app creds,
#    maintenance DB): planora_ci_proof_1785669124108
# 2. apply the real migrations to it:
DATABASE_URL="postgresql://…@localhost:5432/planora_ci_proof_1785669124108?schema=public" \
  npx prisma migrate deploy
# → All migrations have been successfully applied.
# 3. pre-run state verified: users = 1 (the migration-embedded
#    automation@planora.internal — unrelated), workspaces = 0 → the demo
#    users and the fixture were genuinely absent.
# 4. Mailpit mailbox cleared; port 3000 verified free; Playwright boots its
#    own fresh server (stale-server policy):
DATABASE_URL="postgresql://…@localhost:5432/planora_ci_proof_1785669124108?schema=public" \
  npx playwright test e2e/demo-rehearsal.spec.ts
# → 1 passed (56.2s). The spec self-provisioned: both demo users signed up
#   through the real form + Mailpit verification, then the checked-in
#   demo:seed ran inside the spec ("Seeded reserved demo workspace:
#   planora-us083-demo … Logical shape: 2 boards, 5 lists, 7 cards"), then
#   the full locked path (today → capture → realtime → undo ×2 → invite).
# 5. post-run verification on the fresh DB: fixture shape 2/5/7; demo users
#    present + emailVerified=true; zero rehearsal leftovers (no
#    'Rehearsal capture card' card/history rows, no rehearsal-outsider
#    users/invitations). The pre-existing local DB was untouched (demo
#    workspace id + shape unchanged).
# 6. DROP DATABASE "planora_ci_proof_1785669124108" → dropped; no
#    planora_ci_proof_* database remains.
```

Then the combined US-083 E2E gate was re-run on the final tree (local DB —
exercises the REUSE path: existing users pass the real sign-in probe, the
fixture is re-seeded same-day): **25/25 passed (6.8m)** — the final count
reflects the self-provisioning spec. The DEFAULT FULL SUITE then ran green on
the same final tree: **36/36 passed (10.2m)** — count unchanged (36),
post-self-provisioning provenance in the combined-gate section above
(correction chain 35/1 → 35/1 → 36/36; two US-009 baseline specs gained the
W1 presence barrier — recorded there). Targeted unit/static gates re-ran:

```bash
npx vitest run tests/demo-fixture.test.ts   # → 12/12 passed (8 pre-existing + 4 contract cases)
npm test                                    # → 1404 passed (90 files)
npx tsc --noEmit                            # → clean
npx eslint <changed files>                  # → clean
git diff --check                            # → clean
```

Branch-local claims only; no commit, push, PR, or merge was performed.
