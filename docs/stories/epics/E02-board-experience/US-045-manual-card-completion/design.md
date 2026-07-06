# Design — US-045 Manual card completion toggle

## Domain Model

- `Card.completedAt: DateTime?` is the **single source of truth** for completion,
  written only by the toggle action (decision 0020). No new column.
- **`List.isDone` is removed** (schema migration + realtime `ListSnapshot`/
  `ListUpdatedPayload` shape change — see execplan for the full ~15-site radius).
  The move (`actions.ts:1223`) and create (`:447`) logic stop reading/writing
  `completedAt`, and the list-done-driven card-history events
  (`card-history.ts:334-359`, `actions.ts:486-501`) are removed.
- `lib/card.ts completeCard()` (`:409`) is **already dead code** (0 callers) — it
  is deleted, not "replaced." Completion is written by the new toggle helper.
- `requireEstimateBeforeDone` **gate** kept. The estimate **lock**
  (`actions.ts:793`) is **removed** — estimate stays editable through
  complete/reopen (justified in decision 0020: analytics is event-sourced, so the
  estimate-at-completion is recoverable from the event log; the live-field freeze
  guarded nothing analytics trusted).

## Application Flow

- New `toggleCardCompletionAction(cardId, complete: boolean)`:
  `verifySession()` → `hasWorkspacePermission(editor)` → workspace-isolation scope
  → Zod parse (uuid + boolean) → Prisma update (`completedAt = complete ? now :
  null`, enforce `requireEstimateBeforeDone` on complete) → write `CARD_COMPLETED`
  / `CARD_REOPENED` card-history event → **dedicated** realtime emit → return a
  serializable card.
- Add `setCardCompletion(cardId, complete)` in `lib/card.ts` as the single helper;
  retire the one-way `completeCard()`.

## Interface Contract

- Action input: `{ cardId: string (uuid), complete: boolean }`.
- Errors: `forbidden` (viewer), `estimate-required` (gate blocks completion —
  surfaced inline, not a silent no-op), `not-found`.
- **Realtime (corrected):** `card:updated` today carries only `{ cardId, title }`
  (`lib/realtime/server.ts:149`) and **cannot** broadcast a completion flip. Add a
  dedicated `emitCardCompletionUpdated(boardId, { cardId, completedAt: string |
  null })` mirroring the `emitCardLabelsUpdated` / `emitCardMembersUpdated`
  precedent (`server.ts:190`, `:213`), plus a board-store reducer that sets
  `card.completedAt`. Carry `completedAt` (not a bare boolean) so the receiver
  recomputes due-status. **Safe to apply mid-drag — no drag deferral** (completion
  is a flag; it never reorders the list array, like labels/members).

## Data Model

- Migration: **drop `List.isDone`**. No completion-state backfill — every
  currently-complete card already has `completedAt` materialized and keeps it.
  A hard gate; recorded in decision 0020.

## UI / Platform Impact

- Completion control: `role="checkbox"` with `aria-checked`, accessible name
  ("Mark complete" / "Reopen"), keyboard-operable, **state shown by more than
  color** (filled check, not only a colored ring) — WCAG 1.4.1 / 4.1.2 / 2.1.1.
- Placement: **card-detail hero** (left of title) **and the card face**. On the
  card face the control must: (a) `stopPropagation` so it neither opens the detail
  sheet nor starts a drag; (b) be **always visible on coarse/touch pointers**
  (no hover); (c) stay visible once complete (the check is the state indicator).
  If (a)–(c) aren't fully handled, ship detail-only first and fast-follow the face
  circle.
- **Completed cards stay in place** — dimmed + filled check, no auto-sort to
  bottom, no hiding (Trello parity). Auto-reordering would reintroduce the
  list-position/completion coupling removed in decision 0020.
- Due-status: `describeDueDate` (`list-card-item.tsx:86`) already derives "done"
  from `completedAt`; reopening a past-due card **snaps it back to "overdue"**
  automatically — correct, no special-casing.
- When `requireEstimateBeforeDone` blocks, show the reason inline.
- **Estimate-lock removal has a UI site:** the estimate input is currently
  `disabled={… || Boolean(card.completedAt)}` (`card-detail-sheet.tsx:996`) with a
  lock message (`:1009`). Remove that `completedAt` disable + message so the
  estimate is editable on a completed card.

## Observability

- Completion/reopen writes a `CARD_COMPLETED` / `CARD_REOPENED` card-history
  event (both enum values already exist, `schema.prisma:54-55`), so the feed and
  analytics see the transition.

## Alternatives Considered

See decision 0020: Option A (list authoritative), Option B (sticky manual flag +
column), Option C (last-writer-wins), and keep-the-estimate-lock — all rejected in
favor of pure card-owned completion.
