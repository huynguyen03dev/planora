# Exec Plan

## Goal

Make board drag-and-drop smooth on a ~100-card board: bring per-move interaction
latency under the 200 ms INP target and eliminate the ~1.2–1.6 s main-thread
stalls on lift and drop, without weakening realtime sync, the optimistic-commit
contract, or the drag-aware deferral invariant.

## Scope

In scope:

- **Item 1 — Memoization.** `React.memo` on `ListCardItem` and `ListColumn`;
  `useCallback` for `openCard`; stop passing inline object/array literals as props
  (pass stable `card` reference). Preserve untouched-list references in
  `apply-drop.ts` so memoized columns that didn't change don't re-render.
- **Item 2 — Remove the board-wide drag lock.** Drop the `isPersisting`
  (`useTransition`) gate that disables `isDropDisabled` / `canSortList` /
  `canSortCards` for the whole board until the server action resolves. The
  optimistic store + per-action rollback already cover correctness; the defensive
  permission re-check in `onDragEnd` stays.
- **Item 3 — Realtime churn (contract change, decision `0008`).** Add self-echo
  dedupe to `applyRemoteCardMoved` / `applyRemoteListMoved` so the mover ignores
  their own echo; drop `revalidatePath` on `reorderCardAction` /
  `reorderListAction` / `moveCardAction` in favor of the optimistic + socket path
  (or scope it so the actor doesn't pay a full RSC re-render for their own move).

Out of scope:

- List virtualization / windowing.
- Float-gap ordering math, Server Action ordering contract.
- Schema, migrations, auth, authorization role logic.

## Risk Classification

Risk flags:

- **Existing behavior** — `lib/dnd/apply-drop.test.ts` and
  `tests/board-store.test.ts` cover code under change; optimistic commit + drag
  deferral are accepted behaviors.
- **Weak proof** — DnD React components (`ListColumn`, `ListCardItem`,
  `BoardContent`) are untested; no RTL/E2E coverage yet.
- **Public contracts** — Item 3 changes client-visible realtime behavior
  (`card:moved` / `list:moved` self-echo handling, revalidate-driven refresh).
- **Multi-domain** — touches `boards-and-cards` and `realtime-sync`.

Hard gates:

- None. (No auth, authorization, data loss/migration, audit/security, external
  provider, or validation-weakening.)

## Work Phases

1. Discovery — baseline profiling complete (see `overview.md`,
   `scratchpad/dnd-trace.json`).
2. Design — see `design.md`; realtime contract change recorded in decision `0008`.
3. Validation planning — see `validation.md` (re-profile protocol + new tests).
4. Implementation — land Item 1 first (dominant win), then Item 2, then Item 3;
   re-profile after each via the same keyboard-drag trace to attribute gains.
5. Verification — `npm test` green (apply-drop, board-store), re-trace shows
   per-move < ~50 ms and drop main-thread well under baseline.
6. Harness update — update `boards-and-cards.md`, `realtime-sync.md`,
   `TEST_MATRIX.md`; mark story `implemented` with evidence; verify decision.

## Stop Conditions

Pause for human confirmation if:

- Removing `revalidatePath` (Item 3) causes any observed cross-user desync or a
  stale board after reconnect that the socket path doesn't cover.
- Self-echo dedupe risks dropping a legitimate remote move (e.g. two users moving
  the same card) — re-confirm the dedupe key before landing.
- Memoization changes drag correctness under `@hello-pangea/dnd` (placeholder /
  index drift) in any observed case.
- Validation requirements would need to be weakened to pass.
