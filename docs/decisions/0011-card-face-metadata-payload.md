# 0011 Card-face metadata payload + supporting FK indexes

Date: 2026-06-29

## Status

Accepted

## Context

IN-02 Theme B (US-030) surfaces card-face metadata the schema already stores but
the board view never showed: due date, assignee avatars, checklist progress, and
comment count. Today the board-view card payload
(`getListsByBoardId`, `lib/list.ts`) carries only
`id/listId/title/position/coverImage/priority/labels`. Two things had to change
together, and both are durable contract/data decisions:

1. **Public contract** — `docs/product/boards-and-cards.md` states "Members
   render in the detail sheet only, not the card face" and that the board-view
   payload "carries `labels` but not `dueDate`/`assignees`". US-030 changes that:
   the board-view payload grows fields and the card face renders them.
2. **Data model** — computing checklist progress and comment count per card on
   every board load aggregates `checklist` → `checklistItem` and `comment` by
   their card/checklist FK. Those FK columns were **unindexed**
   (`comment.cardId`, `checklist.cardId`, `checklistItem.checklistId`), so the
   aggregates would be sequential scans on the hot board-load path — the exact
   DnD/board-load perf budget IN-01 US-004 set (decision 0008/0010).

This is the one IN-02 child that crosses a hard gate (migration), so it runs in
the high-risk lane with this decision record.

## Decision

- **Enrich the board-view card payload** (`ListCardRecord`) with: `dueDate`,
  `completedAt`, a **capped** assignee list (`members`, up to
  `MAX_CARD_FACE_AVATARS = 3`) plus the total `memberCount`, `checklistDone` /
  `checklistTotal`, and `commentCount`. Counts are **aggregated server-side** —
  the wire payload carries two integers per card, never the raw checklist items.
- **Add three additive FK indexes** via migration
  `20260629023148_add_card_face_metadata_indexes`:
  `@@index([cardId])` on `comment` and `checklist`, `@@index([checklistId])` on
  `checklistItem`. Index-only DDL — no column or data change.
- **No new persisted field, no new Server Action, no auth/authorization change.**
  This is a read-surface enrichment. Card-face metadata refreshes on the actor's
  next board render (the detail-sheet autosave already calls `router.refresh()`);
  dedicated live broadcast of these fields stays out of scope (matches today's
  priority/cover behaviour).

## Alternatives Considered

1. **Defer the count fields (ship due date + avatars only).** Both use
   already-indexed data (`card.dueDate`; `cardMember`'s composite PK), so no
   migration. Rejected by the human in intake — they chose the full card face.
2. **Compute counts without indexes.** Correct but a known seq-scan regression on
   large boards; violates the CLAUDE.md "index FKs used in queries" rule and the
   US-004 perf budget. Rejected.
3. **Send raw checklist items to the client and count there.** Larger payload on
   the DnD-sensitive board store for no benefit. Rejected — aggregate server-side.
4. **A denormalized counter column on `card`.** A new persisted field + write-path
   maintenance on every checklist/comment mutation; far heavier and a true schema
   contract change. Overkill for a read surface. Rejected.

## Consequences

Positive:

- Overdue cards now warn on the board face; "who's on this card", checklist
  progress, and discussion volume are visible without opening the card.
- The new aggregate queries run on indexed columns; the count work no longer
  scales with table size unbounded.
- Unblocks the planned assignee/due-date **filter** slice (the payload it needed
  now exists).

Tradeoffs:

- The board-load query does more work per card (member take + two `_count`s + a
  checklist-items projection). Bounded and indexed, but not free; watch on very
  large boards alongside the windowing follow-up (decision 0010).
- Card-face metadata is not yet live across clients — it reflects on the next
  render/refresh, consistent with priority/cover today.

## Follow-Up

- Assignee / due-date **filtering** on the board (the payload now supports it).
- Optional realtime fan-out for due-date/checklist/comment-count changes if
  cross-client freshness becomes a felt gap.
- Revisit if board windowing lands (decision 0010) — the per-card aggregate cost
  composes with that work.
