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
