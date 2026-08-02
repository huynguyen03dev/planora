# Overview — US-083 Demo-Ready Daily Work Loop

## Status

implemented and locally accepted on the feature branch `feature/us-083-demo-ready-daily-work-loop`
(8 commits ahead of dev through b272685; PR/merge is a separate authorization gate — no commit
or PR was opened by the final-close pass). **W1–W8 all landed and committed**; the branch-local
acceptance gates closed 2026-08-02: W3 exit gate executed for real (real sign-up + Mailpit
verification of the two demo users, seed→reset→seed round trip, manifest comparison —
validation.md W3 section), continuous demo rehearsal green from the seeded fixture and
self-provisioning on a fresh database (`e2e/demo-rehearsal.spec.ts` — validation.md
rehearsal + correction-pass sections), 375px platform proof green
(`e2e/platform-375.spec.ts` — no horizontal overflow on Today/Quick Capture/undo snackbar,
shortcut focus guard), combined US-083 E2E gate 25/25 green, full E2E suite 36/36 green
(re-proven post-self-provisioning correction on the final tree, 10.2m — validation.md
combined-gate section),
`npm test` 1404 green, `tsc --noEmit` / changed-file ESLint / `git diff --check` clean,
harness row implemented with unit/integration/e2e/platform = 1 + completed close trace.
W7 (global quick capture) closed its focused unit/integration/RTL checkpoint AND its E2E gate (`e2e/quick-capture.spec.ts` 5/5 green, fresh shared-server run 2026-08-02). W8 (bounded undo) closed its focused unit/integration/RTL/real-DB gates (real-Postgres interleaving proof + guard-removal sabotage RED) AND its E2E gate (`e2e/undo-snackbar.spec.ts` 5/5 GREEN on the Root-granted shared-server run, 2026-08-02 — one product defect caught and fixed: a `"use server"` const export). One story packet with eight
independently checkable internal workstreams (W1–W8); one final story status.
**Absorbs the planned behavior of US-077 (Today / My Work) and US-078 (Global
Quick Capture); those story packets are retired as separate work. The full
historical acceptance criteria remain in the retained retired packets and are
normatively incorporated here by exact reference (W6 → US-077 packet ACs,
W7 → US-078 packet ACs); W6/W7 cannot close until every referenced AC maps to
explicit evidence (see “Referenced Acceptance (Self-Audit)” below).**

Owner-selected scope (locked): combine the owner's recommended delivery
**Stage 1 (foundation/demo reliability)** and **Stage 2 (daily-work UX)** into a
single durable story, delivered as one demo-ready daily work loop. Recorded as
one story, not an IN-05 initiative. (These delivery stages are the owner's
delivery ordering — distinct from IN-04's numbered roadmap phase diagram, which
US-083 spans across its Phase 2/3 areas.) Decision 0031 (Accepted) bounds the
undo semantics.

## Current Behavior

Verified at recording time (2026-08-01; each claim is either code-verified or
flagged as documented):

- **Realtime events exist but six lack dedicated cross-client proof.** The
  socket server (`lib/realtime/server.ts`) emits `card:updated` (board),
  `list:created` / `list:updated` / `list:deleted` (board), `notification:new`
  (user room), and `analytics:refresh` (workspace room); all are typed in
  `lib/realtime/types.ts` and listed as "live" in
  `docs/product/realtime-sync.md`. Two-client E2E exists for `card:created` /
  `card:moved` / `card:archived` (US-009), `comment:created` / `list:moved`
  (US-012), presence (US-041), labels (US-010), members (US-011). Completion
  (US-045, `card:completion-updated`) is **not** two-client E2E-proven: its
  proof layer is unit + integration (action/board-store reducer) plus RTL
  (`card-completion-toggle` suite); no E2E spec covers it. `docs/TEST_MATRIX.md`
  row "Real-time sync" and
  `e2e/realtime-comment-list-reorder.spec.ts` (header comment) both state the
  six events above have **no dedicated cross-client proof** — that is the
  documented gap W1 closes (**closed — W1 landed 2026-08-02, committed
  937e75f**: dedicated two-client proof in `e2e/realtime-event-proof.spec.ts`,
  sabotage-verified per event; the stale spec-header claim is re-pointed).
