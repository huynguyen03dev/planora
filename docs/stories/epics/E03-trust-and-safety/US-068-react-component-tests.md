# US-068 React component tests — stand up RTL on Vitest, prove high-logic client components

## Status

implemented

## Lane

normal

## Product Contract

React component internals are the largest untested surface in the codebase.
`AGENTS.md` and `docs/TEST_MATRIX.md` both acknowledge it: the Server Action
security boundary, position math, the board-store reducer, socket room auth, and
analytics are all proven, but the user-facing **client** components that turn
those primitives into an interface have **zero** automated component-level tests
— their only proof is manual QA (Chrome DevTools MCP screenshots in
`.ui-review/`).

This story closes that gap without introducing a second test system. It stands
up React Testing Library (React-19 compatible) on the **existing Vitest runner**
and proves a representative set of high-logic client components by exercising
their behavior — render, user interaction, and resulting state — not their
implementation details. It deliberately does **not** try to test async React
Server Components (RTL cannot render them); those remain covered by the
Playwright E2E suite (US-009+). The result is a coherent three-tier proof story
we can state on demand: logic + server boundary via node-env Vitest, client
components via RTL, real user flows via Playwright.

## Relevant Product Docs

- `docs/TEST_MATRIX.md` — the contract-to-proof map; this story adds the missing
  "React component internals" coverage and updates the matrix.
- `docs/product/boards-and-cards.md` — the board/card client surfaces under test
  (filter popover, card detail sheet).
- `docs/product/automation.md` — the automation rule builder under test.

## Acceptance Criteria

- React Testing Library and its ecosystem are added as devDependencies at
  React-19-compatible versions: `@testing-library/react@^16`,
  `@testing-library/dom`, `@testing-library/user-event`,
  `@testing-library/jest-dom`, and `happy-dom`.
- `vitest.config.ts` is split into two **projects** so environments do not mix:
  a `node` project (unchanged include globs, unchanged `environment: "node"`)
  and a `components` project (`environment: "happy-dom"`, include
  `components/**/*.test.tsx` and `app/**/*.test.tsx`, a `setupFiles` entry).
- The existing node suite still passes with the **same test count** it had before
  this story (no test moves to the wrong environment, no global env change slows
  it down).
- A `vitest.setup.ts` wires `@testing-library/jest-dom/vitest` matchers for the
  `components` project only.
- A representative set of **high-logic client components** has behavioral tests
  (interactions driven by `user-event`, assertions on rendered output/state):
  - `components/boards/board-filter.tsx` — the unified filter popover.
  - `components/boards/card-detail-sheet.tsx` — the card dialog (autosave model).
  - `components/workspace/automation/rule-builder-dialog.tsx` — the automation
    rule builder (trigger config + ordered action steps).
- Tests assert **behavior, not implementation**: no shallow rendering, no
  snapshot-only tests, query by role/label/text (accessible queries), and never
  reach into component internals or private state.
- `npm test` runs **both** projects in one invocation, and the CI gate
  (`.github/workflows/ci.yml`) exercises both (no new CI job needed if `npm test`
  already runs all Vitest projects — confirm and document).
- Async Server Components are explicitly out of scope and documented as such;
  their proof stays with the Playwright E2E suite.

## Design Notes

- Commands: `vitest.config.ts` (projects split), new `vitest.setup.ts`, new
  `components/**/*.test.tsx` and (if needed) `app/**/*.test.tsx` files. No
  application source changes expected — this is proof, not behavior.
- Queries: none.
- API: none.
- Tables: none.
- Domain rules:
  - Client-only: RTL renders `"use client"` components; async RSC is excluded.
  - Environment isolation: only `*.test.tsx` under `components/`/`app/` run on
    happy-dom; all `*.test.ts` stay on node. The existing `server-only` alias
    mock in `vitest.config.ts` is preserved across both projects.
  - Behavior over structure: accessible queries + `user-event`, no snapshots.
- UI surfaces: none added; existing client components are the system under test.
- Version pin rationale: `@testing-library/react@16` is the first line that
  supports React 19; earlier majors break against `react-dom@19`.
- Representative-set rationale: pick the components with the most branching
  interaction logic (filter combination, autosave, dynamic rule steps) where a
  component test earns its keep; do not chase 100% component coverage.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-068 --unit 1 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | RTL behavioral tests for `board-filter`, `card-detail-sheet`, `rule-builder-dialog` (render + `user-event` interaction + state assertions), green in the `components` Vitest project |
| Integration | n/a — component tests mock Server Action calls at the module boundary; cross-module flows stay in E2E |
| E2E | Unchanged; async RSC and full user flows remain proven by the Playwright suite (US-009+) |
| Platform | `components` project runs on happy-dom under Node in CI (`ubuntu-latest`) alongside the node project |
| Release | Both projects run in the `dev → main` promotion gate via `npm test` in `ci.yml` |

## Harness Delta

- `docs/TEST_MATRIX.md`: add/flip the "React component internals" row from *gap*
  to *partial* (representative client components proven; full coverage still
  open).
- `AGENTS.md`: update the "no React Testing Library … React component internals
  remain the largest gap" wording to reflect RTL now exists with a representative
  proof set.
- Propose (not required here): a follow-up story to widen component coverage to
  the remaining interactive client components once this foundation lands.

## Evidence

- `npm test` → **44 files, 848 tests passed**. `node` project unchanged at 832
  (was 832); new `components` project = 16 tests across 3 files.
- Component suites (happy-dom, `--project components`):
  - `components/boards/board-filter.test.tsx` — 5 (store-driven filter popover:
    open, sections render, status toggle → store, active-count badge, clear).
  - `components/workspace/automation/rule-builder-dialog.test.tsx` — 5 (open/close,
    add/remove steps, name-required guard, valid submit → action + notify +
    refresh + close, server-error surfaced without close).
  - `components/boards/card-detail-sheet.test.tsx` — 6 (title autosave-on-blur →
    `updateCardDetailsAction`, unchanged/empty guards, editable vs read-only).
- Config: `vitest.config.ts` (shared aliases) + `vitest.workspace.ts` (node +
  components projects) + `vitest.setup.ts` (jest-dom + cleanup). devDeps added:
  `@testing-library/react@^16`, `@testing-library/dom`,
  `@testing-library/user-event`, `@testing-library/jest-dom`, `happy-dom`.
- `npx tsc --noEmit` → 0 errors. `eslint` on new files → clean.
- Note: Vitest 2.1 has no inline `test.projects`; multi-project uses
  `vitest.workspace.ts` (that inline key is a Vitest 3 feature).

**Coverage widening (same foundation):** grown to **14 client-component suites /
155 component tests; full suite 55 files / 987 tests**. `tsc --noEmit` 0 errors,
eslint clean. Added beyond the seed set:
- Boards: `card-completion-toggle` (10), `card-checklists-section` (24),
  `card-labels-section` (13), `card-attachments` (12, render/gating — upload
  file-input not simulated).
- Automation: `rule-row` (16), `automation-content` (11),
  `execution-log-panel` (16), `board-automation-dialog` (7).
- Members: `invite-member-dialog` (4), `member-row` (15).
- Notifications: `notification-dropdown` (11).

Still uncovered (future waves): board content, `list-card-item`/`list-column`
(need a `DragDropContext` wrapper), dashboard charts, comment composer.
`components/ui/*` shadcn primitives + SVG charts intentionally skipped (upstream /
engine-tested). Bulk of the wave-2 suites authored by delegated pi subagents,
each self-verified to green; all re-verified here by a full `npm test` run.
