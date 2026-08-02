# Design — US-083 Demo-Ready Daily Work Loop

## Domain Model

No new entities, no migrations. US-083 composes existing domain objects:

- **`Card` / `List` / `Board` / `Workspace` / `WorkspaceMember`** — the
  read-model sources for W6 (`/today`) and the mutation targets for W7 (create)
  and W8 (archive → restore).
- **`Notification`** (rows + `notification:new` socket push) and the
  **invitation table** (surfaced via `/api/invitations/pending` as inbox items
  with inline Accept/Decline — `lib/notifications/inbox.ts`) — W2's live-arrival
  sources. `notifyInvited()` is a no-op by design; W2 must add the live-arrival
  signal without duplicating the inbox row (e.g., a user-room realtime event
  carrying the pending-invitation count/snapshot, consumed by
  `authenticated-header-actions.tsx` / the dropdown; exact shape is an
  implementation decision inside W2, gated by the typed event map in
  `lib/realtime/types.ts`).
- **`RuleExecutionLog`** — existing durable audit rows (see Data Model) that
  W4 reconciles documentation against.
- **No new domain table anywhere.** W6 is a pure query; W7 reuses
  `createCardAction`; W8 reuses `restoreCardAction` / `restoreListAction`.

## Application Flow

1. **Demo bootstrap (W3):** `scripts/seed-demo-board.ts` (idempotent per slug)
   and `scripts/seed-analytics-demo.ts` exist; W3 adds a repeatable
   `demo:seed` / `demo:reset` wrapper (fixed logical fixture: users,
   workspace, board/list/card payload, card counts, due dates relative to a
   pinned reference day) plus a machine-readable manifest of the current run's
   ids (seeds generate random UUIDs — determinism is logical shape/counts/
   relative dates, not identical UUIDs, unless implementation deliberately
   pins them) and a written stale-server restart protocol (stop dev
   server + `tsx`/socket state, restart, re-seed) and a pre-demo checklist.
2. **Cross-client proof (W1):** extend the US-009/012 two-client harness
   (`e2e/helpers/app.ts` + `helpers/db.ts`) with specs per event; each proves
   observer-side live application on a second browser context. Where an event
   legitimately needs a deterministic trigger (e.g., `analytics:refresh` fired
   by an action), the spec drives the real Server Action via UI, never a
   forged emit — except sabotage runs (see Validation) that remove the emit to
   prove the observer depends on it.
3. **Live invitation arrival (W2):** inviter `inviteMemberAction` →
   invitation row → W2's arrival signal to the invitee's user room → badge
   count/inbox update. Two-account E2E: sign up inviter + invitee, invite,
   assert badge increment without refresh, accept, assert badge clears.
4. **`/today` (W6):** route `app/(authenticated)/(dashboard)/today/page.tsx`;
   query `getPersonalWorkCardsQuery({ workspaceId, userId })` over `Card` with
   `list.board.workspaceId` scoping, `board.archivedAt: null`,
   `card.archivedAt: null`, `members: { some: { userId } }`; group by
   Overdue / Due Today / Due This Week / Later (pure `lib/today.ts` helpers);
   open existing Card Detail Sheet from a tile.
5. **Quick capture (W7):** global dialog + shortcuts (`C` when no input
   focused, `Cmd/Ctrl+K`); board/list default resolution (active board, then
   left-most list); submit invokes existing `createCardAction` → `card:created`
   emit → board revalidate; success toast with "View Card on Board".
6. **Undo (W8):** after `archiveCardAction` / `archiveListAction` succeeds,
   show snackbar with Undo; Undo calls `restoreCardAction` /
   `restoreListAction` (existing Server Actions, already
   authorization/isolation-gated and proven). Snackbar dismisses on timeout /
   navigation; no optimistic pseudo-restore — the action result is the source
   of truth; failure surfaces an error toast and keeps the card in the
   archived view. **Race guard:** if the parent list of an archived card is
   archived before Undo, the restore fails safe in TWO layers (implemented
   W8): the archived-aware resolver discriminates the archived-parent case
   (permission-gated, no existence leak) and `restoreCardAction` re-checks the
   parent list INSIDE its transaction under `SELECT ... FOR UPDATE` +
   `archivedAt IS NULL` revalidation, so a concurrent list archival between
   the pre-read and the commit can never restore the card into an archived
   list. The snackbar surfaces "Restore the list first." and the card stays
   in the archived view.
7. **Reconciliation (W4/W5):** audit claims in `docs/product/automation.md`,
   US-066 packet, IN-04, `docs/stories/backlog.md`, `docs/TEST_MATRIX.md`,
   `docs/product/overview.md`, `docs/product/notifications.md`, harness rows;
   fix drift (incl. retirement re-points for `/today` and quick capture); run
   `harness-cli audit` and record evidence.