- **Invitation arrivals are not pushed live.** Workspace invitations surface in
  the unified inbox by reading the invitation table (`/api/invitations/pending`,
  fetched when the notification dropdown opens — `components/notifications/
  notification-dropdown.tsx`); `notifyInvited()` in `lib/notification.ts` is an
  intentional no-op (comment cites the inbox path). The bell badge
  (`authenticated-header-actions.tsx`) increments on `notification:new` and
  resyncs on socket connect, but an arriving invitation does **not** push an
  event — the badge updates only after the dropdown/SSR fetch. No two-account
  invite E2E exists today (e2e/ has no invite spec). W2 makes arrival live and
  proves it with a real two-account invite flow (**closed — W2 landed
  2026-08-02, committed 3f238be**: `e2e/invitation-live-badge.spec.ts` three-user
  proof + badge-count unit surface; see the W2 handback section in the execplan).
- **Demo seeds exist but are not a deterministic, documented demo loop.**
  `scripts/seed-demo-board.ts` (idempotent per slug: wipes + recreates) and
  `scripts/seed-analytics-demo.ts` exist for local UI review. There is no
  single deterministic "demo seed → reset" command and no enforced stale-server
  restart protocol; the US-009 E2E harness (`e2e/helpers/*`) signs up fresh
  users and cleans up, but nothing documents the demo-day restart discipline
  (Socket.io state and Next dev caches go stale when the server is not
  restarted between seed and demo — noted in the presence row of
  `docs/TEST_MATRIX.md`). W3 closes this (**closed — W3 landed 2026-08-02,
  committed 827f222 + d127762**: repeatable `demo:seed`/`demo:reset` +
  manifest + enforced stale-server restart protocol in `docs/DEMO_RUNBOOK.md`).
- **Automation execution-log retention (reconciled — W4 landed, committed dc1fd0a).** Schema
  (`prisma/schema.prisma`, `RuleExecutionLog`): rows denormalize `workspaceId`
  + `ruleName`, `ruleId` is nullable with `onDelete: SetNull`,
  `@@unique([ruleId, dedupKey])`, `metadata Json?` + `error String?` (no
  `errorDetails` column); **no retention/prune window exists** — nothing
  deletes log rows except workspace deletion (`workspaceId` FK `onDelete:
  Cascade`). Rule-deletion survival is proven end-to-end by
  `e2e/automation-log-retention.spec.ts` (US-066; focused re-run green
  2026-08-02). W4 fixed the stale claims (US-066 execplan cascade-delete
  wording, `errorDetails`, the per-action-step row count, and the undocumented
  append-only wording) in `docs/product/automation.md`, the US-066 packet, and
  `docs/TEST_MATRIX.md` — each fix cites the schema/migration/E2E evidence it
  now matches. **Closed by W5 (2026-08-02):** decisions 0029 and 0030 have
  durable rows in `harness.db` (`harness-cli decision add` — doc paths set,
  status accepted; verified via `harness-cli query decisions`).
- **Today / My Work is built (W6 landed 2026-08-02, committed dcc481b); Global Quick Capture is built and verified through its
  focused-test + E2E checkpoints (W7 landed — committed in this W7 commit).** The
  `/today` cross-workspace read model (`lib/today-query.ts`, `lib/today.ts`,
  `app/(authenticated)/(dashboard)/today/page.tsx`, `components/today/`,
  chrome nav entry) is implemented and covered by unit/integration/RTL;
  `e2e/today.spec.ts` is green (4/4, 2026-08-02 shared-server lock run — one
  arrange-defect repair in `e2e/helpers/app.ts`, validation.md run record). The
  US-078 packet is **retired** (absorbed by W7 — full ACs retained by exact
  reference in the retired packet). `createCardAction`
  (`app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts`), the real
  restore actions `restoreCardAction` (US-016, integration-proven) and
  `restoreListAction` (US-074, proven) all exist — the foundations W7/W8 build
  on.
