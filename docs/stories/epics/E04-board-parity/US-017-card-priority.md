# US-017 Card Priority UI

## Status

implemented

## Lane

normal — 1 flag (existing behavior), moderate code impact across 3 files (types → Server Action → UI)

Intake: Spec slice from `docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md` (Theme C — Retire Half-built Schema, P1).

## Product Contract

Card priority is surfaced in the card detail sheet as a selectable field. Values: Urgent, High, Medium, Low, or None (clears priority). Changing priority calls a Server Action and updates the card immediately — no separate save button, no modal. The priority value is also reflected on the card face in the board view (the card list item shows a color-coded priority indicator).

Priority is personal to the card — no sharing, no notification, no activity log entry (it's a content field, not a notification trigger).

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — Priority section
- `docs/product/cards.md` — Card detail fields

## Acceptance Criteria

- Card detail sheet shows a Priority section with the current value displayed
- Clicking the section opens a dropdown (Select/Combobox) with: Urgent, High, Medium, Low, None
- Selecting a value calls `updateCardPriorityAction` and updates inline — no save button
- The card face (list view) shows a color-coded priority badge/dot when priority is set
- `CardDetailRecord` and `CARD_DETAIL_SELECT` include `priority`
- Priority changes persist across page reload

## Design Notes

- Commands: `updateCardPriorityAction(cardId, priority)` — Server Action (editor+)
- Queries: `getCardDetailForBoard` already works — just needs the select field added
- API: No REST/GraphQL change — field update via Server Action
- Tables: `Card.priority` column exists (`Priority` enum: URGENT, HIGH, MEDIUM, LOW, null)
- Domain rules: Any editor can set/clear priority. Null = no priority (default). No validation beyond enum membership.
- UI surfaces:
  - `card-detail-sheet.tsx` — Priority section (in the metadata area, between labels and estimate/due-date)
  - `card-item.tsx` (or `board-card.tsx` equivalent) — color-coded dot/badge on the card face
  - Priority colors: URGENT=red, HIGH=orange, MEDIUM=yellow, LOW=blue/gray, NONE=hidden

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `updateCardPriority` calls Prisma `update` with correct priority value |
| Integration | Server Action rejects unauthorized user; returns updated card |
| E2E | Manual: open card detail, change priority, verify on card face and persistence |
| Platform | None (no cross-platform change) |
| Release | Feature flag not needed — schema already in prod |

## Harness Delta

- New story file under `E04-board-parity`.
- Update `docs/TEST_MATRIX.md` when proof exists.

## Evidence

TBD after implementation.
