# Test Matrix

This file maps Planora product behavior to proof. It reflects the **actual**
state of the test suite, not aspiration. Do not mark a row `implemented` until
tests or validation evidence exist.

Unit/integration runner: **Vitest 2** (node env). Commands: `npm test` (run
once), `npm run test:watch`. Includes `lib/**/*.test.ts` and `tests/**/*.test.ts`
(excludes `e2e/**`). E2E runner: **Playwright** (`npm run test:e2e`, `e2e/**`),
added in US-009 — a two-client realtime harness, chromium. **CI** runs the
unit/integration gate (`ci.yml`, US-008, required-eligible) and the E2E suite
(`e2e.yml`, US-009, separate non-blocking). There is still **no** React Testing
Library; most React component internals remain unverified.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

| Contract | Unit | Integration | E2E | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Card history events (created/moved/completed/reopened/estimate) | yes | yes | no | implemented | `lib/card-history.test.ts` (16 cases) |
| Board store: remote apply + drag-defer + self-echo dedupe (0008) | yes | partial | no | implemented | `tests/board-store.test.ts` (37 cases) |
| DnD position math + reference preservation (`translate*Drop`) | yes | n/a | no | implemented | `lib/dnd/apply-drop.test.ts` (15 cases) |
| Analytics engine (burndown, lead time, overdue, reopen, coverage) | no | yes | no | implemented | `lib/analytics/engine.test.ts` (3 cases) |
| Analytics CSV export + escaping | no | yes | no | implemented | `tests/analytics-export.test.ts` (2 cases) |
| Server Action security boundary: auth + permission gate + workspace isolation on every mutation (US-006) | yes | partial | no | implemented | `tests/server-actions/{board,list-card,workspace,analytics-read}.test.ts` — 118 cases (A1 auth / A2 permission / A3 isolation + positive control) over 26 mutating + 2 read actions, incl. `moveCardAction` cross-workspace rejection. Sabotage-verified: removing a gate turns A2/A3 red. |
| RBAC role × action allow/deny matrix (US-007) | yes | n/a | no | implemented | `tests/server-actions/rbac-matrix.test.ts` — 142 cases. L1: every role × (entity,verb) cell of the real `admin`/`editor`/`viewer` roles (`lib/permissions.ts`) + AND semantics. L2: board-page UI map (`getBoardPagePermissionsForRole`) agrees with the server matrix. L3: US-006 `roleGrants` copy matches the real matrix. Sabotage-verified per layer. |
| Board CRUD (create/update/delete/archive) | no | partial | no | planned | Security boundary proven (US-006, `board.test.ts`); business logic still unit-untested. |
| List CRUD + reorder + isDone toggle | no | partial | no | planned | Security boundary proven (US-006, `list-card.test.ts`); business logic still unit-untested. |
| Card CRUD / move / archive / details / estimate / due date | no | partial | no | planned | Security boundary proven (US-006, `list-card.test.ts`); business logic (incl. position/lifecycle math in actions) still unit-untested. |
| Card members assign/remove | no | partial | no | planned | Security boundary proven (US-006, `list-card.test.ts`); business logic still unit-untested. |
| Card labels: schema + data layer (CRUD, attach dedupe, detach) | yes | partial | no | implemented | `lib/schemas/label.test.ts` (8), `lib/label.test.ts` (6). Action permission gating (US-005) not yet integration-tested. |
| Card labels: board-store `card:labels-updated` (apply / ref-preserve / self-echo dedupe / scope) | yes | partial | manual | implemented | `tests/board-store.test.ts` (5 label cases). Card-face chips + attach/detach realtime verified manually in browser (US-005 slice 2). |
| In-board card filtering by label (US-013) | yes | n/a | manual | implemented | `lib/board-filter.test.ts` (9 cases: `cardMatchesFilter` empty/OR/no-match, `isFilterActive`, `availableLabels` dedupe+sort+first-seen+empty). Client-side view filter — no DB/Server Action. Manual browser QA (Chrome DevTools): control hidden with no labels, appears once a label is in use, selecting a label hides non-matching cards + shows count badge, Clear restores. Non-matching cards hidden via CSS (Draggable stays mounted) so drop indices stay aligned. Assignee/due-date filtering deferred (slice 2 — needs card payload enrichment). |
| In-board card search by title (US-014) | yes | n/a | manual | implemented | `lib/board-filter.test.ts` (+5 cases: `isSearchActive`, `cardMatchesQuery` empty/whitespace, case-insensitive substring, no-match) → 14 total. Client-side view filter — no DB/Server Action. Composes with the US-013 label filter via AND. Manual browser QA (Chrome DevTools): live title narrowing, case-insensitive match, no-match shows "No cards match" hint, clear (✕) restores, search+label-filter AND leaves only the card matching both. Non-matching cards hidden via CSS (Draggable stays mounted) so drop indices stay aligned. Title-only in slice 1 — description/assignee/due-date search deferred (needs card payload enrichment). |
| Comments | no | partial | no | planned | Security boundary proven (US-006, `list-card.test.ts`: viewer may comment, non-member cannot); `lib/comment.ts` business logic untested. |
| Checklists — CRUD Server Actions + security boundary (US-015) | no | yes | no | implemented | `tests/server-actions/checklist.test.ts` — 22 cases. A1 auth / A2 viewer-denied / A3 cross-workspace isolation + positive control for each of the 5 actions (create/delete checklist, add/toggle/delete item), all gated by `card:["update"]` with workspaceId derived from the checklist's board; plus archived-board/archived-card guards. Sabotage-verified (defeating one gate turns its A2+A3 red). `lib/checklist.ts` is thin (Prisma + float-gap append). Detail-sheet UI is US-015 PR2 (manual QA). Rename/reorder/realtime deferred. |
| Attachments (Cloudinary upload/cleanup) | no | partial | no | planned | Security boundary proven (US-006, `list-card.test.ts`: denied callers never reach upload/write); upload/cleanup logic untested. |
| Auth / session / RBAC (admin/editor/viewer) | yes | partial | no | implemented | Per-mutation gate proven (US-006); full role × action allow/deny matrix proven against the real roles (US-007, `rbac-matrix.test.ts`). `lib/auth.ts` session/login plumbing still unit-untested. |
| Workspaces + invitations (email) | no | partial | no | planned | Settings + invite security boundary proven (US-006, `workspace.test.ts`); invite/email + `lib/workspace.ts` business logic untested. |
| Notifications (in-app + email + socket) | no | no | no | planned | `lib/notification*.ts` untested |
| Real-time sync (socket server/client/emitters) | no | partial | yes | implemented | Wire proven end-to-end, two browser contexts on one board, against real `server.ts` + Postgres. US-009 slice 1 (`e2e/realtime-card-create.spec.ts`): A creates a card → B sees it live. Slice 2 (`e2e/realtime-card-move.spec.ts`): A drags a card across lists (keyboard sensor) → B sees it relocate live; and the **drag-defer invariant** — a remote structural event (archive) is deferred while B is mid-drag, then reconciled on drop (live-rename delivery barrier + socket in-order delivery make it deterministic). Each sabotage-verified (`emitCardCreated`/`emitCardMoved` off; `isDragging` guard removed). US-010 (`e2e/realtime-label-sync.spec.ts`): a label renamed/deleted by one user updates/removes the card-face chip live on another's board — `updateLabelAction`/`deleteLabelAction` fan `card:labels-updated` out per affected card (closes the US-005 limitation); sabotage-verified (fan-out off turns both red) + unit-covered dedupe fix (full `{id,name,color}` snapshot compare). US-011 (`e2e/realtime-card-members.spec.ts`): assign/remove member propagates live to another viewer's open card detail sheet — `assignCardMemberAction`/`removeCardMemberAction` emit `card:members-updated`, store reducer patches `selectedCard` + recomputes the assignable pool (6 unit cases); sabotage-verified (emit off turns it red). US-012 (`e2e/realtime-comment-list-reorder.spec.ts`): a comment posted by one user appears live in another's open card detail sheet (`comment:created`), and a list keyboard-reordered by one user relocates live on another observer's board (`list:moved` — first structural **list** event proven live on an observer; card structural events were proven in US-009). Both emits already wired in `actions.ts`; this is the cross-client proof. Sabotage-verified (both emits off → both observers stale → both red). Pending (no dedicated cross-client proof, lower-risk): `card:updated`, `list:created`/`list:updated`/`list:deleted`, `notification:new`, `analytics:refresh`. |
| Activity audit log | no | no | no | planned | `lib/activity.ts` untested |
| All React components (board UI, card sheet, dashboards) | no | no | no | planned | no component tests configured |