- **Archive/card and archive/list are reversible today via restore actions,
  but there is no undo surface.** Archive-card (US-016) and archive-list
  (US-074) are soft (set `archivedAt`); restore Server Actions exist and are
  security-boundary-tested. Nothing in the UI offers a post-action undo
  snackbar.

## Target Behavior

A demo-ready daily work loop, end to end:

1. **Deterministic demo state (W3):** one command seeds a repeatable demo
   fixture (workspace, boards, lists, cards, users) and resets between runs;
   determinism means **repeatable logical fixture shape, counts, titles, and
   relative dates** plus a machine-readable manifest exposing the current run's
   ids — not identical DB UUIDs across runs (the existing seeds generate random
   UUIDs; pinning ids is optional and only if implementation deliberately does
   it). A documented, enforced stale-server restart protocol makes demos
   repeatable (no stale Socket.io or Next caches).
2. **Cross-client realtime proof (W1):** dedicated two-client E2E proves
   `card:updated`, `list:created`, `list:updated`, `list:deleted`,
   `notification:new`, `analytics:refresh` arrive live on an observer client.
3. **Live invitation badge (W2):** a new invitation arriving for a signed-in
   user updates the bell badge / inbox without a manual refresh; proven by a
   real two-account invite flow (inviter invites → invitee sees badge live →
   accepts → badge clears).
4. **Today / My Work (W6):** `/today` read model over existing
   `CardMember` / `dueDate` / `priority` / `archivedAt` data **across every
   workspace the user is a member of** (membership-derived server-side;
   never client-supplied) — Overdue / Due Today / Due This Week / Later
   sections, archive/membership/isolation rules honored, **zero new tables**.
5. **Global quick capture (W7):** header button or `C` / `Cmd/Ctrl+K` opens a
   capture dialog that creates an ordinary `Card` through the existing
   `createCardAction` (board/list selectors, title required, optional
   description/due date/priority).
6. **Bounded undo (W8):** after archiving a card or a list, an undo snackbar
   appears; Undo calls the real restore Server Actions
   (`restoreCardAction` / `restoreListAction`). **Race guard:** if the parent
   list of an archived card is itself archived before Undo, Undo must not
   restore an invisible card — it must fail gracefully (existing
   active-parent guard in `getArchivedCardWithListAndBoard`: "Card not found"
   when the parent list is archived; the snackbar surfaces that the list must
   be restored first) and the card stays archived. Nothing else is undoable
   (Decision 0031).
7. **Truthful trackers (W4/W5):** automation retention claims, backlog, IN-04,
   TEST_MATRIX, and harness rows reflect reality; harness audit evidence
   recorded.

Demo path (locked): repeatable demo seed → `/today` → quick capture →
cross-client realtime → archive card/list → undo → invitation live badge.
**Executed end to end in one sitting from the seeded fixture 2026-08-02**
(`e2e/demo-rehearsal.spec.ts`, 1/1 green — validation.md rehearsal section);
the path is deterministic now that the fixture pins board order and uses the
app's workspace-id format (rehearsal-caught fixes, validation.md).

## Affected Users

- **All workspace members** (viewer/editor/admin): `/today`, quick capture,
  undo snackbar, live inbox badge.
- **Editors & admins**: archive/restore flows that the undo snackbar triggers.
- **Demo operators (agents/humans)**: deterministic seed/reset + restart
  protocol.

## Affected Product Docs

- `docs/product/boards-and-cards.md` — quick capture, undo, archive/restore
  semantics (W7, W8); `/today` section-name drift reconciled to the locked
  Overdue / Due Today / Due This Week / Later buckets (W6).
- `docs/product/overview.md` — `/today` and quick-capture roadmap references
  re-pointed to US-083 W6/W7 (W5); `/today` route wording amended to
  cross-workspace (W6).
- `docs/product/notifications.md` — unified inbox / badge behavior; live
  invitation-arrival limitation is the W2 target; badge-count unit surface
  `lib/notifications/inbox.ts` (W2).
- `docs/product/workspaces-and-access.md` — cross-workspace read-model
  isolation rules (W6, landed), invitation inbox (W2).
