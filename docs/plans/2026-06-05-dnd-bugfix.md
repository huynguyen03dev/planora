# Spec: Drag-and-Drop Card/List Bug Fixes

**Date:** 2026-06-05
**Status:** Phase 4 complete. Phase 5 (snap-back fix) complete. All gates green.
**Scope:** Client-side drag-and-drop wiring in the board view.

---

## 1. Objective

Make the Trello-style board's drag-and-drop behave correctly and look polished.

### User stories

- **As a board user**, I can drag a card up or down within a list and it lands where I dropped it, with the change persisted to the database.
- **As a board user**, I can drag a card across lists and it lands in the intended slot of the target list.
- **As a board user**, when I drop a card, the drop indicator (the blue separator line) appears in the gap I was aiming at, with consistent spacing on either side.
- **As a board user**, the floating drag ghost I see while dragging looks the same as the source card (same width, same content, same shadow).
- **As a board user**, list-column reordering keeps working exactly as it does today (no regression).

### Non-goals (out of scope for this change)

- Auto-scroll when dragging near the board edge.
- Cross-board drag-and-drop.
- Multi-select drag.
- Keyboard-only drag parity (the existing `KeyboardSensor` stays as-is).
- Touch / mobile drag.
- Animations on the `+ Add a card` placeholder.

---

## 2. Tech stack (unchanged)

- `@dnd-kit/core` `^6.3.1`
- `@dnd-kit/sortable` `^10.0.0`
- `@dnd-kit/utilities` `^3.2.2`
- React 19.2.3, Next.js 16.1.6, TypeScript 5
- Vitest 2.x (node env) for unit tests of pure helpers

No new dependencies.

---

## 3. Commands

```bash
# Development
npm run dev                 # dev server on :3000

# Verification (run from project root)
npm run lint                # ESLint
npm run build               # tsc + next build (catches type errors)
npm test                    # Vitest (lib/ + tests/)

# Single test file
npx vitest run lib/dnd/reorder.test.ts
npx vitest run lib/dnd/collision.test.ts

# Manual drag verification
# 1. Open http://localhost:3000/boards/<boardId>
# 2. Drag cards up, down, and across lists
# 3. Hard refresh — confirm order persists
```

---

## 4. Project structure (touched files)

### New files

```
lib/dnd/
  reorder.ts                # Pure: findCardLocation, applyCardMove
  reorder.test.ts           # Unit tests for reorder
  collision.ts              # Pure: createCardCollisionDetection
  collision.test.ts         # Unit tests for collision
```

### Modified files

```
app/(authenticated)/(dashboard)/boards/[boardId]/
  board-content.tsx         # collisionDetectionStrategy, handleDragOver,
                            # handleDragEnd, <DragOverlay>

components/boards/
  list-column.tsx           # cardDropIndicator prop type, indicator rendering

components/boards/
  list-card-item.tsx        # No changes (still works with the existing card-style)

board-store.ts              # No changes (ListWithCards shape stays the same)
```

### Contract between BoardContent and the list column

The `cardDropIndicator` prop on `ListColumn` changes shape:

