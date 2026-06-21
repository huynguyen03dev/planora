# Code Review: Drag-and-Drop Architecture

**Date:** 2026-06-05
**Status:** Review complete. Awaiting user decision on redesign scope.
**Scope:** Full drag-and-drop subsystem — `board-content.tsx`, `list-column.tsx`, `list-card-item.tsx`, `lib/dnd/*`, `board-store*`, server actions.
**Reviewer:** pi coding agent (this session).

---

## 0. How to use this file in another session

If you're a fresh agent reading this:

1. The user asked for a full architectural review of the drag-and-drop code after multiple rounds of bug fixes.
2. I found that the current code **works** (build green, lint green, 48/48 tests pass) but has a **fundamental architectural mindset problem** that keeps producing band-aid fixes.
3. Section 3 is the most important part — it explains the root cause in one paragraph.
4. Section 4 proposes a redesign. Section 5 lists the three decisions the user needs to make before any work begins.
5. Do NOT start implementing anything until the user has answered the decisions in §5.

The reviewed code lives in:

- `app/(authenticated)/(dashboard)/boards/[boardId]/board-content.tsx` (568 lines — the god component)
- `app/(authenticated)/(dashboard)/boards/[boardId]/board-store.ts` (Zustand store)
- `app/(authenticated)/(dashboard)/boards/[boardId]/board-store-provider.tsx` (store provider, socket lifecycle)
- `app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts` (server actions — untouched in this review)
- `components/boards/list-column.tsx` (list column UI + card rendering + drop indicator)
- `components/boards/list-card-item.tsx` (card item UI + drag handle)
- `components/boards/board-dnd-types.ts` (parseSortableId, toCardSortableId, toListSortableId)
- `lib/dnd/reorder.ts` (pure: findCardLocation, applyCardMove — 21 tests)
- `lib/dnd/collision.ts` (pure: createCardCollisionDetection, filterCardDroppables — 8 tests)
- The spec for the prior bug-fix work: `docs/plans/2026-06-05-dnd-bugfix.md`

---

## 1. Context

The user reported that drag-and-drop is "still so broken" after two rounds of fixes (the original Phase 4 fix and the snap-back fix). They suspected a "mindset or something" problem at the architectural level. I was asked to review the full drag-and-drop architecture across the five axes (correctness, readability, architecture, security, performance) and surface the mindset-level issues.

**Verification status (as of this review):**

```
npm run build   →  ✓ green
npm run lint    →  ✓ green
npm test        →  ✓ 48/48 (28 new + 19 existing + 1 snap-back regression)
```

**Test coverage:** the two pure modules (`reorder.ts`, `collision.ts`) have thorough unit tests. There are **zero component or integration tests** for the actual drag-and-drop flow. Every bug found in the last two rounds was discovered manually in the browser.

---

## 2. Five-axis review

### 2.1 Correctness

