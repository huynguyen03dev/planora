# US-077 Today / My Work Read-Only Cross-Board View

## Status

**retired — absorbed by US-083 (W6).** Owner locked the roadmap combination into a single high-risk story, US-083 "Demo-ready daily work loop" (delivery Stage 1: foundation/demo reliability; Stage 2: daily-work UX). This packet is retained as the **authoritative home of the full acceptance criteria below**; US-083 workstream W6 incorporates them **by exact reference** (same route, same queries, same rules, same no-new-table constraint) and cannot close until every referenced AC maps to explicit evidence (self-audit table in the US-083 packet). Harness row: `retired`. The `docs/TEST_MATRIX.md` row for US-077 is marked retired and points at US-083.

## Lane

normal

## Product Contract

Provide a unified personal focus view (`/today` or `/my-work`) for logged-in workspace members. The page aggregates cards assigned to the current user across **every workspace the user is a member of** (cross-workspace read model; see the AC1 amendment below), organized into clean chronological and priority sections (Overdue, Due Today, Due This Week, Later / No Due Date).

**Architecture Contract:**
US-077 is strictly a **read model** constructed dynamically from existing `Card`, `CardMember`, `dueDate`, `priority`, and `archivedAt` fields across authorized boards. **Do not invent a new domain table or database entity.**

## Relevant Product Docs

- `docs/product/overview.md` — primary surfaces and route listing.
- `docs/product/boards-and-cards.md` — card assignment, due dates, and priority metadata.
- `docs/product/workspaces-and-access.md` — workspace membership and board authorization rules.

## Acceptance Criteria

1. Navigating to `/today` displays cards assigned to the authenticated user across **all boards in every workspace the user is a member of**. *(AC1 amended 2026-08-02 by US-083 W6 — locked cross-workspace interpretation: workspace scope is derived server-side from the session user's `WorkspaceMember` rows and never accepted from the client, so the view is personal and membership-scoped, not "active workspace"-scoped; the section-name contract below uses the locked bucket names.)*
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
- **Queries:** `getPersonalWorkCards(userId)` (US-083 W6 implementation of the planned `getPersonalWorkCardsQuery({ workspaceId, userId })` — the workspace parameter is deliberately dropped: membership-derived server-side, cross-workspace by lock) using Prisma `findMany` over `Card` with `where: { archivedAt: null, deletedAt: null, completedAt: null, members: { some: { userId } }, list: { archivedAt: null, board: { archivedAt: null, workspaceId: { in: <memberships> } } } }` — one membership query + one bounded card query, no N+1.
- **UI Surfaces:** Personal Work Dashboard layout, section headers with card count badges, compact card tiles using existing shadcn primitives. Section names (locked): **Overdue / Due Today / Due This Week / Later** with exact calendar-day predicates (diff < 0 / 0 / 1..7 / ≥8 or none) computed in the viewer's local time.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Pure date-grouping and section sorting helper functions (`lib/today.test.ts`) |
| Integration | `getPersonalWorkCardsQuery` returns correct cards scoped to user and workspace, excluding archived/unauthorized boards |
| E2E | Logged-in user assigned to cards across 2 boards opens `/today` and sees all assigned cards grouped correctly in sections |
| Platform | Responsive verification on mobile viewports (375px) |
| Release | Verify page load < 200ms for typical user workloads |

## Harness Delta

Superseded as separate work: US-083 W6 incorporates the acceptance criteria above by exact reference; update `docs/TEST_MATRIX.md` US-083 row (Today / My Work) instead of this one.

## Evidence

Implementation unstarted. Commands and proof will be added after development.
