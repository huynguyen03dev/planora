# US-067 Board-level automation entry (Trello-style modal)

## Status

in progress — implemented; unit + integration proven, manual browser QA pending

## Lane

normal

## Product Contract

Automation must be reachable **from within a board**, not only from the
workspace-level `/workspace/[slug]/automation` page. A board's header gains an
**Automation** control that opens a **modal** (overlay on the board — no
navigation) for managing the rules that run on *that* board. This mirrors
Trello's Butler entry point, whose primary surface is a per-board modal; the
workspace page remains the cross-board manager.

The engine, schema, and Server Actions are unchanged — `Rule.boardId` already
scopes a rule to a board (`null` = workspace-wide), and the rule builder already
carries a board select. This story is a new **entry point + presentation**, not
an engine change.

## Relevant Product Docs

- `docs/product/automation.md` (rules, `boardId` scope, execution log)
- `docs/product/boards-and-cards.md` (board header surfaces)
- `docs/decisions/0022-automation-rules-engine.md` (engine contract — unchanged)

## Acceptance Criteria

- The board header shows an **Automation** button for any workspace member
  viewing a board (consistent with the workspace page: reads are open to
  members; mutation affordances appear only for admins — `organization:update`).
- Clicking it opens a **modal** (Radix Dialog), overlaid on the board, with no
  route change. Closing it returns focus to the board with no reload.
- The modal lists the rules that **run on this board** — `boardId === board.id`
  **or** `boardId === null` (workspace-wide rules also fire here) — with the
  same row affordances as the workspace page (enable/disable toggle, edit,
  delete, last-run indicator) for admins; read-only for members.
- **New rule** inside the modal opens the existing `RuleBuilderDialog`
  **pre-scoped to the current board** (board select defaults to this board;
  changeable). Created/edited/deleted rules reflect immediately (existing
  `revalidatePath` + `router.refresh`).
- The modal's execution log shows entries for the board's applicable rules only
  (filtered by the rule ids shown), reusing `ExecutionLogPanel`.
- Data for the modal is fetched **lazily when it opens** (a read Server Action),
  so opening a board that never touches automation adds **zero** extra queries
  to the board page load.
- Workspace-isolation and the admin-only mutation gate are re-enforced in the
  new read action exactly as the workspace page does; a non-member gets
  `notFound`/denied.
- Light/dark parity; the modal body scrolls internally on short viewports and
  never overlaps its footer (the US-066 dialog-overflow fix pattern:
  `flex-1 min-h-0 overflow-y-auto`, not radix `ScrollArea`).

## Design Notes

- **Commands:** none new (reuse `createRuleAction` / `updateRuleAction` /
  `deleteRuleAction` / `toggleRuleEnabledAction`).
- **Queries:** one new read Server Action, e.g.
  `getBoardAutomationDataAction(boardId)` in the board actions module (or the
  automation actions module) →
  `{ canManage, options, rules, logs, lastRunByRule }` scoped to the board's
  workspace, with `rules` filtered to `boardId ∈ {board.id, null}` and `logs`
  filtered to those rule ids. Mirrors the loader in
  `app/(authenticated)/(dashboard)/workspace/[slug]/automation/page.tsx`.
- **API:** new read action is member-gated + workspace-isolated; returns a plain
  serializable object (same envelope style as the existing automation actions).
- **Tables:** none — no schema/migration.
- **Domain rules:** board modal shows board-applicable rules (own + workspace-
  wide); builder defaults board scope to the current board; the workspace page
  remains authoritative for cross-board/workspace-wide management.
- **UI surfaces:**
  - `components/boards/board-header.tsx` — add an **Automation** button beside
    Filter / Archived / BoardMenu (icon: `AiMagicIcon`, matching the workspace
    page's empty-state icon).
  - New `components/workspace/automation/board-automation-dialog.tsx` (`"use
    client"`) — a Dialog that lazy-loads via the read action on first open and
    renders the rules list + `RuleBuilderDialog` (pre-scoped) + `ExecutionLogPanel`.
  - Refactor `automation-management.tsx` to extract the shared inner content
    (rules section + log + toast) so both the workspace page and the modal use
    one implementation; add a `defaultBoardId?` prop to `RuleBuilderDialog` to
    preset the builder's board scope, and an `embedded` mode that drops the
    page `<main>`/`<h1>` chrome.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-067 --unit 1 --integration 1 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | New `getBoardAutomationDataAction`: unauthenticated denied; non-member denied; member gets read but `canManage=false`; admin gets `canManage=true`; rules filtered to `boardId ∈ {board, null}`; cross-workspace board id denied/empty; logs filtered to the shown rule ids. (Vitest, mocked `db`, following `tests/server-actions/automation-rules.test.ts`.) |
| Integration | The read action composes with existing CRUD: a rule created via the pre-scoped builder lands with the current `boardId`; toggling/deleting from the modal round-trips (exercised through the existing action tests — no new mutation paths). |
| E2E | Optional Playwright: open a board → Automation button → modal → create a board-scoped rule → it appears; trigger it from the board → log row shows in the modal. (Extends the `e2e/helpers/app.ts` harness; same pattern as `e2e/automation-log-retention.spec.ts`.) |
| Platform | Manual browser QA: button present on board header (admin + member views); modal opens/closes without navigation; create/edit/delete/toggle from modal; board-scope default correct; log scoped to board; light/dark; short-viewport scroll (no footer overlap). React component internals remain the standing no-RTL gap. |
| Release | `tsc --noEmit` 0, `eslint` 0 errors, full `npm test` green, `npm run build` success. |

## Harness Delta

None required. This story reuses the US-066 automation engine/actions and the
`e2e/helpers/app.ts` harness. If the Playwright E2E is added, register it in
`docs/TEST_MATRIX.md` alongside `automation-log-retention.spec.ts`.

## Evidence

Implemented 2026-07-07 on branch `feat/us-066-automation-rules-engine`.

**Files:**
- `lib/automation/view.ts` — new shared `loadAutomationView(workspaceId, { boardId? })`
  loader; the single query/shape source for both the workspace page and the
  board modal. Board scope filters rules to `boardId ∈ {board, null}` and the log
  to the shown rule ids.
- `.../automation/actions.ts` — new `getBoardAutomationDataAction(boardId)`:
  member-gated, workspace derived from the board (never client-trusted), returns
  `{ workspaceId, canManage, options, rules, logs, lastRunByRule }`.
- `components/workspace/automation/automation-content.tsx` — extracted shared
  surface (rule count + New-rule builder + rules list + execution log + toast).
- `automation-management.tsx` — now thin page chrome around `AutomationContent`.
- `board-automation-dialog.tsx` — board-header **Automation** button + lazy modal.
- `rule-builder-dialog.tsx` — `defaultBoardId` (preset board scope) + `onMutated`.
- `rule-row.tsx` / `execution-log-panel.tsx` — `onMutated` / host-driven refresh
  so the modal re-fetches its board-scoped data after each mutation.
- `board-header.tsx` — renders the Automation control beside Filter/Archived/Menu.

**Gates:** `tsc --noEmit` 0 errors · `eslint` 0 errors on touched files ·
`npm test` **832/832** (added 6 action tests + 4 `loadAutomationView` scope tests)
· `npm run build` success (`ƒ /boards/[boardId]` unchanged).

**Outstanding:** Platform (manual browser QA + screenshots, light/dark,
short-viewport scroll) and the optional Playwright E2E — not yet run.