| # | Finding | Severity |
|---|---|---|
| **C1** | **Snap-back fix is a band-aid.** Excluding the active card from the collision droppables (`lib/dnd/collision.ts`) works around the symptom (cursor occluding the active card's new DOM position), but the deeper issue — that the Zustand store is mutated on every `handleDragOver` — is still there. Future maintainers will hit related edge cases. | **Critical** |
| **C2** | **Dead code: cross-list drop on empty list — and a spec regression.** `board-content.tsx > handleDragOver > if (overParsed.kind === "list")` for cards is unreachable. The card collision detection only returns card-sortable ids (line 272's branch can never fire for card drags). The user cannot drop a card into an empty list by hovering over the list column. **This is a regression against the bugfix spec's success criterion #5** (`docs/plans/2026-06-05-dnd-bugfix.md` §8, "Cross-list move to an empty list, lands alone in target"). The Phase 4 collision filter was changed to "cards only" to fix the original "ghost over a list column" bug, but that change also removed the ability to drop into empty lists. Treat as a release-blocker, not just dead code. | **Critical** |
| **C3** | **Two sources of truth for one visual concept.** `listDropTargetId` (border highlight) and `cardDropIndicator` (inline bar) are tracked as two separate `useState` calls. The visual outcome is *currently* consistent — every early-return path sets both to `null` (lines 234-236, 251-253, 280-283, 286-289, 291-294), and the happy path mutates the store before setting the indicator so the source card is in the same list as `listDropTargetId` — but there is no shared concept linking them. Any future change (e.g., a new drag type, a new early-return, an edge case where the store update races) is one missed `set` away from a real disagreement. Treat as a maintenance hazard, not a current visual bug. The unified `dragState` object in §4.2 closes the gap by construction. | **Important** |
| **C4** | **Latent race: store provider effect can clobber optimistic state.** `board-store-provider.tsx > useEffect` resets the store when `normalizedLists` changes. Not a bug *during* a drag (server doesn't re-render mid-drag), but any `router.refresh()` while dragging would wipe out the optimistic state. | **FYI** |
| **C5** | **`handleDragOver` for lists also mutates the store** (`updateBoardLists(arrayMove(...))`). Same root cause as C1, but for lists. | **Important** |

### 2.2 Readability & Simplicity

| # | Finding | Severity |
|---|---|---|
| **R1** | **`board-content.tsx` is 568 lines and does 9 things:** collision detection (list branch inline, card branch via factory), drag state (4 separate variables), snapshot comparison, `applyCardMove` orchestration, geometric placement, server-action dispatch × 3, error/abort paths, DragOverlay rendering, card drop indicator prop wiring. | **Critical** |
| **R2** | **`handleDragOver` is ~100 lines** with two completely different code paths (list vs card) interleaved. The geometric placement block (cursor Y vs over-card midpoint, keyboard branch, fallback to `overRect.top`) is dense and commented in-line; it deserves its own function with tests. | **Important** |
| **R3** | **`resolveListDropTargetId`, `findCardLocation`, `applyCardMove`, `createCardCollisionDetection`, `parseSortableId`, the geometric-placement math** all live in different places with overlapping responsibilities. "Where does the list-target-resolution logic live?" has three answers. | **Important** |
| **R4** | **`handleDragEnd`'s list branch and card branch each re-read `snapshotRef`, re-derive the "did anything change" boolean, and build FormData inline.** The two branches share no code, so a fix in one doesn't propagate. | **Important** |
| **R5** | **Helper functions inside the component body** (`updateBoardLists`, `clearDragVisuals`, `refreshFromServer`, `finalizeDrag`, `abortDrag`, `resolveListDropTargetId`) are recreated on every render. Not a perf hit, but it's noise. | **Nit** |

### 2.3 Architecture

| # | Finding | Severity |
|---|---|---|
| **A1** | **Mindset problem: the store IS the drag state.** The board store is the source of truth, and it gets mutated on every pointer move during a drag. The standard dnd-kit Sortable pattern keeps a *local* items array for visual feedback during `handleDragOver` and only commits to the source of truth in `handleDragEnd`. We're using the store as both the drag-visual buffer and the persisted state — this is the root cause of C1, C3, C5 and the reason we need `snapshotRef` + `findCardLocation` diffs to detect no-ops. | **Critical** |
| **A2** | **God component.** `board-content.tsx` should be a thin renderer. All the dnd-kit wiring should live in a `useBoardDnd` hook that takes `boardLists` + callbacks and returns `{ sensors, collisionDetection, handlers, dragState }`. Standard React pattern; biggest readability win available. | **Important** |
| **A3** | **Inconsistent patterns between lists and cards.** Lists use `arrayMove` directly in the component; cards go through a pure `applyCardMove` helper. Lists' collision detection is inlined; cards' is in `lib/dnd/`. Lists' no-op detection is "did index change?"; cards' is "did location change?". Two parallel implementations of the same conceptual flow. | **Important** |
| **A4** | **Geometric placement is in the data layer.** The "is the cursor above or below the over card's midpoint?" math is a UI concern (where to show the drop indicator) but it's currently coupled to the data update (where to move the card in the store). If the indicator UX ever needs to differ from the data update, the current shape makes that hard. | **Important** |
| **A5** | **`applyCardMove` is over-built for its current caller.** It handles cross-list moves, "before"/"after", and "drop on self" no-ops, but the collision detection never produces a `kind: "list"` target (dead cross-list branch), and the "after" placement is only reachable for downward drags. `applyCardMove` is correct, but it solves a richer problem than the wiring actually uses. | **Optional** |
| **A6** | **`lib/dnd/*` is coupled to the app route structure.** `lib/dnd/reorder.ts:1` imports `ListWithCards` from `@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store`. The "pure" helpers in `lib/dnd/` are coupled to a type defined inside the app route, not to a domain-level type. The `lib/` namespace usually implies domain-level code; the import path inverts that expectation. If anyone reorganizes the boards route (e.g., extracts `board-store.ts` into `lib/board/`, splits the route into sub-routes, or moves the store into a co-located module), the helpers break in a non-obvious way. The redesign's `use-board-dnd.ts` would inherit the same coupling if placed under `[boardId]/`. | **Important** |

### 2.4 Security

No findings. The changes don't touch auth, input validation, or data sanitization in new ways. Server actions and FormData construction are unchanged from the pre-bug state.

### 2.5 Performance

| # | Finding | Severity |
|---|---|---|
| **P1** | **Store mutation on every pointer move.** Every `handleDragOver` call mutates the Zustand store, causing every subscriber to re-render. Fine for a 4-card board; noticeable on a 100-card / 10-list board during a 1-second drag. The standard pattern (local items array) avoids this. | **Important** |
| **P2** | **`cardDropIndicator` is passed to every list column** and string-compared against every card id in every column on every render. O(cards) per render. Negligible at small scale. | **Nit** |
| **P3** | **`arrayMove` for lists, `applyCardMove` for cards.** Inconsistent referential equality behavior across the two paths. | **Nit** |

---

## 3. The mindset problem (the most important section)

The current code treats **the Zustand store as both the source of truth and the drag-visual buffer**. It mutates the store on every pointer move and then has to reconstruct "what changed?" at drop time via `snapshotRef.current` + `findCardLocation` diffs. This is:

- **Why we needed the snap-back band-aid** (C1): the store mutation moves the active card's DOM position under the cursor, so `closestCorners` returns the active card. Excluding it from collision treats the symptom. The root cause is "we mutated the source of truth mid-drag."

- **Why `cardDropIndicator` and `listDropTargetId` exist as separate state**: they're trying to reconstruct from the store mutation what the indicator should show, but the store mutation is the wrong level of abstraction for "where should the blue line go." The two systems can't agree because they don't share a source of truth (C3).

- **Why the no-op detection is awkward**: comparing `initialLocation` to `currentLocation` via `snapshotRef` is a workaround for "did the store-mutation-driven drag actually result in a real move?" The standard pattern doesn't need this — it knows the items array is already in the final state and the source of truth hasn't moved yet, so a no-op is just "did `arrayMove` return the same array?"

- **Why cross-list drops into empty lists are broken** (C2): the collision detection was changed to "cards only" to fix the original "ghost over a list column" bug, but that removed the ability to drop into an empty list column. The two requirements (don't drag-a-list-into-a-list-column, but do allow drag-a-card-into-an-empty-list-column) were conflated.

**The right shape, in one sentence:** keep a *local* items array in the component (or in a `useBoardDnd` hook) that `handleDragOver` mutates with `arrayMove` for visual feedback, and only commit to the Zustand store in `handleDragEnd` — at which point a pure helper computes the final position from the local items array and dispatches the server action.

---

## 4. Proposed redesign

### 4.1 Goal

Eliminate the "store is the drag state" pattern. Make the drag-and-drop flow testable. Fix C1, C2, C3, C5 properly (not by band-aid).

### 4.2 Shape

1. **Extract `useBoardDnd` hook** — new file `app/(authenticated)/(dashboard)/boards/[boardId]/use-board-dnd.ts`
   - Takes `boardLists` (from store), server-action callbacks, and permission flags
   - Owns a *local* items array, `activeId`, `overId`, and derived drag visuals
   - Returns `{ sensors, collisionDetection, handlers, dragState }` to the component
   - `handleDragOver` mutates the local array with `arrayMove`. The Zustand store is **not touched** until `handleDragEnd`.
   - `handleDragEnd` reads the final position from the local array, dispatches the server action, and on success updates the Zustand store (or triggers a `router.refresh()`).

2. **Unified `dragState` object** — replaces the four separate variables:
   ```ts
   type DragState = {
     activeId: { kind: "list" | "card"; id: string } | null;
     overId: { kind: "list" | "card"; id: string } | null;
     dropTarget: {
       listId: string;
       kind: "before" | "after" | "end";
       targetCardId: string | null;  // null when kind === "end"
     } | null;
   };
   ```
   One state, one source of truth, one render path.

3. **`ListColumn` consumes `dragState` and renders both the border highlight and the inline bar from the same value** — no more C3 disagreements.

4. **Cross-list drop on empty list column** (C2 fix) — `createCardCollisionDetection` is enhanced with virtual "list-end" droppables for empty lists. Cards can be dropped at the end of an empty list column without changing the "don't drag-list-into-list-column" invariant.

5. **Server-action dispatch extracted** to small `persistCardMove` / `persistListMove` helpers so the hook doesn't construct FormData inline.

6. **Component tests** for the new hook (React Testing Library + jsdom). Cover:
   - same-list reorder, cross-list move, no-op (drop on original slot), cancel (Escape), error path
   - the slow-drag cursor-occlusion scenario from the user's last report
   - cross-list drop into empty list
   - list reorder

### 4.3 Estimated scope

Current line counts (verified): `board-content.tsx` 568, `list-column.tsx` 462, `list-card-item.tsx` 221, `lib/dnd/collision.ts` 78, `lib/dnd/reorder.ts` 130.

- `board-content.tsx`: shrink from 568 lines to ~150 lines (pure rendering)
- `list-column.tsx`: small prop-shape change (consume `dragState` instead of 3 separate flags) — likely ~470 lines after the change
- `list-card-item.tsx`: unchanged (221 lines)
- `lib/dnd/collision.ts`: small additive change for empty-list virtual droppables (C2 fix) — adds ~20 lines
- `lib/dnd/reorder.ts`: no change (or small additive change if we move `findCardLocation` consumers)
- `use-board-dnd.ts`: new, ~250 lines
- `use-board-dnd.test.tsx`: new, ~350 lines (component tests)
- Total: roughly 700-900 lines changed across ~6-7 files (existing code shrinks, new hook + tests add)

**Optional follow-on (addresses A6):** move `ListWithCards` to a domain-level types module (e.g., `lib/board/types.ts` or `app/(authenticated)/(dashboard)/boards/[boardId]/types.ts`) and update both `lib/dnd/reorder.ts` and `app/.../board-store.ts` to import from it. Small, mechanical, removes the cross-namespace coupling.

### 4.4 Risks

- React Testing Library + jsdom is a new dev dependency stack for the project. One-time setup.
- Refactoring a working subsystem is always a bit risky — the existing manual QA story will need to be re-run end-to-end.
- The redesign changes the visual-update path from "Zustand → render" to "local state → render → (on drop) Zustand → render". For the **happy path** this should be invisible to dnd-kit's animation: `list-card-item.tsx:38-40` sets `animateCardLayoutChanges` with `wasDragging: true`, which animates items from their dragging-end position to the final layout in both cases. The real risk is the **failure path**. Currently, a server-action rejection calls `router.refresh()` which resets the store and triggers an animated snap-back to the pre-drag position. In the redesign, the local array is the source of truth mid-drag — the failure path has to decide:
  - **Revert the local array** to the server's state → animated snap-back (must work with `animateLayoutChanges`)
  - **Keep the local array** as-is and show an error toast → no animation, but data is stale until next refresh
  - **Discard local state** and re-render from the server → same as the current snap-back, just sourced from the server rather than the pre-drag snapshot
  Whichever option is chosen, the failure path needs to be tested end-to-end with the new hook. The current `animateCardLayoutChanges` may or may not handle the new flow depending on which option is chosen — verify in browser with a deliberately-failing server action before declaring the redesign done.

---

## 5. Decisions needed from the user

Before any work begins, the user needs to answer:

### Q1. Do you want the redesign at all?

- **(a) Yes, full redesign as described in §4** — fixes C1/C2/C3/C5 properly, makes the code testable, eliminates the "store is the drag state" pattern.
- **(b) No, leave the code as-is** — accept the current state and the band-aid fix.
- **(c) Defer** — focus on other features first; come back to this later.

### Q2. If yes, which scope?

- **(a) Full redesign** as described (hook + local items array + unified state + C2 fix + component tests + extracted dispatch).
- **(b) Minimum-viable redesign** — hook extraction + local items array + unified state only. Leave C2 (empty-list drop) for a follow-up.
- **(c) Hook extraction only** — defer the rest of the work.

### Q3. Component test coverage?

- **(a) Yes, set up React Testing Library + jsdom** — adds two dev dependencies, one-time setup cost, enables proper component tests for the new hook.
- **(b) No, skip component tests** — rely on the pure-module tests + manual QA. Faster to land, but the wiring remains untested.

**Do not start implementing until the user has answered all three.**

---

## 6. What is NOT in scope for this review

- Server actions in `actions.ts` — not touched, not reviewed, not in scope.
- Real-time / socket wiring — the review noted the `useEffect` in `board-store-provider` as a latent risk (C4) but did not review the socket code itself.
- Card create / archive / list rename / list delete flows — separate concerns, separate code paths.
- The QA handoff document — read for context, not modified.

---

## 7. Reference: prior work

The current state of the code is the result of two prior rounds of fixes, both documented in `docs/plans/2026-06-05-dnd-bugfix.md`:

- **Phase 4** — rewrote `handleDragOver`/`handleDragEnd` to use a new `lib/dnd/reorder.ts` pure helper (`applyCardMove`, `findCardLocation`), added `lib/dnd/collision.ts` (`createCardCollisionDetection`), simplified the card drop indicator, and updated the DragOverlay to match the source card visually.
- **Phase 5 (snap-back fix)** — excluded the active card from the collision droppables to work around the slow-drag "cursor occludes active card's new position" symptom.

Both rounds were correct, narrowly-scoped fixes. Neither addressed the underlying architectural issue described in §3.

---

## 8. Files reviewed (paths for navigation)

```
app/(authenticated)/(dashboard)/boards/[boardId]/
  board-content.tsx                        — 568 lines, god component
  board-store.ts                           — Zustand store
  board-store-provider.tsx                 — store provider + socket lifecycle
  actions.ts                               — server actions (not modified by this review)

components/boards/
  list-column.tsx                          — 462 lines, list + card rendering
  list-card-item.tsx                       — 221 lines, card item + drag handle
  board-dnd-types.ts                       — sortable id parsing helpers

lib/dnd/
  reorder.ts                               — 130 lines, pure helpers, 21 unit tests
  reorder.test.ts                          — 290 lines
  collision.ts                             — 78 lines, pure helpers, 8 unit tests
  collision.test.ts                        — 164 lines

docs/plans/
  2026-06-05-dnd-bugfix.md                 — prior spec (Phase 4 + 5)
  2026-06-05-dnd-architecture-review.md    — this file
```
