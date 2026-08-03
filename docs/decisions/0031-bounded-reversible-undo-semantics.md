# 0031 Bounded Reversible Undo Semantics

Date: 2026-08-01

## Status

Accepted — owner explicitly selected this scope. Gates story US-083 (W8).

## Context

US-083's demo loop includes an undo surface after archiving. Planora already
has real, security-proven restore Server Actions for both soft-delete
surfaces: `restoreCardAction` (US-016, archived-card restore with `CARD_RESTORED`
history + `card:created` re-emit) and `restoreListAction` (US-074, archived-list
restore). The question is the undo boundary: which user actions get an undo
snackbar, and what mechanism the undo uses.

Plausible but dangerous extensions were considered by the owner during scope
selection: undo for permanent deletion, member removal, rule/label deletion,
board/workspace deletion, and "undo by re-creating" the archived entity as a
new row.

## Decision

The undo snackbar (US-083 W8) covers **exactly two reversible actions**:

1. **Archive card** → Undo calls `restoreCardAction` (real restore, same row).
2. **Archive list** → Undo calls `restoreListAction` (real restore, same row).

The undo mechanism is **always the real restore Server Action for the archived
row** — never a client-side clone, never a re-create. Re-create-based
pseudo-undo is explicitly rejected: a clone is a new entity with a new id, no
history, no membership, no attachment/comment identity, and a fabricated
audit trail; the restore actions already exist, are permission/isolation-gated,
and preserve the row.

## Alternatives Considered

1. **Undo via re-create ("clone the archived card").** Rejected: loses id/
   history/membership identity; duplicates the retention problem; weaker
   than the existing restore action.
2. **Undo for permanent deletion.** Rejected: US-074 defines permanent
   deletion as intentionally irreversible (exact-title confirmation, admin
   gate, Cloudinary guard); an undo would undermine the guard's purpose.
3. **Undo for member removal, rule/label deletion, board/workspace
   deletion.** Rejected: each has its own existing confirm/audit semantics;
   expanding undo multiplies the realtime + authorization surface beyond this
   story's demo scope.
4. **No undo at all.** Rejected: the demo loop requires visible, safe
   reversal of the archive step; archive is already soft and restore actions
   are proven, so the undo is cheap and safe.

## Consequences

Positive:

- Undo is real: same-row restore, preserved history/membership/attachments,
  existing permission gates (viewer denied, non-member denied, archived-board
  guard) apply unchanged.
- Bounded blast radius: snackbar logic is a thin eligibility map over two
  actions; no new mutation, no new table, no new realtime event.
- The demo path (archive card/list → undo) is honest — it demonstrates the
  product's actual restore semantics.
- The parent-list-archived race fails safe: if an archived card's parent list
  is itself archived before Undo, the existing active-parent guard in
  `getArchivedCardWithListAndBoard` rejects the restore — the card is never
  restored into an archived (invisible) list, the snackbar surfaces that the
  list must be restored first, and the card stays in the archived view.

Tradeoffs:

- Actions outside the two archive cases get no undo affordance; users must use
  the existing confirm dialogs and the archived-cards/lists views for recovery.
  This is a deliberate product-semantics boundary, not a gap.
- If the owner later wants undo for more actions, each extension needs its own
  scope + decision; this decision does not pre-authorize widening.

## Follow-Up

- W8 acceptance includes an absence test: no undo affordance is offered for
  permanent-delete, member-removal, rule/label-deletion, or
  board/workspace-deletion flows.
- If a retention window for `RuleExecutionLog` is ever adopted (US-083 W4
  documents actual behavior first), record it as its own decision.

## Implementation Note (US-083 W8, 2026-08-02)

The parent-list-archived race is enforced in TWO layers (the sequential
pre-read alone was proven insufficient on real Postgres — a list archived
between pre-read and commit slipped a restore through):

1. `getArchivedCardWithListAndBoard` now FLAGS (`parentListArchived`) the
   archived-parent case instead of returning null, so the action can run the
   permission gate first and then surface the dedicated "Restore the list
   first." outcome (`code: PARENT_LIST_ARCHIVED`) only when the card exists,
   remains archived, its parent list is archived, the board is active, and the
   caller is authorized — missing/foreign/already-restored/archived-board
   cases keep the generic not-found (no existence leak).
2. `restoreCardAction` re-checks the parent list INSIDE its transaction under
   `SELECT ... FOR UPDATE` + `archivedAt IS NULL` revalidation (the US-074
   pattern), aborting the restore if the list was archived concurrently — a
   restore can never commit a live card into an invisible list.

Real-Postgres interleaving proof: `tests/db-undo-race-proof.test.ts`
(lock_timeout-deterministic; the guard's removal turns the invariant test
red). Action wiring pinned by `tests/server-actions/undo-restore.test.ts`.
Double-undo retains the existing generic failure contract (residual,
documented).