| Before | After |
|---|---|
| `{ cardId: string \| null; placement: "before" \| "after" \| "end" } \| null` | `string \| null` (the source card's id, or `null`) |

Rationale: the new `applyCardMove` helper keeps the source card in its final position in the array, so the indicator is always rendered *before* the source card. The list column can compute this from its own `cards` array — no need to thread a placement string.

---

## 5. Code style

Follows existing project conventions from `AGENTS.md`:
- Semicolons in `lib/` and app code.
- 2-space indentation, double quotes, trailing commas in multi-line.
- Named exports for pure functions; default-style for React components.
- `import type` for type-only imports.

### Style example for the new helper

```ts
// lib/dnd/reorder.ts
import type { ListWithCards } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";

export type CardLocation = {
  listIndex: number;
  cardIndex: number;
};

export type CardMoveTarget =
  | { kind: "card"; listId: string; cardId: string; placement: "before" | "after" }
  | { kind: "list"; listId: string };

export function findCardLocation(
  lists: ListWithCards[],
  cardId: string,
): CardLocation | null {
  for (let listIndex = 0; listIndex < lists.length; listIndex += 1) {
    const cardIndex = lists[listIndex].cards.findIndex((card) => card.id === cardId);
    if (cardIndex !== -1) {
      return { listIndex, cardIndex };
    }
  }
  return null;
}

export function applyCardMove(
  lists: ListWithCards[],
  sourceCardId: string,
  target: CardMoveTarget,
): ListWithCards[] {
  // Pure. Returns a new lists array with the source card moved to the target.
  // Returns the input unchanged for: source not found, target list not found,
  // target card not found, source dropped on itself, or no-op same-position.
}
```

---

## 6. Testing strategy

### Unit tests (Vitest, node env)

**`lib/dnd/reorder.test.ts`** — covers the pure helper. Scenarios:

- `findCardLocation`:
  - Card at start of first list
  - Card at end of last list
  - Card not present → `null`
  - Empty lists array → `null`
- `applyCardMove`:
  - Same-list, "before" target
  - Same-list, "after" target
  - Same-list, target is the moved card itself (no-op, returns input)
  - Same-list, no actual move (early-return input)
  - Cross-list, "before" target card
  - Cross-list, "after" target card
  - Cross-list, `kind: "list"` (drop on list, not on card) — appends to end
  - Cross-list, `kind: "list"` on an empty list
  - Source not found → returns input unchanged
  - Target list not found → returns input unchanged
  - Target card not found → returns input unchanged
  - **Immutability**: original `lists` and nested `cards` arrays are not mutated
  - List order and other cards are preserved

**`lib/dnd/collision.test.ts`** — covers the extracted collision detection. Scenarios:

- Filters out list-sortable ids when active is a card
- Returns `pointerWithin` result when the pointer is over a card
- Falls back to `closestCorners` when the pointer is not directly over a card
- Returns empty array when there are no card droppables
- Active is a list → returns empty (the list branch handles its own strategy)
- Result collisions only include card-sortable ids

### Manual / integration verification (browser, real dev server)

After the unit tests pass:

1. Same-list, drag down past another card → lands below, persists on refresh
2. Same-list, drag up past another card → lands above, persists on refresh *(was broken)*
3. Same-list, drop at the very top → lands first
4. Same-list, drop at the very bottom → lands last
5. Same-list, drop on its own slot → no change
6. Cross-list, drop on a card → lands at the intended slot
7. Cross-list, drop on an empty list → lands alone
8. List-column reordering → still works
9. Visual: drop indicator centered in a tight gap; drag ghost matches the source card
10. Real-time: a second browser tab on the same board sees the change

### Regression gates

- `npm run lint` — no new errors
- `npm run build` — type-checks pass
- `npm test` — existing `tests/analytics-export.test.ts` + new tests all pass

---

## 7. Boundaries

### Always

- Keep `ListWithCards` shape stable (Zustand store and Socket.io payload depend on it).
- **Do not touch the list-reorder path in `handleDragOver`** — it already uses `arrayMove` correctly. Only the card branch is in scope.
- Run `npm run build` before declaring done (catches the `transform: CSS.Transform.toString(...)` typing issues that bit us before).
- Keep `reorderCardAction` and `moveCardAction` signatures unchanged.
- Preserve accessibility: the card drag handle keeps its `aria-label` and the icon button keeps the `cursor-grab` / `cursor-grabbing` states.
- Use `my-[-4px]` on the drop indicator to pull the surrounding cards closer so the line sits in a tight ~10px gap instead of the current ~18px chasm.

### Ask first

- Adding a new dependency (e.g., `@testing-library/react`, `jsdom`). The current plan does **not** need this.
- Touching the server actions or DB layer. The current plan does **not** need this.
- Changing the public Socket.io payload shape. The current plan does **not** need this.

### Never

- Edit `app/generated/prisma/`.
- Edit `components/ui/` (shadcn-managed).
- Commit secrets or `.env` values.
- Remove or skip the existing `tests/analytics-export.test.ts` to "make tests pass."
- Hard-delete any list or card to work around a test.
- Touch the list-reorder branch in `handleDragOver` (it works, and re-writing it risks regression).

---

## 8. Success criteria (testable)

| # | Criterion | How verified |
|---|---|---|
| 1 | Same-list reorder, dragging up past another card, persists | Manual: drag + hard refresh |
| 2 | Same-list reorder, dragging down past another card, persists | Manual: drag + hard refresh |
| 3 | Same-list reorder, dropping at top of list, persists | Manual: drag + hard refresh |
| 4 | Cross-list move, dropping on a card, lands at the intended slot | Manual: drag + hard refresh |
| 5 | Cross-list move to an empty list, lands alone in target | Manual: drag + hard refresh |
| 6 | List-column reorder still works | Manual: drag a list header |
| 7 | Drop indicator has consistent visual spacing (~10px gap) on both sides, via `my-[-4px]` | Visual + grep `my-\[-4px\]` |
| 8 | Drag ghost matches the source card (same `Card` component, same `shadow-sm`, action buttons rendered with `pointer-events-none`) | Visual + grep source |
| 9 | Card-on-card collision no longer treats list-sortable ids as droppables | Unit test on `createCardCollisionDetection` |
| 10 | `applyCardMove` is pure and immutable | Unit test on immutability |
| 11 | `npm run build` is green | Run command |
| 12 | `npm run lint` is green | Run command |
| 13 | `npm test` is green (existing + new) | Run command |

---

## 9. Resolved decisions (formerly "Open questions")

| # | Question | Decision |
|---|---|---|
| 1 | Indicator visual treatment (replace the gap vs. sit in a larger gap) | **Use `my-[-4px]` on the indicator** so it visually sits in a tight ~10px gap, close to the normal 8px card-to-card gap. |
| 2 | Drag ghost parity (full `<Card>` vs. width-match) | **Render the same `<Card>` component** as the source card, with the title, drag handle, and menu, all wrapped in `pointer-events-none` so they don't interfere with the drag. Shadow matches the source (`shadow-sm`). |
| 3 | Collision filter scope (list ids only vs. list columns) | **Filter only list-sortable ids.** Leave list columns themselves as valid droppables (they are also card-list containers — dropping "on" a list still means "append to that list"). |

---

## 10. Out-of-scope notes

- The card detail sheet uses a different `cardId` query param; not affected.
- The list reordering logic in `handleDragOver` is out of scope (see §7 Boundaries / Always).
- The Socket.io "card:moved" payload (`applyRemoteCardMoved`) is unaffected — it operates on the same `ListWithCards[]` shape and doesn't need changes.

---

## 11. Plan (Phase 2)

### Phase A — Pure helpers (no React, no DOM)

Create the testable seam first. No component changes yet, so this phase is safe to land independently.

1. `lib/dnd/reorder.ts` — `findCardLocation`, `applyCardMove`, `CardMoveTarget`
2. `lib/dnd/reorder.test.ts` — exhaustive unit tests (TDD: tests first, then implementation)
3. `lib/dnd/collision.ts` — `createCardCollisionDetection` factory returning a `CollisionDetection`
4. `lib/dnd/collision.test.ts` — unit tests for the filter behavior

### Phase B — Wire the helpers into `board-content.tsx`

5. Replace the inline `collisionDetectionStrategy` closure with `createCardCollisionDetection` for the card branch.
6. Rewrite `handleDragOver` for cards: derive `target` from the `over` element, call `applyCardMove`, update the store, set `cardDropIndicator` to the source card id.
7. Simplify `handleDragEnd` for cards: the store is already in its final shape, so read prev/next card ids from neighbors and dispatch to `reorderCardAction` or `moveCardAction`. Drop the "adjusted target index" math entirely.
8. Rewrite the `<DragOverlay>`: render the same `<Card>` component as the source, including action buttons (with `pointer-events-none`).

### Phase C — Update `list-column.tsx`

9. Change `cardDropIndicator` prop type from the union-with-placement to `string | null`.
10. Update the indicator rendering: find the source card in `list.cards`, render the indicator before it. Use `my-[-4px]` for tight spacing. Use a stronger color (`border-primary`) and a subtle background tint so it's clearly visible.

### Phase D — Verify

11. `npm run build` — type-checks
12. `npm run lint` — no new errors
13. `npm test` — existing + new tests pass
14. Manual browser verification (if a dev server is running and `chrome-devtools` MCP is available)

### Phase E — Document

15. Mark the spec as "Phase 4 complete" and link to the implementation diff in the PR description.

---

## 12. Tasks (Phase 3)

Ordered by dependency. Each task is completable in a single focused session.

- [x] **Task 1: Write `lib/dnd/reorder.test.ts` (failing tests first)** — completed
- [x] **Task 2: Implement `lib/dnd/reorder.ts`** — completed (21 tests pass)
- [x] **Task 3: Write `lib/dnd/collision.test.ts`** — completed
- [x] **Task 4: Implement `lib/dnd/collision.ts`** — completed (7 tests pass)
- [x] **Task 5: Wire `createCardCollisionDetection` into `board-content.tsx`** — completed
- [x] **Task 6: Rewrite `handleDragOver` for cards** — completed
- [x] **Task 7: Simplify `handleDragEnd` for cards** — completed
- [x] **Task 8: Rewrite the `<DragOverlay>` in `board-content.tsx`** — completed
- [x] **Task 9: Change `cardDropIndicator` prop type on `ListColumn`** — completed
- [x] **Task 10: Update the drop indicator rendering in `list-column.tsx`** — completed
- [x] **Task 11: Run full verification gate** — `npm run build` green, `npm run lint` green, `npm test` green (47/47)
- [x] **Task 12: Mark spec as Phase 4 complete** — this section
- [x] **Task 13: Exclude the active card from the collision detection (slow-drag snap-back fix)** — completed (8 collision tests pass, full suite 48/48)

### Phase 5: snap-back fix details

**Symptom reported (post Phase 4):** "I have 4 cards in the list, and I try to drag the first card to the bottom. If I drag really fast past the last card, I can release anywhere to reorder. But if I drag slow, I cannot swap anything — it comes back."

**Root cause:** `closestCorners` returns the active card when the cursor sits on the active card's NEW DOM position. This is exactly the state the board reaches mid-drag after `handleDragOver` updates the store and the list re-renders. With the active card in the droppable set, `pointerWithin` / `closestCorners` return `over === active.id`, and `applyCardMove`'s "drop on self" no-op fires. The store never advances. On release, `handleDragEnd` reads the unchanged store, sees `currentLocation === initialLocation`, calls `finalizeDrag()` — the card "comes back" (it never moved).

**Why fast works:** the cursor sweeps past many cards in quick succession. `handleDragOver` fires for each card as the cursor passes through, before the store has time to settle the active card into a position under the cursor. The last call that fires with a *different* `over` wins.

**Fix:** exclude the active card from the `droppableContainers` passed to `pointerWithin` and `closestCorners`. When the cursor sits on A's new position, `closestCorners` resolves to the nearest *other* card (B or C depending on which side of A's midpoint the cursor is on), the store always advances, and the drag works at any speed.