## Interface Contract

Realtime events (existing, typed in `lib/realtime/types.ts`, emitted in
`lib/realtime/server.ts`) — W1 proves them; W2 may add one user-room event:

| Event | Scope | Direction of work |
| --- | --- | --- |
| `card:updated` | board | W1 proof (live, in-place) |
| `list:created` | board | W1 proof (deferred/structural) |
| `list:updated` | board | W1 proof (live) |
| `list:deleted` | board | W1 proof (deferred/structural) |
| `notification:new` | user | W1 proof + W2 reuse |
| `analytics:refresh` | workspace | W1 proof (signal) |
| `invitation:new` (W2 — implemented) | user | typed event, payload `{ invitationId }` only (minimal, non-sensitive); emitted via `emitInvitationNew(inviteeId, …)` to the invitee's own user room; header increments the badge, inbox re-reads the invitation table on open |

Server Actions (existing, reused — no new action signatures):

- `createCardAction` (W7), `archiveCardAction` / `restoreCardAction` (W8),
  `archiveListAction` / `restoreListAction` (W8), `inviteMemberAction` (W2
  flow), `getInboxBadgeCountsAction` (W2 badge resync — replaces
  `getUnreadNotificationCountAction`; one action returns both badge halves so
  the connect-time route re-render stays a single POST).

Route: `/today` (W6, new, authenticated). No public API, no webhooks, no
queue.

## Data Model

- **No schema change, no migration** in any workstream. W6 forbids a new table
  (read model only); W7 creates ordinary `Card` rows via the existing action;
  W8 flips existing `archivedAt` timestamps via restore actions.
- **W4 reconciliation target (no schema change):** `RuleExecutionLog` actual
  shape — `workspaceId` + `ruleName` denormalized (survive rule deletion),
  `ruleId String?` with `onDelete: SetNull`, `@@unique([ruleId, dedupKey])`,
  `metadata Json?` + `error String?` (no `errorDetails` column), indexes on
  `[workspaceId, executedAt]`, `[ruleId, executedAt]`, `[cardId]`, `[chainId]`.
  Retention: no prune/retention window exists today; W4 documents the actual
  behavior (indefinite append, workspace-cascade) or, if the owner wants a
  window, records a decision — it does **not** invent one silently.

## UI / Platform Impact

- New surfaces: `/today` page, quick-capture dialog, undo snackbar, live badge
  update. All built on existing shadcn primitives and DESIGN.md tokens (read
  `DESIGN.md` before any UI change during implementation; validation cites
  tokens rather than hard-coded values).
- Keyboard shortcuts (`C`, `Cmd/Ctrl+K`) must not fire when an input/textarea/
  contenteditable is focused (standard guard); no DESIGN.md conflict identified
  at recording time (no shortcut section exists there).
- Platform: demo is desktop-browser; responsive check at 375px for the new
  dialog/page is part of validation, not a separate mobile story.
- The stale-server restart protocol (W3) is a documented ops/demo procedure
  (dev-server restart discipline; noted for the presence/realtime stack where
  `server.ts` is not hot-reloaded by `tsx`).

## Observability

- W1/W2 E2E specs are the observability proof for realtime delivery (observer
  sees the change; sabotage runs prove the emit is load-bearing).
- W8: undo is observable through existing activity/history events
  (`CARD_RESTORED`, list restore behavior) — no new log table; snackbar
  failures surface as toasts.
- W4: retention claims are documented against the schema; `harness-cli audit`
  + `query matrix`/`query sql` provide the durable evidence trail.
- No new metrics, logs, or audit tables are introduced by this story.

## Alternatives Considered

1. **IN-05 initiative with child stories instead of one story** — rejected by
   the owner: one durable high-risk packet with internal workstreams and
   independent gates gives a single status while keeping checkable sub-goals.
2. **Proving realtime events by unit-testing emitters only** — rejected:
   emitters are already unit-shaped; the documented gap is observer-side
   cross-client delivery, which only the two-client E2E harness can prove.
3. **Undo via re-create ("clone the archived card")** — rejected (Decision
   0031): a clone loses id/history/membership/position identity and fabricates
   a new entity; the real restore actions already exist and preserve the row.
4. **Polling for invitation arrivals** — acceptable fallback but not the
   target; a user-room event (or wake+resync) keeps the badge live without
   adding a new domain table. W2 decides with evidence.
5. **Adding a retention/prune window for `RuleExecutionLog`** — deferred: W4
   documents actual behavior first; a window would need its own decision.
