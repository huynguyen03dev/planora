# US-018 Card Cover Images

## Status

implemented

## Lane

normal — 1 flag (existing behavior), moderate code impact across 3 files (types → Server Action → UI in 2 components)

Intake: Spec slice from `docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md` (Theme C — Retire Half-built Schema, P1).

## Product Contract

Cards can have a cover image displayed as a banner at the top of the card detail sheet and as a thumbnail on the card face in list view. The cover image is set from an existing card attachment or from a direct upload. Removing the cover clears the field but does not delete the attachment.

The cover is visual decoration only — no sharing, notification, or activity log entry.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — Cover images section

## Acceptance Criteria

- Card detail sheet shows the cover image as a full-width banner between header and content (when set)
- User can set the cover by selecting from existing card attachments (dropdown/gallery)
- User can also upload a new image directly as the cover
- A "Remove cover" button clears the cover image
- Card face in list view shows a small cover thumbnail strip (16px tall) above the card content
- `CardDetailRecord` and `CARD_DETAIL_SELECT` include `coverImage`
- Cover persists across page reload

## Design Notes

- Commands: `updateCardCoverAction(cardId, coverImage)` — Server Action (editor+). `coverImage` is a URL string or null (to remove).
- Queries: `getCardDetailForBoard` already works — just needs the select field added
- API: No REST/GraphQL change — field update via Server Action
- Tables: `Card.coverImage` column exists (String?, nullable)
- Domain rules: Any editor can set/clear cover. Cover URL must be from this board's workspace (attachments). No external URLs allowed initially (security: prevents tracking pixels).
- UI surfaces:
  - `card-detail-sheet.tsx` — Cover banner between the header section and the labels section; "Set cover" / "Remove cover" controls
  - Card list item (`card-item.tsx` or equivalent) — thumbnail strip at top when coverImage is set
  - Reuses `CardAttachments` for sourcing images: existing attachments shown as selectable covers

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `updateCardCover` calls Prisma `update` with correct coverImage value |
| Integration | Server Action rejects unauthorized user; returns updated card |
| E2E | Manual: set cover from attachment, verify banner in detail + thumbnail on card face; remove cover; persistence across reload |
| Platform | None (no cross-platform change) |
| Release | Feature flag not needed — schema already in prod |

## Harness Delta

- New story file under `E04-board-parity`.
- Update `docs/TEST_MATRIX.md` when proof exists.

## Evidence

TBD after implementation.
