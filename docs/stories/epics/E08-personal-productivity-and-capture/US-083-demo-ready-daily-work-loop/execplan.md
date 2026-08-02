# Exec Plan — US-083 Demo-Ready Daily Work Loop

## Goal

Deliver one demo-ready daily work loop, verifiable end to end: repeatable
demo state → `/today` → global quick capture → cross-client realtime → archive
card/list with undo → live invitation badge — while reconciling the tracker/
documentation truth the loop depends on. One story, one final status; eight
internal workstreams (W1–W8) with independent exit gates so each is checkable
on its own.

## Scope

In scope (owner-locked):

- Stage 1 — foundation/demo reliability (proof & determinism):
  - W1 cross-client E2E proof for `card:updated`, `list:created`,
    `list:updated`, `list:deleted`, `notification:new`, `analytics:refresh`.
  - W2 live invitation arrival (inbox/bell badge) + real two-account invite
    flow proof.
  - W3 repeatable demo seed/reset (logical fixture shape/counts/relative
    dates + machine-readable manifest, not identical UUIDs) + enforced,
    documented stale-server restart protocol.
  - W4 automation execution-log retention claims reconciled with actual
    durable schema/behavior.
  - W5 touched tracker/docs/TEST_MATRIX truth reconciled (incl.
    `docs/product/overview.md`, `docs/product/notifications.md`), with
    harness audit evidence proportionate to scope.
- Stage 2 — daily-work UX (visible features):
  - W6 Today / My Work cross-workspace personal read model (archive/
    membership/isolation rules; **no new table**), incorporating the retained
    US-077 packet ACs **by exact reference** (self-audit table in overview).
  - W7 global quick capture via existing `createCardAction`, supporting `C`
    plus `Cmd/Ctrl+K`, incorporating the retained US-078 packet ACs **by
    exact reference**.
  - W8 undo snackbar for archive-card and archive-list only, implemented by
    the real restore Server Actions (`restoreCardAction` /
    `restoreListAction`), with the parent-list-archived race failing safe.
- Absorption bookkeeping: US-077/US-078 retired as separate work; their full
  ACs stay authoritative in the retained packets and are incorporated by
  reference — W6/W7 cannot close until every referenced AC maps to evidence.
  Decision 0031 (Accepted) governs undo bounds.

Out of scope (locked):

- US-076, US-079, US-080, US-081, US-082 work.
- AI, external email/form intake, public API, webhook, background queue, new
  domain table.
- Permanent-delete undo, member-removal undo, rule/label-deletion undo,
  board/workspace-deletion undo, re-create-based pseudo-undo.
- Member-list realtime sync.
- Schema migrations (none planned in any workstream).

## Risk Classification

Risk flags:

- `authorization` — W2 (invitation visibility), W6 (cross-workspace read
  isolation), W8 (undo rides real restore actions' permission gates).
- `public_contracts` — realtime event payloads/typed map, existing action
  signatures, `/today` route.
- `existing_behavior` — archive/restore (US-016/US-074), `createCardAction`,
  bell badge, inbox; all already implemented and test-covered.
- `weak_proof` — the six events lack dedicated cross-client proof; invite
  flow has no E2E; retention claims drift from schema.
- `multi_domain` — realtime, personal productivity, notifications/
  invitations, automation docs, trackers.

Hard gates:

- No schema/migration work may start without a new decision + human
  confirmation (W6 forbids it; W4 documents only).
- Any new realtime event (W2) must land in the typed event map
  (`lib/realtime/types.ts`) with a socket-room authorization review — the
  room-auth boundary (US-062 tg1) is a hard gate.
- Undo scope is fixed by Decision 0031; widening it requires a human call.

## Work Phases

Ordered foundation-first: proof and repeatable demo state precede visible
features, so every feature demo is backed by the Stage 1 harness.

### Implementation progress

- W3 demo fixture: implemented on the feature branch with safe `demo:seed` /
  `demo:reset`, verified-user preflight, strict workspace ownership marker, and
  generated current-run manifest. Operator contract: `docs/DEMO_RUNBOOK.md`.
- W3 stale-server Playwright policy: local and CI E2E runs now start fresh by
  default; reuse requires the explicit local-only `test:e2e:reuse` command.
  `docs/DEMO_RUNBOOK.md` records the restart and port-collision protocol.

### Live execution ownership and locks

| Scope/resource | Owner | State | Release condition |
| --- | --- | --- | --- |
| W1 E2E spec/helpers and focused validation | `w1-realtime-impl` | Handback | Stable handback delivered: hardened tripwire green, analytics sabotage RED at the observer assertion, final six-event GREEN (run log rows 15–17) |
| Playwright server, PostgreSQL fixture data, Mailpit | `w1-realtime-impl` | **Released** | Final correction handback — the E2E seat is free for the next owner |
| W2 E2E spec/helpers and focused validation (incl. all W2 Playwright runs and their fixture data) | `w2-invitation-live-badge` | **Handback — released** | W2 handback: live-badge proof green, sabotage RED at the observer assertion (run log rows 8–12), sabotage fully restored, seat free for W4/W5 |
| W4 doc reconciliation + focused E2E evidence (`e2e/automation-log-retention.spec.ts`) | `w4-retention-reconcile` | **Handback — released** | W4 handback (2026-08-02): focused retention spec green (1 passed, 32.5s), stale claims fixed with schema/migration/E2E citations, `git diff --check` clean; seat free for W5 |
| W5 tracker/harness truth reconciliation (backlog.md, IN-04, TEST_MATRIX, product docs, harness story/decision rows, audit evidence) | `w5-tracker-reconcile` | **Handback — released** | W5 handback (2026-08-02): audit evidence recorded in validation.md, touched files carry no claim contradicting harness rows, decisions 0029/0030 durable rows added, US-066/075 harness rows reconciled to implemented (US-075 `story verify` pass), `git diff --check` clean; seat free for W6 |
| W6 E2E focused run (`e2e/today.spec.ts`) + Playwright shared server, local Postgres/Mailpit, port 3000 | `today-e2e` | **Handback — released** | W6 handback (2026-08-02): focused today spec 4/4 green (1.1m, run log in the W6 section), one arrange-defect repair in `e2e/helpers/app.ts` (`createWorkspace` user-menu path for members with workspaces — RED mechanism in validation.md), server stopped, port 3000 free, fixtures cleaned, `git diff --check` clean; seat free for W7 |

Read-only discovery for W2 and W4/W5 may continue, but implementation stays
sequenced W1 → W2 → W4/W5. Protected inherited artifacts
`harness.db.bak-20260714-105049` and `tmp/` remain out of scope.

### W1 implementation progress (handback evidence)

`e2e/realtime-event-proof.spec.ts` — one dedicated spec, six isolated
two-client tests (one per event), each: presence barrier (two avatars on both
sides → Bob's socket joined the board room) → connect-resync settle barrier →
real Server Action from A → live observer assertion on B with no navigation,
reload, or reconnect in the assertion path. Two narrowly scoped helpers added
(`renameList`, `archiveList` in `e2e/helpers/app.ts`; `getWorkspaceSlug` in
`e2e/helpers/db.ts`); `postComment` gained an optional mention-listbox dismiss.
One minimal production hook: `data-testid="flow-chart-created-total"` on the
FlowChart summary figure (the DOM otherwise offers no stable locator for that
metric — the "Created" label text appears twice on the card).

Masking discovery (recorded because it shapes the barriers): the header's
connect-time unread resync (`getUnreadNotificationCountAction`, US-062 mn8 —
since renamed `getInboxBadgeCountsAction` by US-083 W2, which folds the
invitation count into the same single-POST action) is
a Server Action that re-renders the CURRENT route and returns a fresh RSC
payload. A first analytics sabotage run passed green because the resync landed
after the trigger card and re-rendered the dashboard with the new card's data
— masking the removed emit. The barriers therefore await Bob's first route
POST (the resync) before Alice acts.

Correction pass — residual reconnect masking closed with a tripwire. An
independent audit identified the remaining gap: after the connect barrier, a
mid-proof socket.io reconnect runs the production onConnect fallbacks (header
unread-resync Server Action + board provider `router.refresh()` on reconnect),
re-rendering from persisted DB state and masking a removed emit without any
browser reload. Demonstrated (Demo A, pre-tripwire): with `notification:new`'s
emit removed and a forced mid-window reload (the deterministic harness-level
trigger for the same connect→resync chain; short offline emulation does NOT
drop the established socket.io WS — the client only detects loss via its 20s+
ping timeout), the observer assertion PASSED from DB state and the test went
GREEN once the old load-only guard was disabled — the exact gap. The fix is a
harness-level masking tripwire (`armProofTripwire` in the spec): for every
proof window it counts full page loads, socket.io websocket opens/closes, and
POST re-renders of the current route; armed before the page loads, baseline
after the connect/resync barrier, checked after the observer assertion. Any
delta fails the test. Demo B: same sabotage + forced reload with the tripwire
armed → RED at `notification:new proof window: full reload during the proof
window` (Expected 1, Received 2) — the tripwire detects the masking mechanism.
The reconnect case is covered structurally: a socket.io reconnect necessarily
opens a new websocket or closes the old one, and the onConnect fallbacks
additionally produce a route POST. No production behavior was added for the
tripwire; the only production hook remains the FlowChart data-testid.

Final correction — route-POST tripwire armed for analytics too. An audit
flagged the one remaining theoretical transport hole: a socket.io reconnect
over the POLLING transport produces no websocket events at all (the WS
counters are inert), yet the onConnect header unread-resync still POSTs to the
current route and re-renders from DB. Also corrected: the earlier rationale
claimed the debounce `router.refresh()` was a legit route POST — on the wire
it is an RSC GET (observed: `GET /workspace/{slug}/dashboard` at ~250-300ms
after the action, while the only dashboard-route POST is the connect-time
resync), so a dashboard proof window has zero legitimate route POSTs. The
tripwire now arms `routePosts` with the dashboard pathname in the analytics
test as well: any POST to the dashboard route inside the window is a
masking-capable resync, closing the polling-transport hole.

Same-pass finding — rename-autosave race (not a masking path, but a real
flake it replaced): a full-suite run exposed `card:updated` failing
intermittently with the emit payload titled "Original cardRenamed card".
`fill()` sets a controlled input's native value in one shot and can race
React's state commit; Enter→blur then saved the STALE draft with the caret
append. Fixed by driving renames through real keystrokes (select-all + type,
`ControlOrMeta+A` + `pressSequentially` in `renameOpenCard`/`renameList`),
which commits each keystroke through React's onChange. After the fix:
`card:updated` 5/5 and `list:updated` 3/3 isolated passes (previously ~2/5
failures).

Sabotage evidence — every run with the emit body commented out in
`lib/realtime/server.ts`, restored immediately after, `git diff` empty at the
end. Focused command per event:
`npm run test:e2e -- e2e/realtime-event-proof.spec.ts -g "<event>"`.

| Event (emit removed) | Observed failing assertion |
| --- | --- |
| `card:updated` | `expect(cardInListById(bobPage, todo, "Renamed card")).toBeVisible()` — element(s) not found (old title stays) |
| `list:created` | `expect(bobPage.getByText(newListTitle, { exact: true })).toBeVisible()` — element(s) not found |
| `list:updated` | `expect(bobPage.getByText("In Progress", { exact: true })).toBeVisible()` — element(s) not found |
| `list:deleted` | `expect(listColumnById(bobPage, lists["To Go"])).toHaveCount(0)` — received 1 |
| `notification:new` | `expect(bobPage.getByRole("button", { name: "Notifications (1 unread)" })).toBeVisible()` — element(s) not found |
| `analytics:refresh` | `expect(flowChartCreatedTotal(bobPage)).toHaveText("1")` — element(s) not found (FlowChart stays in empty state) |

Exact run log (all personally observed; focused command per row:
`npm run test:e2e -- e2e/realtime-event-proof.spec.ts [-g "<event>"]`):

| # | Code state | Run | Result |
| --- | --- | --- | --- |
| 1 | initial spec | full suite | 6 passed |
| 2 | post analytics-masking fix, pre-barrier | full suite | 5 passed, 1 failed (card:updated flake) |
| 3 | post connect-resync barrier | full suite | 6 passed |
| 4 | post connect-resync barrier | full suite | 6 passed |
| 5 | post connect-resync barrier | 6× emitter sabotage (`card:updated`→`analytics:refresh`) | 6× 1 failed — observer assertions red (table above) |
| 6 | post barrier, post sabotage restore | full suite | 6 passed |
| 7 | Demo A (gap): `notification:new` emit removed + forced mid-window reload, old load guard disabled | focused `-g notification:new` | **1 passed — observer assertion green from DB state (the gap)**; with the load guard enabled the observer assertion still passed and only the guard failed |
| 8 | Demo B (tripwire): same sabotage + reload, tripwire armed | focused `-g notification:new` | **1 failed — RED at the tripwire**: `notification:new proof window: full reload during the proof window` (Expected 1, Received 2) |
| 9 | tripwire wired into all six tests | full suite | 5 passed, 1 failed — exposed the rename-autosave race (see above; ws tripwire counts clean — not socket-related) |
| 10 | rename helpers race-fixed | focused `card:updated` ×5 | 5× 1 passed |
| 11 | rename helpers race-fixed | focused `list:updated` ×3 | 3× 1 passed |
| 12 | final tripwire code | full suite | 6 passed |
| 13 | final tripwire code | 6× emitter sabotage | 6× 1 failed — observer assertions red (table above, re-verified) |
| 14 | post sabotage restore | full suite | 6 passed |
| 15 | hardened tripwire (route-POST armed on dashboard) | focused `-g analytics:refresh` | 1 passed — wire: initial GET → barrier-awaited resync POST → debounce delivery is an RSC GET (no route POST in window) |
| 16 | hardened tripwire | focused `-g analytics:refresh`, `emitAnalyticsRefresh` removed | 1 failed — RED at the observer assertion (`flowChartCreatedTotal` toHaveText "1", element not found), tripwire clean |
| 17 | post sabotage restore | full suite | 6 passed |

Typecheck, changed-file ESLint, srcwalk review, and `git diff --check` all
clean after every pass. `lib/realtime/server.ts` fully restored (`git diff`
empty) after each sabotage/demo run and at handback.

### W2 implementation progress (handback evidence)

**Design decisions (locked with evidence):**

- `invitation:new` is a typed user-room event with payload `{ invitationId }`
  ONLY — minimal and non-sensitive. `emitInvitationNew(inviteeId, payload)`
  targets `ROOMS.user(inviteeId)` exclusively (unit-pinned: never a
  board/workspace/global target). The header increments the invitation half of
  the badge; the inbox keeps reading the `invitation` table on open (DB-truth),
  so no invitation data ever rides the wire.
- `inviteMemberAction` resolves the registered invitee by normalized email
  (`mode: "insensitive"` — a defensive superset) and emits best-effort in its
  own try/catch: an unregistered email gets no signal; a lookup/emit failure
  never fails the invite.
- **BA email-casing verified at source + empirically:** better-auth 1.5.5
  LOWERCASES user emails at sign-up (`sign-up.mjs:165`,
  `const normalizedEmail = email.toLowerCase()`) and invitation emails on
  create (`crud-invites.mjs:75`); acceptance compares case-insensitively. The
  E2E signs Bob up mixed-case (`BoB-…@E2e.Test`) and asserts the stored email
  is the lowercase form — the flow works from mixed-case input at the invite
  boundary. (Initial as-typed hypothesis was disproven by the run log: the
  verify-email token carried the lowercased address.)
- **Resync is atomic and single-POST:** the header's connect-time resync now
  reads BOTH badge halves in one Server Action
  (`getInboxBadgeCountsAction`, replacing `getUnreadNotificationCountAction` —
  its only caller was the header). Rationale: two separate resync actions
  would fire two route POSTs at connect and break the W1 barrier/tripwire
  single-POST contract. W1's six proofs still pass unchanged (re-verified).
- **Masking guards for this proof:** (1) the W1-style tripwire on BOTH
  observer pages (reload / socket.io websocket open-close / route POST), armed
  before load, baselined after the connect-resync settle, checked after the
  observer assertions; (2) ordering — the live badge assertion happens BEFORE
  the dropdown is ever opened, because the dropdown's open-time
  `/api/invitations/pending` fetch writes the badge count from DB and would
  mask a removed emit; (3) the settle barrier awaits the connect-time badge
  resync before Alice acts.

**RED → GREEN → sabotage RED (all personally observed):**

| # | Code state | Run | Result |
| --- | --- | --- | --- |
| 1 | tests only (no production code yet) | `npx vitest run lib/realtime/server.test.ts lib/invitation.test.ts` | **RED** — 7 failed (`emitInvitationNew` / `getPendingInvitationCount` missing) |
| 2 | tests only | `npx vitest run tests/server-actions/workspace.test.ts` | **RED** — W2 case fails at the `findFirst` query-shape assertion (action not implemented) |
| 3 | tests only | `npx vitest run components/authenticated-header-actions.test.tsx` | **RED** — 3 failed (no `invitation:new` subscription; old action name imported) |
| 4 | production implemented | focused vitest (4 files) | **GREEN** — 30/30 |
| 5 | production implemented | `npm test` | **GREEN** — 75 files, 1221 tests |
| 6 | production implemented | `npx tsc --noEmit` / eslint changed files / `git diff --check` | clean |
| 7 | production implemented | `npm run test:e2e -- e2e/invitation-live-badge.spec.ts` | **GREEN** — live badge, inbox, accept, Carol denial all pass (37.8s) |
| 8 | `emitInvitationNew` call commented in `workspace/actions.ts` (sabotage) | same focused spec | **RED at the intended observer assertion**: `expect(bell(bobPage)).toHaveAccessibleName("Notifications (1 unread)")` — Received `"Notifications"`; tripwire clean (no reload/reconnect/route-POST masking) |
| 9 | sabotage restored | `git diff` shows only the real W2 change; no SABOTAGE marker | restored |
| 10 | restored | `npm run test:e2e -- e2e/invitation-live-badge.spec.ts e2e/realtime-event-proof.spec.ts` | **GREEN** — 7/7 (W2 + all six W1 proofs; combined resync preserves the single-POST connect barrier) |
| 11 | restored | `npm run test:e2e` (full suite) | **GREEN** — 18/18 (6.6m) |
| 12 | restored | `npm test` (re-run after doc/comment edits) | **GREEN** — 1221/1221 |

**Environment finding (pre-existing, not caused by W2, fixed reversibly):**
`node_modules/node_modules/` (created 2026-07-28) shadowed the root package
tree for anything imported from inside `node_modules/@radix-ui/*` (Node's
resolution walk hits `node_modules/node_modules` before the root), so every
component test rendering a Radix Popover failed with
`TypeError: Cannot read properties of null (reading 'useMemo')` —
reproduced with a minimal radix-only probe and on committed, untouched tests
(`board-filter.test.tsx`, 5 failed). All 665 nested entries have identical
root twins. Fix: `mv node_modules/node_modules /tmp/planora-node_modules-shadow-20260802`
(reversible move, nothing deleted) — probe, board-filter, and the full
components project then pass. Root cause recorded; the shadow dir stays in
`/tmp` for the next owner to delete or inspect.

**No temporary instrumentation:** the only production hooks are the W2 code
itself (`invitation:new` type+emitter, action emit, combined resync action,
header subscription) plus the pre-existing W1 `flow-chart-created-total`
testid. No debug logs, no forced delays, no test-only branches.

### W4 implementation progress (handback evidence)

W4 reconciles the automation execution-log retention contract with the actual
durable schema/behavior. All claims below were re-derived from production
evidence (schema, migrations, code, tests) — the prior factual map was treated
as a lead only.

**Durable behavior (decisive evidence):** `prisma/schema.prisma`
(`RuleExecutionLog`, lines 481–506): `workspaceId` + `ruleName` denormalized
(NOT NULL), `ruleId String?`, workspace FK `onDelete: Cascade`, rule FK
`onDelete: SetNull`, `@@unique([ruleId, dedupKey])`, `error String?`,
`metadata Json?`. Migration
`20260707021956_automation_logs_survive_rule_deletion` (committed `dc1fd0a`)
switched the rule FK `CASCADE → SET NULL`, backfilled the denormalized columns
before NOT NULL, and added the `[workspaceId, executedAt]` index — so logs
**survive rule deletion** and are cleared **only by workspace deletion**. No
production code deletes/prunes log rows (no `ruleExecutionLog.deleteMany`
outside the generated client; no retention job). Every evaluation writes **one**
row per matched rule per event (`lib/automation/evaluator.ts` `logExecution`
+ claim-first finalize; `lib/automation/effects.ts` `logRuleExecutionError`
post-rollback; `actionType` is always `"sequence"`); per-step audit lands in
`metadata.steps` only when ≥1 step failed (decision 0030). No `errorDetails`
column exists. End-to-end runtime truth re-proven on 2026-08-02:
`npm run test:e2e -- e2e/automation-log-retention.spec.ts` → **1 passed (32.5s)**
(create rule → trigger → log visible → delete rule → reload → log still shows
the denormalized rule name, no fallback text; fresh dev server per the W3
policy, fixture cleaned up, E2E lock released).

**Claims fixed (stale → current evidence):**

| Stale claim (was) | Decisive current evidence | Fix landed in |
| --- | --- | --- |
| TEST_MATRIX "Known discrepancy: `deleteRuleAction` hard-deletes and `RuleExecutionLog` cascades (`onDelete: Cascade`), so deleting a rule removes its logs" | Migration `20260707021956_automation_logs_survive_rule_deletion` (SetNull + denormalization); schema lines 481–506; `e2e/automation-log-retention.spec.ts` re-run green; log panel now shows a `(deleted)` chip, the "Deleted rule" fallback is gone; delete-confirm copy matches behavior | `docs/TEST_MATRIX.md` row "Automation rule management Server Actions" |
| US-066 execplan "Flagged discrepancy … the UI-copy vs schema conflict is left for the human to resolve" | Same migration + E2E; US-066 validation.md already records "RESOLVED 2026-07-07 (keep-logs)" | US-066 execplan step 9 narrative (annotated RESOLVED) |
| US-066 design model block: `ruleId String` NOT NULL, rule FK `onDelete: Cascade`, no `workspaceId`/`ruleName`, `metadata` comment `{ dryRun?; matchedConditions? }` | Shipped schema (above) + migration | US-066 design.md domain bullet + `RuleExecutionLog` block (now the shipped shape) |
| `docs/product/automation.md`: "writes `RuleExecutionLog` rows (one per action step)" | `lib/automation/evaluator.ts` / `effects.ts`: one row per rule evaluation; `metadata.steps` only on failure (decision 0030) | `docs/product/automation.md` Model section |
| `docs/product/automation.md` US-075 roadmap: diagnostic details `errorDetails` | No such column; actual fields `error` (summary string) + `metadata.steps` (structured codes); US-075 implemented (decision 0030) | `docs/product/automation.md` US-075 section (now implemented-state) |
| "Append-only" wording with no documented window | No prune/retention job exists; rows clear only via workspace cascade | `docs/product/automation.md` Model section + US-066 design.md (window explicitly documented as absent) |

No new retention window, `errorDetails` field, or cascade behavior was
invented — every fixed claim cites the schema/migration/code/E2E evidence it
now matches. No code or schema changes were needed; the product contract and
the docs now agree (the delete-confirm copy "Past execution-log entries are
kept" was already accurate post-fix).

### W5 implementation progress (handback evidence)

W5 reconciles the tracker/docs/TEST_MATRIX truth the story depends on and
records harness audit evidence proportionate to scope. All claims below were
personally observed on 2026-08-02 via the harness CLI against `harness.db`
(`harness.db.bak-20260714-105049` and `tmp/` untouched).

**Durable-layer changes (harness story rows):**

- `harness-cli story update US-083 --status in_progress --unit 1 --integration 1 --e2e 1 --platform 0`
  — Stage 1 W1–W5 landed (W4/W5 uncommitted on the feature branch); evidence
  field records the W1–W3 commits, the W4 E2E reference, and this pass;
  notes field rewritten to in-progress state (via
  `query sql` UPDATE scoped to `id = 'US-083'` — `story update` exposes no
  notes flag).
- `harness-cli story update US-066 --status implemented` — was `planned` with
  zero proof flags while TEST_MATRIX marks the engine/scheduled/rule-mgmt/UI
  rows implemented (PR #78 + dc1fd0a). Evidence: TEST_MATRIX case counts
  (101/8/34 + US-068 RTL) + `e2e/automation-log-retention.spec.ts` green
  2026-08-02. No verify_command configured (none exists for US-066).
- `harness-cli story update US-075 --status implemented --unit 1 --integration 1`
  — was `planned` while the failure-isolation work landed via PR #92
  (cc23e69 + dc0fb4a) and decision 0030 is Accepted. `harness-cli story verify US-075`
  ran the configured command → **pass** (4 tests, 1.33s;
  `tests/server-actions/automation-failure-isolation.test.ts`);
  `last_verified_at`/`last_verified_result` recorded. E2E proof still absent
  (documented gap, TEST_MATRIX row).
- `harness-cli query sql "UPDATE story SET notes = '…' WHERE id = 'US-075'"`
  — US-075 notes field rewritten from the stale "Planned / implementation
  unstarted" to the implemented/verified + decision 0030 state (same
  scoped `query sql` UPDATE mechanism as the US-083 notes; `story update`
  exposes no notes flag).
- `harness-cli trace --summary "…" --story US-083 --agent pi-implementer
  --outcome completed --actions '…' --changed '…' --notes "…"` — this pass
  recorded as trace id 3 (US-083); the trace is what clears US-083 from the
  orphaned list (in_progress status alone keeps it orphan-class until a
  linked trace exists).

**Decision rows (recorded drift closed):** decisions 0029 and 0030 existed
only as `docs/decisions/*.md` files with **no durable rows**. Added via
`harness-cli decision add` with doc paths + status accepted:

- `0029-permanent-delete-cloudinary-attachment-guard` — Permanent Delete
  Cloudinary Attachment Guard.
- `0030-automation-rule-failure-isolation-semantics` — Automation Rule Failure
  Isolation Semantics.

Verified with `harness-cli query decisions` (both rows present, doc_path set)
and `harness-cli query sql`.

**Tracker files reconciled (changed this pass):**

| File | Stale claim (was) | Now |
| --- | --- | --- |
| `docs/stories/backlog.md` | US-083 `planned (unstarted)`; US-075 `planned (unstarted)`; E08 `planned (US-083 planned)` | US-083 `in progress (Stage 1 W1–W5 landed — W4/W5 uncommitted on the feature branch; W6–W8 pending)`; US-075 `implemented (PR #92, decision 0030; E2E not implemented)`; E08 `planned (US-083 in progress)` |
| IN-04 | Status line `planned — implementation unstarted`; US-083/US-075 rows `planned (unstarted)` | in-progress status line; rows match backlog.md |
| `docs/TEST_MATRIX.md` | US-083 row said `W2 landed (uncommitted on the feature branch)` (W2 is committed 3f238be); E2E cell `planned (W6–W8)`; Status cell `planned` | W2 `(committed 3f238be)`; E2E `implemented (W1, W2, W4); planned (W6–W8)`; Status `in_progress`; W5 evidence sentence appended |
| `docs/product/overview.md` | `US-083 (high-risk, planned)` | `(high-risk, in progress)` + Stage 1/2 split |
| `e2e/realtime-comment-list-reorder.spec.ts` | header claimed the six events still lack dedicated cross-client proof | re-pointed to `e2e/realtime-event-proof.spec.ts` (W1, committed 937e75f) |
| US-083 packet (overview/execplan/validation) | W5 row unwritten; W5-audit evidence absent; W1–W3 bullets recording-time only | W5 marked landed; audit/matrix evidence recorded (validation.md); closure markers on W1–W3 bullets |

**Scope decision (governing docs, not blind expansion):** execplan W5 names
`docs/stories/backlog.md`, IN-04, TEST_MATRIX, `docs/product/overview.md`,
`docs/product/notifications.md`, harness story rows, decision rows
(0029/0030), US-077/078 retirement wording, and audit evidence. US-066/075
harness rows are stale (planned vs TEST_MATRIX implemented) and TEST_MATRIX
rows are touched by this story — the exit gate "touched files contain no claim
that contradicts the harness rows they reference" makes reconciling them
required, not optional. `docs/product/notifications.md` was already current
(W2 committed 3f238be rewrote the unified-inbox section; verified no stale
claim remains). US-077/078 harness rows were already `retired` with absorption
notes. **US-075 packet status rewritten to implemented** (the packet is a
W4-touched file — AC3 edit — and the gate requires touched files to carry no
claim contradicting harness rows; its "planned — implementation unstarted"
Status/Evidence/Future-Decision-Gate lines are now implemented-state with
PR #92 + decision 0030 + verify-pass citations). **US-066 overview.md status
was rewritten in the W5 closure pass** ("planned (high-risk) — new feature
intake" → implemented with PR #78 + dc1fd0a citations): the packet was not in
the W5 working-tree diff (only design.md/execplan.md were, and neither
carries a status line), so the W5 gate did not reach it — the closure pass
removed the contradiction before handback.

**Audit evidence (personally observed, before → after):**

| Metric | Before | After story-row/decision reconciliation | After W5 trace recorded (final) |
| --- | --- | --- | --- |
| Orphaned stories (planned/in-progress, no traces) | 15 | 13 | 12 |
| Unverified stories | 34 | 33 | 33 |
| Unverified decisions | 3 | 3 | 3 |
| Open backlog without outcomes | 0 | 0 | 0 |
| Stale stories / broken tools | 0 / 0 | 0 / 0 | 0 / 0 |
| Entropy score | 100/100 | 100/100 | 100/100 |

US-066 left only the orphaned list — via its status change (planned →
implemented; it has no verify_command, so it was never on the unverified
list). US-075 left the orphaned list via status and the unverified list via
`story verify` (pass). US-083 left
the orphaned list once this W5 pass was recorded as a trace (verified via
grep of the full audit output; US-083 remains on the unverified list because
its verify_command is the W6–W8 file subset that cannot run until those files
land — see validation.md). The three unverified decisions (0011/0012/0019)
are pre-existing and out of W5 scope. Residual audit drift after W5: the 12
remaining orphaned stories and 33 unverified stories are other epics' rows,
not touched by this story; they are recorded here as known broader drift, not
fixed in W5.

**Static checks** — `git diff --check` clean on the W5 doc diff.

> **Non-blocking chronology annotation (accepted 2026-08-02):** the W5
> command list in validation.md spans **two moments and is not
> chronological**. The US-075 notes UPDATE and the US-066 overview.md status
> rewrite were **closure-pass work after trace id 3 (after the W5 audit)**;
> they are grouped with the pre-trace commands for readability. The audit
> numbers above reflect the pre-closure state; the closure pass removed the
> last two residual contradictions and is documented in validation.md's
> residual-gaps list.

### W6 implementation progress (handback evidence)

W6 (Today / My Work cross-workspace read model) landed 2026-08-02,
uncommitted on the feature branch. RED-first TDD: the five W6 test files
were authored against non-existent production modules and observed RED
before implementation (`lib/today` module-missing, `lib/today-query`
module-missing, `today-view`/`today-nav-link` module-missing, and a
behavioral RED — the authenticated layout rendered but had no "Today" link),
then GREEN: `lib/today.test.ts` + `tests/server-actions/today.test.ts`
23/23, components RTL 12/12, adjacent header suite 4/4, `tsc --noEmit`
clean (one correction pass: the generated `Card` has no direct `board`
relation — the select goes through `list.board`), changed-file ESLint
clean, `git diff --check` clean. `e2e/today.spec.ts` authored (four buckets
across two workspaces incl. the exact +7/+8 boundary arrangements,
deep-link sheet, card-archive + board-archive refresh removal, unassigned
excluded, foreign-workspace exclusion — an assigned card in a workspace the
viewer is not a member of never appears — both empty states). E2E run
2026-08-02 under the shared-server lock: **4/4 green (1.1m)** — run log
below.

Exact run log (2026-08-02, personally observed; command
`npm run test:e2e -- e2e/today.spec.ts`):

| # | Code state | Run | Result |
| --- | --- | --- | --- |
| 1 | authored spec, pre-repair | full spec | **1 failed, 3 passed** — RED at test 1's second `createWorkspace(page, "Globex")`: 60s timeout waiting for the "Create workspace" button |
| 2 | spec-side `goto("/boards")` workaround | focused `-g "assigned cards across workspaces"` | **1 failed — same RED**: the button exists only in the zero-workspace empty state; a member with workspaces creates one from the user-menu dropdown (mechanism: helper contract silently assumed the post-signup empty state, the only state prior specs exercised) |
| 3 | helper repair (user-menu fallback), spec workaround reverted | focused `-g "assigned cards across workspaces"` | 1 passed (29.3s) |
| 4 | final code | full spec | **4 passed (1.1m)** |

Typecheck, changed-file ESLint, and `git diff --check` clean after the
repair. `e2e/helpers/app.ts` is the only E2E-side change; the
zero-workspace direct-button fast path is unchanged, so prior specs are
unaffected (their calls still take that path). No product/schema/realtime
code touched. A W6 corrections pass hardened
hydration (time-dependent grouping renders only after a client-mounted
boundary — deterministic SSR skeleton, no suppressHydrationWarning), pinned
date labels to the en-US English UI, added the RSC page-wiring test, removed
dead `startOfDayLocal`, and recorded the unbounded personal read model (no
pagination) as a residual follow-up — details in validation.md (W6 section).
US-077 AC1 + the self-audit row are amended
to the locked cross-workspace membership-scoped interpretation; product
section-name drift reconciled. Full evidence chain in validation.md (W6
section).

1. **W3 — Demo determinism (foundation first).** Wrap existing seeds into a
   repeatable `demo:seed` / `demo:reset` workflow: fixed logical fixture
   (users, workspace, board payload, card counts, relative due dates) with a
   machine-readable manifest of the current run's ids (the existing seeds
   generate random UUIDs — determinism is logical shape/counts/relative dates,
   not identical UUIDs, unless implementation deliberately pins them), plus
   the enforced stale-server restart protocol + pre-demo checklist.
   *Exit gate:* two consecutive seed→reset→seed runs reproduce the same
   fixture shape/counts/relative dates with manifest ids recorded; protocol
   executed once in rehearsal.
2. **W1 — Cross-client realtime proof.** Add one two-client E2E spec per event
   (or grouped per event family) using the US-009/012 harness; each drives the
   real Server Action from client A and asserts live observation on client B.
   For `notification:new`, trigger deterministically via the existing mention
   mechanism (A posts a comment mentioning B → `notifyMentioned` →
   `createNotification` → user-room emit); the observer must assert the
   badge/inbox change with **no navigation, reload, or socket reconnect** in
   the assertion path, so a removed emit cannot be masked by a fallback
   refresh (the connect-time unread resync is not a fallback for this
   assertion). Sabotage runs: removing the emit in `lib/realtime/server.ts`
   turns the observer assertion red (proves the emit is load-bearing, per
   event).
   *Exit gate:* all six events green; sabotage runs red when the emit is
   removed.
3. **W2 — Live invitation arrival.** Implement the arrival signal (user-room
   event or wake+resync, per Design), wire badge/inbox, and add the real
   two-account invite E2E (invite → badge increments without refresh → accept →
   badge clears). Room authorization reviewed against `lib/realtime/auth.ts`.
   *Exit gate:* two-account invite E2E green; non-member cannot receive the
   signal (denial test).
4. **W4 — Retention reconciliation.** Diff `docs/product/automation.md`,
   US-066 packet, and decision texts against the actual `RuleExecutionLog`
   schema + `e2e/automation-log-retention.spec.ts`; fix stale claims
   (cascade-delete wording, `errorDetails`, append-only vs retention window).
   *Exit gate:* no stale retention claim remains in touched docs; each fixed
   claim cites the schema/evidence it now matches.
5. **W5 — Tracker/harness truth.** Reconcile `docs/stories/backlog.md`, IN-04,
   TEST_MATRIX, `docs/product/overview.md` (retirement re-points: `/today` →
   US-083 W6, quick capture → US-083 W7; product behavior unchanged),
   `docs/product/notifications.md`, harness story rows, decision rows (incl.
   the recorded drift: 0029/0030 docs exist without durable rows), US-077/
   US-078 retirement wording; run `harness-cli audit` and record evidence
   proportional to scope.
   *Exit gate:* audit output recorded; touched files contain no claim that
   contradicts the harness rows they reference.
   **Landed 2026-08-02** — see the W5 implementation progress section above.
6. **W6 — Today / My Work.** Read-model query + `/today` page + grouping
   helpers; archive/membership/isolation rules; every US-077 packet AC
   (retained) mapped to evidence per the overview self-audit table.
   *Exit gate:* W6 unit/integration/RTL green + `/today` E2E (assigned cards
   across 2 boards grouped correctly; archived/unpermitted boards excluded);
   self-audit rows for US-077 AC1–AC6 all cited; no migration created.
7. **W7 — Global quick capture.** Dialog, shortcuts (`C`, `Cmd/Ctrl+K` with
   focus guard), board/list defaulting, `createCardAction` wiring, success
   toast. Every US-078 packet AC (retained) mapped to evidence per the
   overview self-audit table.
   *Exit gate:* W7 unit/integration/RTL green + E2E (capture from `/today`
   lands on the target board and appears live); self-audit rows for US-078
   AC1–AC7 all cited.
8. **W8 — Bounded undo.** Snackbar after archive-card/archive-list; Undo →
   real restore actions; failure toast path; non-goal matrix (undo absent for
   permanent delete, member removal, rule/label/board/workspace deletion).
   **Race guard:** if the parent list of an archived card is archived before
   Undo, Undo must not restore an invisible card — the existing
   active-parent guard (`getArchivedCardWithListAndBoard` rejects when the
   parent list is archived) must surface a graceful failure (e.g. "restore
   the list first") and keep the card archived; covered by a focused
   integration test and a two-client E2E (A archives card, B archives the
   list, A hits Undo → no invisible restore, failure surfaced).
   *Exit gate:* W8 E2E green (archive→undo restores in place, no reload
   dependency); race-guard integration + two-client test green; absence
   assertions for non-goal undo surfaces.
9. **Demo rehearsal + rollout notes.** Run the full locked demo path from W3
   state; record rollout/rollback notes (see below) and the final single-story
   status.

## Rollout / Rollback / Demo Rehearsal

- **Rollout:** all changes are additive UI + tests + docs; no migration. Land
  behind the normal PR flow per workstream; W1–W5 can ship before W6–W8
  (features depend on the harness, not vice versa).
- **Rollback:** each workstream is independently revertible (feature-flag-free
  but separable commits per WS); no data migration to reverse; W8 rollback
  simply removes the snackbar — archive/restore actions stay as they are.
- **Demo rehearsal:** the W3 protocol is executed before the demo; a failed
  rehearsal blocks the demo (documented checklist, not aspiration).

## Stop Conditions

Pause for human confirmation if:

- W2 requires a new realtime event whose payload reaches beyond the invitee's
  own user room (scope/authorization change).
- W6 cannot meet its acceptance without a new table or an index that requires
  migration (contradicts the locked no-new-table scope).
- W4 discovers a retention window is actually required by the owner rather
  than documented behavior (needs its own decision).
- W8's undo needs to cover anything beyond archive-card/archive-list
  (Decision 0031 scope widening).
- Validation requirements need to be weakened, or the demo path order
  changes.
- Architecture direction changes (e.g., a background queue for realtime).
