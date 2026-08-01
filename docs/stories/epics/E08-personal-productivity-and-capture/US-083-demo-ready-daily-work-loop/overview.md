# Overview — US-083 Demo-Ready Daily Work Loop

## Status

planned (high-risk) — implementation unstarted. One story packet with eight
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
  documented gap W1 closes.
- **Invitation arrivals are not pushed live.** Workspace invitations surface in
  the unified inbox by reading the invitation table (`/api/invitations/pending`,
  fetched when the notification dropdown opens — `components/notifications/
  notification-dropdown.tsx`); `notifyInvited()` in `lib/notification.ts` is an
  intentional no-op (comment cites the inbox path). The bell badge
  (`authenticated-header-actions.tsx`) increments on `notification:new` and
  resyncs on socket connect, but an arriving invitation does **not** push an
  event — the badge updates only after the dropdown/SSR fetch. No two-account
  invite E2E exists today (e2e/ has no invite spec). W2 makes arrival live and
  proves it with a real two-account invite flow.
- **Demo seeds exist but are not a deterministic, documented demo loop.**
  `scripts/seed-demo-board.ts` (idempotent per slug: wipes + recreates) and
  `scripts/seed-analytics-demo.ts` exist for local UI review. There is no
  single deterministic "demo seed → reset" command and no enforced stale-server
  restart protocol; the US-009 E2E harness (`e2e/helpers/*`) signs up fresh
  users and cleans up, but nothing documents the demo-day restart discipline
  (Socket.io state and Next dev caches go stale when the server is not
  restarted between seed and demo — noted in the presence row of
  `docs/TEST_MATRIX.md`). W3 closes this.
- **Automation execution-log retention claims drift from the durable schema.**
  Schema (`prisma/schema.prisma`, `RuleExecutionLog`): rows denormalize
  `workspaceId` + `ruleName`, `ruleId` is nullable with `onDelete: SetNull`,
  `@@unique([ruleId, dedupKey])`, `metadata Json?`; survival of rule deletion
  is proven by `e2e/automation-log-retention.spec.ts` (US-066). But
  `docs/stories/epics/E06-automation/US-066-automation-rules-engine/execplan.md`
  still claims logs cascade-delete with the rule, `docs/product/automation.md`
  mentions `errorDetails` (no such column; actual fields are `error` /
  `metadata`), and the "append-only" wording in the US-066 design has no
  documented retention window or prune policy. Also documented-to-harness
  drift: decisions 0029 and 0030 exist as `docs/decisions/*.md` files but have
  **no durable rows** in `harness.db` (verified via `harness-cli query sql`).
  W4/W5 reconcile these claims.
- **Today / My Work and Global Quick Capture are planned but unbuilt**
  (US-077, US-078 packets, both `planned` / unstarted). `createCardAction`
  (`app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts`), the real
  restore actions `restoreCardAction` (US-016, integration-proven) and
  `restoreListAction` (US-074, proven) all exist — the foundations W6–W8 build
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
   `CardMember` / `dueDate` / `priority` / `archivedAt` data across authorized
   boards in the workspace — Overdue / Due Today / Due This Week / Later
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

## Affected Users

- **All workspace members** (viewer/editor/admin): `/today`, quick capture,
  undo snackbar, live inbox badge.
- **Editors & admins**: archive/restore flows that the undo snackbar triggers.
- **Demo operators (agents/humans)**: deterministic seed/reset + restart
  protocol.

## Affected Product Docs

- `docs/product/boards-and-cards.md` — quick capture, undo, archive/restore
  semantics (W7, W8).
- `docs/product/overview.md` — `/today` and quick-capture roadmap references
  re-pointed to US-083 W6/W7 (W5); product behavior unchanged.
- `docs/product/notifications.md` — unified inbox / badge behavior; live
  invitation-arrival limitation is the W2 target; badge-count unit surface
  `lib/notifications/inbox.ts` (W2).
- `docs/product/workspaces-and-access.md` — cross-workspace read-model
  isolation rules (W6), invitation inbox (W2).
