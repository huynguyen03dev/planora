# US-077 Today / My Work Read-Only Cross-Board View

## Status

planned — implementation unstarted.

## Lane

normal

## Product Contract

Provide a unified personal focus view (`/today` or `/my-work`) for logged-in workspace members. The page aggregates cards assigned to the current user across all authorized workspace boards, organized into clean chronological and priority sections (Overdue, Due Today, Due This Week, Later / No Due Date).

**Architecture Contract:**
US-077 is strictly a **read model** constructed dynamically from existing `Card`, `CardMember`, `dueDate`, `priority`, and `archivedAt` fields across authorized boards. **Do not invent a new domain table or database entity.**

## Relevant Product Docs

- `docs/product/overview.md` — primary surfaces and route listing.
- `docs/product/boards-and-cards.md` — card assignment, due dates, and priority metadata.
- `docs/product/workspaces-and-access.md` — workspace membership and board authorization rules.

## Acceptance Criteria

1. Navigating to `/today` displays cards assigned to the authenticated user across all boards in the active workspace.
2. Cards are grouped into four clear visual sections:
   - **Overdue:** Due date is in the past (`dueDate < startOfDay(now)` and `completedAt == null`).
   - **Due Today:** Due date falls on today (`startOfDay(now) <= dueDate <= endOfDay(now)`).
   - **Due This Week:** Due date falls within the next 7 days.
   - **Later / Unscheduled:** Due date is farther out or `dueDate == null`.
3. Clicking any card tile opens the existing Card Detail Sheet in-place or navigates to the target board/card context.
4. Respects workspace membership and board authorization: users only see cards from boards they have permission to access.
5. Archiving a card or board immediately removes it from the `/today` view on next refresh.
6. Zero new database tables or schema migrations created for this feature.

## Design Notes

- **Route:** `app/(authenticated)/(dashboard)/today/page.tsx`.
- **Queries:** `getPersonalWorkCardsQuery({ workspaceId, userId })` using Prisma `findMany` over `Card` with `where: { list: { board: { workspaceId, archivedAt: null } }, archivedAt: null, members: { some: { userId } } }`.
- **UI Surfaces:** Personal Work Dashboard layout, section headers with card count badges, compact card tiles using existing shadcn primitives.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Pure date-grouping and section sorting helper functions (`lib/today.test.ts`) |
| Integration | `getPersonalWorkCardsQuery` returns correct cards scoped to user and workspace, excluding archived/unauthorized boards |
| E2E | Logged-in user assigned to cards across 2 boards opens `/today` and sees all assigned cards grouped correctly in sections |
| Platform | Responsive verification on mobile viewports (375px) |
| Release | Verify page load < 200ms for typical user workloads |

## Harness Delta

Update `docs/TEST_MATRIX.md` row for Today / My Work view.

## Evidence

Implementation unstarted. Commands and proof will be added after development.