- `docs/product/realtime-sync.md` — event matrix proof status (W1, W2).
- `docs/product/automation.md` — execution-log retention reconciliation (W4).
- `docs/product/analytics.md` — `analytics:refresh` cross-client proof (W1).
- `docs/TEST_MATRIX.md` — US-083 row now `implemented` (branch-local; W1–W8 evidence incl.
  the W3 round-trip/rehearsal, 375px platform proof, combined 25/25 + full-suite 36/36 E2E
  gates; harness row implemented with proof flags 1/1/1/1); US-077/US-078 rows retired with pointers (W5).
- `DESIGN.md` — future UI validation cites its tokens/surfaces; W7 added the
  concise **Keyboard Shortcuts** convention (first global shortcut owner;
  existing tokens only, no new design tokens). W6's `/today` surface and
  chrome nav entry apply existing tokens only.

## Workstreams (one story, independent gates)

| WS | Scope (owner-locked delivery Stage 1) | Independent exit gate |
| --- | --- | --- |
| W1 | Cross-client E2E proof: `card:updated`, `list:created`, `list:updated`, `list:deleted`, `notification:new`, `analytics:refresh` | W1 E2E spec green on two real browser clients, incl. emit-removal sabotage runs turning red |
| W2 | Invitation arrival updates inbox/bell badge live; real two-account invite flow proof | W2 two-account invite E2E green; badge-count unit proof (`lib/notifications/inbox.test.ts`) |
| W3 | Repeatable demo seed/reset (logical fixture + manifest, not pinned UUIDs) + enforced, documented stale-server restart protocol | Seed→reset→seed round trip reproduces fixture shape/counts/relative dates; manifest ids recorded; restart protocol executed in rehearsal |
| W4 | Reconcile automation execution-log retention claims with actual durable schema/behavior | **Landed — 2026-08-02 (committed dc1fd0a):** drift list closed (TEST_MATRIX row, US-066 packet, `docs/product/automation.md`); retention semantics match schema; focused `e2e/automation-log-retention.spec.ts` re-run green (1 passed); `git diff --check` clean |
| W5 | Reconcile touched tracker/docs/TEST_MATRIX truth (incl. `docs/product/overview.md`, `docs/product/notifications.md`); harness audit evidence proportionate to scope | **Landed — 2026-08-02 (committed b1280f8):** `harness-cli audit` evidence recorded in validation.md; touched files carry no claim contradicting the harness rows they reference (backlog.md/IN-04/TEST_MATRIX/US-083 + product docs reconciled; US-066/075 harness rows marked implemented with evidence; durable decision rows 0029/0030 added; `git diff --check` clean) |
| — | **Stage 2 — daily-work UX** | — |
| W6 | Today / My Work cross-workspace personal read model (archive/membership/isolation rules, no new table) | W6 unit/integration/RTL + E2E green; every referenced US-077 AC mapped to explicit evidence (self-audit table below). **Landed 2026-08-02 (committed dcc481b):** unit/integration/RTL green (40 focused, after the corrections pass: hydration client-mounted boundary, en-US-pinned labels, RSC page-wiring test — validation.md W6), `e2e/today.spec.ts` 4/4 green (2026-08-02 shared-server lock run; one helper repair — validation.md run record) |
| W7 | Global quick capture via existing `createCardAction` (`C` + `Cmd/Ctrl+K`) | W7 unit/integration/RTL + E2E green; every referenced US-078 AC mapped to explicit evidence (self-audit table below). **Landed (committed in this W7 commit, 2026-08-02):** unit/integration/RTL green (146 focused + 229 affected-area regression — final post-correction counts); `e2e/quick-capture.spec.ts` **5/5 green** on the final shared-server run (≈1.3–1.4m — hydration-readiness marker + US-043 two-Escape fixes landed first; validation.md W7 run record) |
| W8 | Undo snackbar for archive-card and archive-list only, via real restore Server Actions; parent-list-archived race fails safe | W8 undo E2E green; race guard integration + two-client test green; non-goal matrix tested as denied/absent |

## Referenced Acceptance (Self-Audit)

