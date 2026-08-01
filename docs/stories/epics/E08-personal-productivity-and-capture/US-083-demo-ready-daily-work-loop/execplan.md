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
