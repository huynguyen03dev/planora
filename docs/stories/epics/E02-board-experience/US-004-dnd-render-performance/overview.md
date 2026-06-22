# Overview

## Current Behavior

Board drag-and-drop (`@hello-pangea/dnd`) is functional and already optimistic
(`board-content.tsx` commits `setLists(translation.nextLists)` before the server
action and rolls back on failure). However, every drag lifecycle event re-renders
the **entire** card tree because no board component is memoized:

- `ListColumn` and `ListCardItem` are not wrapped in `React.memo`.
- `openCard` in `BoardContent` is re-created each render (no `useCallback`).
- `ListColumn` passes an inline `card={{ id, title, listId }}` object literal to
  `ListCardItem`, so the prop reference changes every render.
- `apply-drop.ts` rebuilds **every** list/card object on a drop, even untouched
  lists, so all references change.
- After the optimistic commit, `revalidatePath` re-renders the board a second
  time, and the actor's own `card:moved` / `list:moved` socket echo (no
  self-dedupe in `applyRemoteCardMoved` / `applyRemoteListMoved`) a third.

### Measured baseline (live Chrome trace, 5 lists × 18 cards = 90 cards)

Keyboard-driven drag through the real sensor; CPU throttling 1×, no network
throttling. Per-interaction latency (Core Web Vitals INP threshold: good ≤200ms):

| Interaction | Total latency | Main-thread JS |
| --- | --- | --- |
| Lift (grab) | 1217 ms | 1050 ms |
| Move within list | 79–115 ms | 28–54 ms |
| Move across columns | 637 ms | 562 ms |
| Drop (release) | 1561 ms | 1396 ms |

Page **INP = 1561 ms** ("bad", ~3× the threshold), almost entirely synchronous
main-thread JavaScript (drop: 1396 ms processing / 165 ms presentation). A forced
reflow was flagged during the gesture (the sensor measures every draggable's
geometry on lift). Trace: `scratchpad/dnd-trace.json`.

### Measurement correction

An early single-run re-trace appeared to show INP ~105 ms after Item 1. On review
that trace was **invalid**: its keyboard-drag arrow moves did **zero** layout/paint
work (0 frames) — the drag never actually repositioned the card, so only the
lift's forced reflow was captured. The baseline trace, by contrast, was fully
engaged (layout work on every move; drop = 1561 ms with 1396 ms of JS), so the
original diagnosis stands. The numbers below come from fully-engaged drags
(layout work present on every interaction), measured warm and averaged.

### After all three items (live Chrome, fully-engaged drags)

Same 5 lists × 18 cards (90 cards), same lift → 3× move → cross-column → drop
sequence. Dev and prod both shown — prod (the deployment target) strips the
dev-mode React noise (StrictMode double-render, unminified reconciler) that makes
the dev numbers swing.

| Interaction | Baseline (dev) | After 1+2+3 (dev) | After 1+2+3 (prod, 3-run median) |
| --- | --- | --- | --- |
| Lift (grab) | 1217 ms (1050 ms JS) | ~433 ms (290 ms JS) | 260 ms (110 ms JS) |
| Move within list | 79–115 ms | 68–148 ms | ~100 ms (23 ms JS) |
| Move across columns | 637 ms (562 ms JS) | ~500 ms | 188 ms (116 ms JS) |
| Drop (release) | 1561 ms (1396 ms JS) | ~927 ms (745 ms JS) | 435 ms (247 ms JS) |

Page **INP after 1+2+3: ~435 ms in prod** (range 380–462 over 3 runs), vs 1561 ms
dev baseline. The honest read:

- The optimizations **roughly halve the JS/React work** on the two expensive
  interactions (lift JS 1050→290 ms dev; drop JS 1396→745 ms dev), and prod is
  materially snappier than the dev experience suggested.
- But they do **not** bring a 90-card board under the 200 ms INP target. The drop
  call tree shows the residual cost is `@hello-pangea/dnd`'s synchronous drop
  handler (`EventDispatch → RunMicrotasks`) + **~165 ms `UpdateLayoutTree`**
  (style/layout recalc of the large DOM, roughly unchanged by these changes) +
  React commit + GC pressure — **not** a flood of unmemoized card re-renders.
- That remaining bottleneck is DOM-size / forced-reflow bound, which is the
  **virtualization** lever (explicitly out of scope here), not memoization.

Traces: `scratchpad/prod-run{1,2,3}.json` (prod), `scratchpad/final-run1.json`
(dev), `scratchpad/dnd-trace.json` (baseline). The invalid early trace
(`dnd-trace-after-item1.json`) is retained only as the documented artifact.

## Target Behavior

Dragging a card or list around a board with ~100 cards feels smooth: per-move
latency well under the 200 ms INP target, and lift/drop no longer block the main
thread for ~1.5 s. The optimistic result paints effectively immediately on drop.
Realtime cross-user sync and the drag-aware deferral invariant are preserved; the
actor no longer pays for redundant re-renders (own socket echo, redundant
revalidate) after their own move.

## Affected Users

- **Editors** (`canEditCard` / `canEdit`) — anyone who drags cards or reorders
  lists. Viewers are unaffected (drag is gated off for them).

## Affected Product Docs

- `docs/product/boards-and-cards.md` (drag/reorder UX)
- `docs/product/realtime-sync.md` (self-echo dedupe + revalidate change — see
  decision `0008`)

## Non-Goals

- Virtualizing long lists (windowing) — out of scope; the fix is memoization, not
  render-count reduction by viewport.
- Changing the float-gap ordering math or the Server Action contract order.
- Changing the drag-aware deferral invariant itself (structural events still
  defer during a drag).
- Touching auth, authorization roles, schema, or migrations.
