# US-078 Global Quick Capture Using Standard Card Creation

## Status

**retired — absorbed by US-083 (W7).** Owner locked the roadmap combination into a single high-risk story, US-083 "Demo-ready daily work loop" (delivery Stage 1: foundation/demo reliability; Stage 2: daily-work UX). This packet is retained as the **authoritative home of the full acceptance criteria below**; US-083 workstream W7 incorporates them **by exact reference** (global quick capture via existing `createCardAction`, `C` + `Cmd/Ctrl+K`, same no-new-capture-entity constraint) and cannot close until every referenced AC maps to explicit evidence (self-audit table in the US-083 packet). Harness row: `retired`. The `docs/TEST_MATRIX.md` row for US-078 is marked retired and points at US-083.

## Lane

normal

## Product Contract

Provide a global, low-friction quick capture modal accessible from any authenticated page in Planora (via a top header "Quick Capture" button or global keyboard shortcut `C` / `Cmd+K`). The dialog allows users to rapidly record a task by selecting a target board and list, entering a title, optional description, due date, and priority, and submitting.

**Architecture Contract:**
US-078 MVP wraps the existing standard card creation logic (`createCardAction`). **Do not invent a new capture entity, Request model, or separate table.** All captured items are created as ordinary `Card` records on the designated board and list.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — card creation (`createCardAction`), position assignment, and realtime sync.
- `docs/decisions/0028-defer-external-email-form-intake.md` — Accepted decision restricting intake to authenticated first-party card creation.

## Acceptance Criteria

1. Pressing the global header button or keyboard shortcut opens the Quick Capture modal from any authenticated route (`/boards`, `/today`, `/workspace`, `/notifications`).
2. Target board selector defaults to the user's currently active board (or most recently visited board in the workspace).
3. Target list selector defaults to the first/left-most list (or designated capture list) on the chosen board.
4. User enters title (required), description, due date, and priority.
5. Submitting invokes the existing `createCardAction`, appending an ordinary `Card` to the target list with position gap math.
6. Emits `card:created` socket event and revalidates board path so the card appears live on the target board.
7. Displays a subtle success notification with a direct link to "View Card on Board".

## Design Notes

- **UI Components:** `components/navigation/quick-capture-dialog.tsx` using shadcn `Dialog`, `Select`, `Input`, `Textarea`, and `DatePicker`.
- **Actions:** Wraps existing `createCardAction` in `lib/actions/card.ts`.
- **Keyboard Shortcut:** Global listener for key sequence `C` or `Cmd+K` when no input/textarea is focused.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Default board/list resolution helper unit tests (`lib/quick-capture.test.ts`) |
| Integration | Quick capture form submission invokes `createCardAction` and creates standard `Card` row with correct attributes |
| E2E | User on `/today` opens Quick Capture via keyboard shortcut, fills title, selects Board B / List 1, submits, and verifies card appears on Board B |
| Platform | Verify modal responsiveness on mobile viewports (375px) |
| Release | Verify modal opens < 50ms without blocking UI |

## Harness Delta

Superseded as separate work: US-083 W7 incorporates the acceptance criteria above by exact reference; update `docs/TEST_MATRIX.md` US-083 row (Global Quick Capture) instead of this one.

## Evidence

Implemented inside US-083 W7 (landed 2026-08-02, committed in this W7 commit; focused-test checkpoint + final E2E gate): `lib/quick-capture.test.ts` (33 — default resolution,
shortcut guard matrix, storage contract), `tests/server-actions/quick-capture.test.ts`
(18 — options action membership/role isolation + one-create optional persistence +
automation-evaluation preservation + emit/history fidelity + restore emit
fidelity + position/revalidate), RTL `components/quick-capture/` (36 — immediate
open, lazy first-open options + mid-flight-close refetch (late resolve/reject of
a stale fetch never overwrites the new request), controlled selects
(zero uncontrolled↔controlled warnings), defaults/fallbacks, list reset, required
title, optional payload, success toast/deep link, error, 375px-safe classes,
shortcut guards with preventDefault exactly-once/zero), header chrome + board-store
fidelity + null-fallback cases. Focused gate 146/146 green (final
post-correction run; the baseline was already 141, not 140), affected-area
regression 229/229 green, `tsc --noEmit` / ESLint / `git diff --check`
clean. Final E2E: `e2e/quick-capture.spec.ts` **5/5 green** (2026-08-02 fresh
shared-server run, ≈1.3–1.4m; the hydration-readiness marker + US-043
two-Escape fixes landed before the run — see the US-083 validation.md W7
section for the run log). Full-suite gate at the stable checkpoint: `npm test`
1351 green (85 files). RED/GREEN commands in the US-083 execplan/validation W7
sections.
