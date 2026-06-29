# Validation — US-030 Card-face metadata row

## Proof Strategy

Manual browser QA is the load-bearing proof (React components are unit/E2E
untested — IN-01 residual). DOM-verified metadata values on the seeded demo board
at desktop + ≤375px, plus a green type/lint/build gate and the existing unit
suite (which exercises the shared `ListWithCards` type) staying green.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | No new pure logic to unit-test (date/state helper is presentation). Existing `lib/dnd/apply-drop.test.ts` (15) + `tests/board-store.test.ts` (49) updated for the enriched card type and **must stay green** — they prove the type threaded through DnD math + store reducers without regression. |
| Integration | n/a — reuses existing queries/actions; no new Server Action. |
| E2E | n/a — no harness. |
| Platform | Card face shows due badge (overdue/today/soon/done), avatars (+N overflow), checklist `done/total`, comment count; metadata row absent when card has none; viewer sees the same face; DnD still drags/drops; desktop + ≤375px reflow. |
| Performance | New aggregates (`checklist`/`checklistItem`/`comment`) run on the FK indexes added by migration `…_add_card_face_metadata_indexes`; checklist items aggregated server-side (no raw items on the wire); avatars capped at 3. |
| Logs/Audit | n/a. |

## Fixtures

`scripts/seed-demo-board.ts` — the "Product Roadmap" demo board (5 lists / 17
cards) exercising due dates, assignees, checklists, and comments across cards.

## Commands

```text
npx prisma migrate dev --name add_card_face_metadata_indexes   # applied
npx tsc --noEmit            # clean (excl. pre-existing untracked scripts/perf-measure.ts)
npx eslint <changed files>  # 0 errors
npx vitest run lib/dnd/apply-drop.test.ts tests/board-store.test.ts   # 64 passed
npm run build               # compiles
```

## Acceptance Evidence

Verified on the seeded demo board ("Product Roadmap"), 2026-06-29.

- **Gate:** `tsc --noEmit` clean (only the pre-existing untracked
  `scripts/perf-measure.ts` errors, untouched). `eslint` on the changed files: 0
  errors (only the 1 pre-existing cover-image `<img>` warning). Unit suite:
  **64 passed** (apply-drop 15 + board-store 49) after threading the enriched type.
- **Migration:** `20260629023148_add_card_face_metadata_indexes` applied; SQL is
  three `CREATE INDEX` statements only (additive).
- **Browser QA** — seeded demo board ("Product Roadmap"), 2026-06-29, desktop +
  375px (a11y tree + screenshots). DOM-verified the metadata row per card:
  - "Redesign the empty-board state": High · **Today** (amber) · checklist
    **2/4** · **2** comments · RB + PP avatars.
  - "Implement realtime card move broadcast": Urgent · **Jun 27** (overdue, red —
    today is Jun 29) · 2/4 · 2 comments · RB + PP.
  - "Card labels CRUD + realtime": **3/3** checklist (all-done, emerald) · RB + PP.
  - "PR #41 — notification bell unification": Jun 28 (overdue) · **1** comment ·
    RB + PP.
  - Upcoming dates (Jul 10, Jul 2) render muted; cards with no metadata omit the
    row entirely.
  - Due/checklist/comment badges expose `role="img"` + an authoritative
    `aria-label` ("Due Jun 27, overdue", "2 of 4 checklist items complete", "2
    comments"); avatars use alt/initials, the `+N` chip has `aria-label`.
  - **375px:** cards reflow single-column, the metadata cluster wraps, the avatar
    stack stays right-aligned (`shrink-0`), no horizontal overflow inside cards.
  - **No console errors/warnings** after load + reload. DnD still drags/drops
    (unit suite green; card-type threaded without touching drop math).
  - Screenshots: `.ui-review/us030-01-desktop.png`, `.ui-review/us030-02-mobile-375.png`.