## Coverage Snapshot

- **Well-proven:** the pure/computational core — card-history event derivation,
  DnD position math, Zustand reconciliation, analytics computation + export.
- **Now proven (US-006):** the Server Action *security boundary* — auth,
  permission gate, and workspace isolation on every mutating action (+ analytics
  read isolation). What remains untested on those actions is their *business
  logic* (position math, lifecycle transitions, payload shaping).
- **Now proven (US-007):** the full RBAC role × action allow/deny matrix against
  the real `admin`/`editor`/`viewer` roles, the board-page UI map's agreement
  with it, and the US-006 harness copy's fidelity to it.
- **Largest gaps (highest risk first):** Server Action business logic, real-time
  emitters, notifications, and every React component.

## Evidence Rules

- Unit proof covers pure domain/application rules (`lib/dnd`, `lib/card-history`).
- Integration proof covers Server Actions, DB writes, and provider behavior
  (use Prisma mocks via `vi.mock("@/lib/prisma")` as the existing tests do).
- E2E proof covers user-visible browser flows via **Playwright** (`e2e/**`,
  `npm run test:e2e`), introduced in US-009. Proven: two-client realtime
  card-create (slice 1), card-move across lists, the drag-aware deferral
  invariant (slice 2), label rename/delete propagation (US-010), card-member
  assign/remove propagation (US-011), and comment propagation + list reorder
  (US-012). Card and list drags are driven with the keyboard
  sensor — `@hello-pangea/dnd` ignores synthetic pointer/CDP drags.
- A story can ship without every proof column if its packet explains why.
- New Server Actions are the priority for new tests: they enforce auth,
  permission, workspace isolation, and Zod validation — the security-critical
  boundary.
- **CI gate (US-008):** `.github/workflows/ci.yml` runs `lint → tsc --noEmit →
  npm test` on every PR/push into `dev`/`main`, so the proofs in this matrix run
  automatically. The gate is advisory until added to branch protection as a
  required status check.
