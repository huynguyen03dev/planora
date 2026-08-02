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
