# US-079 Per-Board Capture & Triage Using First-Class Cards

## Status

planned — implementation unstarted.

## Lane

normal (with explicit escalation gate note)

## Product Contract

Provide a dedicated "Capture / Inbox" list on kanban boards for receiving and triaging new incoming work items. Quick-captured items land in the capture list, where team members can quickly review, enrich, assign, and triage them into target workflow lists.

**Architecture Contract:**
Items in the capture list are standard, first-class `Card` entities. Capture lists are standard `List` entities (by default, the left-most column on a board). **No new Request entity, AI routing, SLA engine, external webhook, or third-party intake provider.**

## ⚠️ Escalation Gate Note

**Schema Change Escalation Requirement:**
If implementing US-079 requires adding a new schema field to `List` (e.g. `isCaptureList: Boolean`, `listType: Enum`, or database migration), the engineer MUST:
1. Re-run `docs/FEATURE_INTAKE.md` risk checklist.
2. Mark the `data_model` risk flag.
3. Escalate US-079 from `normal` to `high-risk` lane.
4. Expand this story artifact into a complete four-file high-risk packet (`overview.md`, `design.md`, `execplan.md`, `validation.md`) and record a decision ADR before writing any implementation code.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — list ordering, card triage, and card moves across lists.
- `docs/decisions/0028-defer-external-email-form-intake.md` — Accepted decision restricting intake to first-party cards.

## Acceptance Criteria

1. Boards designate a "Capture / Inbox" list (defaults to the left-most column or list named "Inbox" / "Capture").
2. Quick-captured cards created without an explicit list selection land automatically in the board's capture list.
3. The board view provides a streamlined "Triage" bar or quick action menu on cards in the capture list:
   - **Quick Move:** One-click move to target workflow lists (e.g. "To Do", "In Progress").
   - **Quick Assign:** Assign self or team member.
   - **Set Due Date / Priority:** Rapid inline priority and date picker.
4. Triaging a card invokes existing `moveCardAction` and `updateCardDetailsAction` Server Actions.
5. All triage actions maintain standard position gap math and broadcast realtime socket events (`card:moved`, `card:updated`).

## Design Notes

- **Queries:** `getCaptureListForBoard({ boardId })` returns the first list ordered by position, or list matching name "Inbox".
- **Actions:** Uses existing `moveCardAction`, `assignCardMemberAction`, `updateCardDueDateAction`.
- **UI Surfaces:** Capture list header badge ("Inbox"), inline card triage toolbar.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Capture list resolution logic unit tests (`lib/capture-triage.test.ts`) |
| Integration | Card created via capture lands in capture list; triage move relocates card to target list with position math |
| E2E | User adds 3 items to Capture list, triages item 1 to "In Progress", assigns item 2 to self, and verifies board updates live |
| Platform | Mobile view rendering of capture list and triage toolbar (375px) |
| Release | Verify triage operations require zero page reloads |

## Harness Delta

Update `docs/TEST_MATRIX.md` row for Per-Board Capture & Triage.

## Evidence

Implementation unstarted. Commands and proof will be added after development.