US-077 and US-078 remain the authoritative home of their full acceptance
criteria (retired packets, unchanged). W6/W7 incorporate them **by exact
reference**: each AC below must map to at least one passing evidence item in
the W6/W7 validation surface before that workstream (and the story) can close.
This table is the self-audit checklist; the story's final status requires every
row to cite its evidence.

| Referenced AC (retained in) | Incorporated by | Evidence target (must cite at close) |
| --- | --- | --- |
| US-077 AC1 — `/today` shows cards assigned to the user across all boards in **every workspace the user is a member of** (cross-workspace interpretation locked by W6: workspace scope is derived server-side from the user's `WorkspaceMember` rows, never accepted from the client; the US-077 packet AC1 wording is amended accordingly) | W6 | W6 integration (query scoping, membership-derived `in` clause) + E2E `e2e/today.spec.ts` (cross-workspace card renders; foreign-workspace exclusion — assigned card in a workspace the viewer is not a member of never appears) — E2E 4/4 green 2026-08-02 |
| US-077 AC2 — four sections: Overdue / Due Today / Due This Week / Later with exact date-window predicates | W6 | W6 unit `lib/today.test.ts` (boundary cases) + E2E section assertions |
| US-077 AC3 — card tile opens the existing Card Detail Sheet or navigates to board/card context | W6 | W6 RTL (tile wiring) + E2E click-through |
| US-077 AC4 — respects workspace membership and board authorization | W6 | W6 integration isolation cases (A2/A3-style) |
| US-077 AC5 — archiving a card or board removes it from `/today` on next refresh | W6 | W6 integration + E2E (archive → refresh → absent) |
| US-077 AC6 — zero new database tables/migrations | W6 | W6 gate check: no migration file in the workstream diff |
| US-078 AC1 — header button or shortcut opens Quick Capture from any authenticated route | W7 | W7 RTL (chrome button + immediate open + C/Ctrl+K/Meta+K with preventDefault-once; guards: typing targets/copy/Shift+C/repeat/IME/open overlay) + E2E `e2e/quick-capture.spec.ts` from `/today` (C + Cmd/Ctrl+K openers) — 5/5 green |
| US-078 AC2 — target board defaults to active/most-recent board | W7 | W7 unit `lib/quick-capture.test.ts` (route→saved→first-creatable resolution, per-field saved validity, list-less board kept) + integration (options action membership/role isolation) + RTL (each default path) |
| US-078 AC3 — target list defaults to first/left-most (or designated capture) list | W7 | W7 unit `lib/quick-capture.test.ts` (saved-valid-for-board or left-most; null for list-less boards) + RTL (defaults + board-change list reset) |
| US-078 AC4 — title required; description, due date, priority optional | W7 | W7 unit (schema mapping) + RTL (required-title guard) + integration (optional fields persist in ONE `card.create`; empty-string→null; invalid priority/date boundary) |
| US-078 AC5 — submitting invokes existing `createCardAction`, appending an ordinary `Card` with position gap math | W7 | W7 integration (`tests/server-actions/quick-capture.test.ts`: single atomic create with position gap, no chained updates; A1/A2/A3/archived-board regression) |
| US-078 AC6 — emits `card:created` and revalidates the board path so the card appears live | W7 | W7 integration (emit payload fidelity: dueDate ISO + priority; `revalidatePath` call) + E2E two-client live appearance with W1 barrier/tripwire — green |
| US-078 AC7 — success notification with direct "View Card on Board" link | W7 | W7 RTL (self-contained `role="status"` toast + deep-link href + persistence) + E2E deep-link click-through — green |

## Non-Goals

- No US-076 (telemetry), US-079 (per-board triage), US-080–082 work in this
  story.
- No AI, external email/form intake, public API, webhook, background queue, or
  new domain table.
- **No undo** for: permanent deletion, member removal, rule/label deletion,
  board/workspace deletion, or re-create-based pseudo-undo (Decision 0031).
- No member-list realtime sync (card members already sync via
  `card:members-updated`; invitation-member roster sync is out).
- No schema migration is planned for any workstream (W6 explicitly forbids a
  new table; W8 reuses existing restore actions).
