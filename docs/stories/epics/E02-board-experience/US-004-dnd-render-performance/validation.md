# Validation

## Proof Strategy

Two things must hold before the story is `implemented`:

1. **Correctness preserved.** Existing unit suites stay green and are extended:
   drag translation (`apply-drop`) and the board store's drag-aware deferral +
   the new self-echo dedupe. No regression to optimistic commit / rollback or the
   structural-event deferral invariant.
2. **Performance improved, measured the same way.** Re-run the baseline
   keyboard-drag trace on an equivalent board (5 lists × 18 cards) and show a
   material drop in per-interaction latency and main-thread JS vs. the baseline in
   `overview.md`.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | `apply-drop.test.ts`: extend for reference-preservation — untouched lists return the **same** reference; mutated source/destination return new ones; neighbor-id fields unchanged. `board-store.test.ts`: `applyRemoteCardMoved` / `applyRemoteListMoved` self-echo is a no-op for already-reflected state; a genuine cross-user move still applies; deferral-while-dragging unchanged. |
| Integration | n/a — no Server Action behavior change except removal of `revalidatePath` on reorder/move (no DB-shape change to assert). |
| E2E | When RTL/Playwright exists: drag a card within a list, across lists, reorder a list; assert optimistic order paints and persists across refresh (float-gap). Two-client test: actor's move is not double-applied; observer still sees the move. |
| Platform | n/a (browser only). |
| Performance | Chrome DevTools trace, CPU 1×, ~90 cards, keyboard drag (lift → moves → cross-column → drop). Targets: per-move total latency < ~50 ms; lift and drop main-thread JS materially below the 1050 ms / 1396 ms baseline; page INP out of the "bad" (>500 ms) band. |
| Logs/Audit | n/a (no audit surface). |

## Fixtures

- Fresh signup user (per `dnd-keyboard-drag-testing` memory: keyboard drag, not
  CDP pointer drag; `fill`/`fill_form` for controlled inputs).
- Seed board: 5 lists × 18 cards (90 cards). Seed via a `tsx` script using the
  `db` singleton against the dev DB (createMany), or equivalent.
- Board under test in this baseline: `be3e13cb-0747-4254-9e1d-6725088b6f1e`
  (workspace "Perf WS"). Re-seed for a clean comparison run.

## Commands

```text
npm test                                   # apply-drop + board-store suites green
npx vitest run lib/dnd/apply-drop.test.ts
npx vitest run tests/board-store.test.ts
# Performance: drive keyboard drag via Chrome DevTools MCP, capture trace,
# compare per-interaction latency + INP against overview.md baseline.
```

## Acceptance Evidence

Baseline captured (pre-fix): INP 1561 ms; lift 1217 ms, cross-column move 637 ms,
drop 1561 ms; trace `scratchpad/dnd-trace.json`. Post-fix trace + suite results to
be added after implementation.