- `docs/product/realtime-sync.md` — event matrix proof status (W1, W2).
- `docs/product/automation.md` — execution-log retention reconciliation (W4).
- `docs/product/analytics.md` — `analytics:refresh` cross-client proof (W1).
- `docs/TEST_MATRIX.md` — planned US-083 row; US-077/US-078 rows retired with
  pointers (W5).
- `DESIGN.md` — future UI validation cites its tokens/surfaces; no UI changes
  in this recording turn.

## Workstreams (one story, independent gates)

| WS | Scope (owner-locked delivery Stage 1) | Independent exit gate |
| --- | --- | --- |
| W1 | Cross-client E2E proof: `card:updated`, `list:created`, `list:updated`, `list:deleted`, `notification:new`, `analytics:refresh` | W1 E2E spec green on two real browser clients, incl. emit-removal sabotage runs turning red |
| W2 | Invitation arrival updates inbox/bell badge live; real two-account invite flow proof | W2 two-account invite E2E green; badge-count unit proof (`lib/notifications/inbox.test.ts`) |
| W3 | Repeatable demo seed/reset (logical fixture + manifest, not pinned UUIDs) + enforced, documented stale-server restart protocol | Seed→reset→seed round trip reproduces fixture shape/counts/relative dates; manifest ids recorded; restart protocol executed in rehearsal |
| W4 | Reconcile automation execution-log retention claims with actual durable schema/behavior | Drift list closed; retention semantics doc matches schema |
| W5 | Reconcile touched tracker/docs/TEST_MATRIX truth (incl. `docs/product/overview.md`, `docs/product/notifications.md`); harness audit evidence proportionate to scope | `harness-cli audit` evidence recorded; no stale claims in touched files |
| — | **Stage 2 — daily-work UX** | — |
| W6 | Today / My Work cross-workspace personal read model (archive/membership/isolation rules, no new table) | W6 unit/integration/RTL + E2E green; every referenced US-077 AC mapped to explicit evidence (self-audit table below) |
| W7 | Global quick capture via existing `createCardAction` (`C` + `Cmd/Ctrl+K`) | W7 unit/integration/RTL + E2E green; every referenced US-078 AC mapped to explicit evidence (self-audit table below) |
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
| US-077 AC1 — `/today` shows cards assigned to the user across all boards in the active workspace | W6 | W6 integration (query scoping) + E2E `e2e/today.spec.ts` |
| US-077 AC2 — four sections: Overdue / Due Today / Due This Week / Later with exact date-window predicates | W6 | W6 unit `lib/today.test.ts` (boundary cases) + E2E section assertions |
| US-077 AC3 — card tile opens the existing Card Detail Sheet or navigates to board/card context | W6 | W6 RTL (tile wiring) + E2E click-through |
| US-077 AC4 — respects workspace membership and board authorization | W6 | W6 integration isolation cases (A2/A3-style) |
| US-077 AC5 — archiving a card or board removes it from `/today` on next refresh | W6 | W6 integration + E2E (archive → refresh → absent) |
| US-077 AC6 — zero new database tables/migrations | W6 | W6 gate check: no migration file in the workstream diff |
| US-078 AC1 — header button or shortcut opens Quick Capture from any authenticated route | W7 | W7 RTL + E2E (from `/today`) |
| US-078 AC2 — target board defaults to active/most-recent board | W7 | W7 unit `lib/quick-capture.test.ts` (default resolution) |
| US-078 AC3 — target list defaults to first/left-most (or designated capture) list | W7 | W7 unit `lib/quick-capture.test.ts` (default resolution) |
| US-078 AC4 — title required; description, due date, priority optional | W7 | W7 unit (schema mapping) + RTL (required-title guard) |
| US-078 AC5 — submitting invokes existing `createCardAction`, appending an ordinary `Card` with position gap math | W7 | W7 integration (action invocation + position) |
| US-078 AC6 — emits `card:created` and revalidates the board path so the card appears live | W7 | W7 integration (emit) + E2E live appearance on target board |
| US-078 AC7 — success notification with direct "View Card on Board" link | W7 | W7 RTL (toast content/link) |

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