**Test:** `lib/dnd/collision.test.ts > "excludes the active card from collision results (slow-drag snap-back fix)"` — written first, verified to fail with the unfixed code (returned `card:card-A` because the cursor was over it), then passes with the fix.

**Files touched:** `lib/dnd/collision.ts` (one-line filter), `lib/dnd/collision.test.ts` (one new test). No production code in `app/` or `components/` was changed.

---

## 13. Implementation notes (Phase 4 retrospective)

### Final shape of the fix

- **`lib/dnd/reorder.ts`** (new) — `findCardLocation`, `applyCardMove`, `CardMoveTarget`. Pure, immutable. 21 unit tests cover same-list, cross-list, edge-of-list, empty-list, immutability, and no-op cases.
- **`lib/dnd/collision.ts`** (new) — `createCardCollisionDetection` factory + `filterCardDroppables` helper. 8 unit tests cover the filter, the factory's early-returns, the "active card excluded" guarantee (snap-back fix), and the "no list-sortable ids in results" invariant.
- **`board-content.tsx`** — `collisionDetectionStrategy` delegates card drags to the new factory (list branch untouched per §7). `handleDragOver` for cards derives a `CardMoveTarget`, calls `applyCardMove`, and updates the store. `handleDragEnd` for cards reads the final position from the (already-updated) store and dispatches — the "adjusted target index" math is gone. `<DragOverlay>` renders the same `Card` component as the source, with `pointer-events-none` and `shadow-sm`.
- **`list-column.tsx`** — `cardDropIndicator` prop is now `string | null` (source card id). The indicator renders as a 2px `bg-primary` line with `my-[-4px]` so it sits in a tight ~10px gap rather than the previous ~18px chasm.

### What still needs manual verification (browser)

The unit tests prove the reorder math, the collision filter, and the active-card-exclusion guarantee are correct. The following success criteria from §8 still need eyes on them in a real browser:

- #1, #2, #3, #4, #5 — the drag-and-drop scenarios themselves, at both fast and slow drag speeds
- #6 — list-column reordering regression check
- #7, #8 — visual polish (indicator spacing, ghost width)

The QA handoff (`docs/plans/2026-06-04-qa-handoff.md`) documents the test user, the dev server, and the chrome-devtools MCP setup. The primary QA board ID is `c6567190-0a3a-4b94-81dc-ab559f25befd`.

### Known limitation (out of scope, noted for future work)

For the "in-between" position when dragging a card upward (ghost is between two cards in the same list, the geometric calculation places it at the source's own position), `applyCardMove` correctly returns the input unchanged. The store doesn't change, the indicator is suppressed, and no server action fires. The card stays in place — which is geometrically correct, but may still feel like a "no response" to the user. A more aggressive UX would show the indicator at the top of the list when the ghost is above the over card's midpoint regardless of which card closestCorners returns. That's a separate UX iteration, not a correctness bug.
