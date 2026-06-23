# Test Matrix

This file maps Planora product behavior to proof. It reflects the **actual**
state of the test suite, not aspiration. Do not mark a row `implemented` until
tests or validation evidence exist.

Runner: **Vitest 2** (node env). Commands: `npm test` (run once),
`npm run test:watch`. Includes `lib/**/*.test.ts` and `tests/**/*.test.ts`.
There is **no** React Testing Library, no E2E (Playwright), and **no CI at all**
yet (`.github/workflows/` has no jobs — the OpenCode review/agent workflows were
removed). Component and browser flows are currently unverified.

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
| Board CRUD (create/update/delete/archive) | no | no | no | planned | actions in `boards/actions.ts` untested |
| List CRUD + reorder + isDone toggle | no | no | no | planned | `lib/list.ts`, `boards/[boardId]/actions.ts` untested |
| Card CRUD / move / archive / details / estimate / due date | no | no | no | planned | `lib/card.ts` (679 lines) untested |
| Card members assign/remove | no | no | no | planned | `lib/card-member.ts` untested |
| Card labels: schema + data layer (CRUD, attach dedupe, detach) | yes | partial | no | implemented | `lib/schemas/label.test.ts` (8), `lib/label.test.ts` (6). Action permission gating (US-005) not yet integration-tested. |
| Card labels: board-store `card:labels-updated` (apply / ref-preserve / self-echo dedupe / scope) | yes | partial | manual | implemented | `tests/board-store.test.ts` (5 label cases). Card-face chips + attach/detach realtime verified manually in browser (US-005 slice 2). |
| Comments | no | no | no | planned | `lib/comment.ts` untested |
| Attachments (Cloudinary upload/cleanup) | no | no | no | planned | `lib/attachment.ts` untested |
| Auth / session / RBAC (admin/editor/viewer) | no | no | no | planned | `lib/auth.ts`, `lib/permissions.ts`, `lib/authorization.ts` untested |
| Workspaces + invitations (email) | no | no | no | planned | `lib/workspace.ts`, `lib/invitation*.ts` untested |
| Notifications (in-app + email + socket) | no | no | no | planned | `lib/notification*.ts` untested |
| Real-time sync (socket server/client/emitters) | no | no | no | planned | `lib/realtime/*` untested |
| Activity audit log | no | no | no | planned | `lib/activity.ts` untested |
| All React components (board UI, card sheet, dashboards) | no | no | no | planned | no component tests configured |

## Coverage Snapshot

- **Well-proven:** the pure/computational core — card-history event derivation,
  DnD position math, Zustand reconciliation, analytics computation + export.
- **Largest gaps (highest risk first):** Server Actions for board/list/card CRUD
  (the mutation boundary, ~2,800 lines), auth/RBAC, real-time emitters,
  notifications, and every React component.

## Evidence Rules

- Unit proof covers pure domain/application rules (`lib/dnd`, `lib/card-history`).
- Integration proof covers Server Actions, DB writes, and provider behavior
  (use Prisma mocks via `vi.mock("@/lib/prisma")` as the existing tests do).
- E2E proof covers user-visible browser flows — **none configured yet**; adding
  Playwright is a high-value follow-up given the drag-and-drop UX.
- A story can ship without every proof column if its packet explains why.
- New Server Actions are the priority for new tests: they enforce auth,
  permission, workspace isolation, and Zod validation — the security-critical
  boundary.
