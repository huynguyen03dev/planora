# US-019 Board stars / favorites

## Status

implemented

## Lane

tiny — existing schema, one Server Action, one UI icon, no migration, no external systems, no public-contract change. 0 flag → tiny lane.

Intake: Spec slice from `docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md` (Theme C — Retire Half-built Schema, P1).

## Product Contract

On the boards listing page, each board card shows a star icon. Clicking it toggles the board as a favorite (creates/deletes a `BoardStar` row scoped to the current user). A board is starred immediately on click (optimistic toggle) — the server action runs in the background. Starred boards also appear in a dedicated "Starred" section at the top of the boards overview (above per-workspace sections).

The star is per-user, per-board — no sharing, no notification, no activity log entry (it's a personal view concern, not a collaborative one).

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — Boards section (starring)

## Acceptance Criteria

- Each `BoardCard` shows a star icon (filled when starred, outline when not).
- Clicking the star toggles the board's starred state — optimistic UI, no page reload.
- The toggle calls a `toggleBoardStarAction` Server Action that upserts/deletes the `BoardStar` row.
- The boards listing page (`/boards`) fetches the current user's starred board IDs server-side.
- A "Starred" section appears at the top of `BoardsOverview` when the user has at least one starred board, showing those board cards.
- Starred boards also appear in their normal workspace section below.

## Design Notes

- Commands: `toggleBoardStarAction(boardId)` — Server Action (editor+, but any workspace member can star).
- Queries: `getStarredBoardIds(userId)` — returns `Set<string>` of board IDs.
- API: No REST/GraphQL change — star state is in page props.
- Tables: `BoardStar` (exists — `boardId`, `userId`, `createdAt`; unique on `[boardId, userId]`).
- Domain rules: Single-row upsert on toggle. Delete on unstar. Idempotent — rapid double-clicks don't create duplicates.
- UI surfaces:
  - `BoardCard` — star icon top-right, overlaid on the card gradient. Uses `StarIcon` / `StarFilledIcon` from `@hugeicons/core-free-icons`.
  - `BoardsOverview` — "Starred" section (conditional, above workspace sections).
  - Props threading: `starredBoardIds: Set<string>` through `BoardsPageWrapper` → `BoardsPageClient` → `BoardsOverview` / `WorkspaceSection` / `WorkspaceBoardsView` → `BoardCard`.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `toggleBoardStar` calls Prisma `upsert`/`delete` correctly (mock db) |
| Integration | Server Action rejects unauthorized user; returns correct state |
| E2E | Manual: star/unstar a board, verify persistence across page reload |
| Platform | None (no cross-platform change) |
| Release | Feature flag not needed — schema already in prod |

## Harness Delta

- New story file under `E04-board-parity`.
- Update `docs/TEST_MATRIX.md` when proof exists.

## Evidence

TBD after implementation.
