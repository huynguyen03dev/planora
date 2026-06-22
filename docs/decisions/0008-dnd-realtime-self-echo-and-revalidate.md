# 0008 Drop self-echo re-render and redundant revalidate on card/list move

Date: 2026-06-22

## Status

Accepted (2026-06-22). Implemented in story `US-004`. The dedupe is
position-aware (skip only when the canonical position is already reflected) so
the actor's echo still delivers float-gap positions now that revalidate is gone.
Verified single-client: after a sequence of drags, a full page reload reseeds the
board to a byte-identical order with correct positions (the optimistic state and
the server reseed match, so removing `revalidatePath` loses no writes). Two-client
behavior remains unverified — no E2E harness yet (see Follow-Up).

## Context

Board drag-and-drop is optimistic: `board-content.tsx` commits the moved order to
the Zustand store before the Server Action runs. But after a drop the **acting
client** re-renders the whole board up to three times:

1. The optimistic `setLists(nextLists)` (intended).
2. `revalidatePath` in `reorderCardAction` / `reorderListAction` /
   `moveCardAction` returns a fresh RSC tree → `BoardStoreProvider` re-seeds via
   `setLists` again.
3. The actor receives their own `card:moved` / `list:moved` socket echo.
   `applyRemoteCardMoved` / `applyRemoteListMoved` have **no self-echo dedupe**
   (unlike `applyRemoteCardCreated` / `applyRemoteListCreated`), so the move is
   re-applied.

Live profiling (90-card board) measured the drop interaction at **1561 ms** (1396
ms main-thread JS), with this redundant churn stacked on top of the (separately
addressed) lack of component memoization. Socket events are notifications only;
Prisma is the source of truth (`docs/product/realtime-sync.md`).

## Decision

For the reorder/move actions on the **actor's** path:

1. Add **self-echo dedupe** to `applyRemoteCardMoved` and `applyRemoteListMoved`:
   if the payload describes a state the store already reflects, no-op — mirroring
   the existing create-event dedupe. Cross-user (genuine remote) moves still
   apply.
2. **Stop calling `revalidatePath`** on `reorderCardAction`, `reorderListAction`,
   and `moveCardAction`. The optimistic store commit is authoritative client-side,
   and cross-user clients converge via the socket events. (Other mutations that
   create/delete/relabel keep `revalidatePath` — only pure reorder/move drop it.)

The **drag-aware deferral invariant is unchanged**: `card:moved` / `list:moved`
remain structural and are deferred during a local drag, reconciled via
`router.refresh()` on drop if a remote event was deferred (the reconnect-refresh
path in `board-store-provider.tsx` also remains as the safety net for missed
events).

## Alternatives Considered

1. **Keep both revalidate and echo, fix only memoization.** Lower blast radius,
   no contract change — but leaves two redundant full re-renders per drop on the
   actor. Rejected: defeats half the measured win.
2. **Keep `revalidatePath`, add echo dedupe only.** Removes #3 but not #2; the
   actor still pays a full RSC round-trip re-render. Partial.
3. **Server stops emitting to the actor (room-minus-sender).** Would remove the
   echo at the source, but changes emit semantics broadly and risks other
   consumers; client-side dedupe is more local and reversible.

## Consequences

Positive:

- Removes two of the three post-drop full-board re-renders on the actor path.
- Brings `card:moved` / `list:moved` in line with the created-event dedupe model.

Tradeoffs:

- The actor no longer gets a server-truth reseed on every move; if the optimistic
  translation ever diverged from server float-gap output, it would not self-heal
  until the next refresh/reconnect. Mitigated: `apply-drop` is unit-tested and
  index-based, and the deferred-event `router.refresh()` + reconnect-refresh paths
  remain.
- `revalidatePath` removal must be scoped to exactly the three reorder/move
  actions; create/delete/archive paths still need it.

## Follow-Up

- Update `docs/product/realtime-sync.md`: note self-echo dedupe on
  `card:moved` / `list:moved` and that pure reorder/move no longer revalidates.
- Verify via the two-client E2E case (observer still sees the move; actor not
  double-applied) once an E2E harness exists.
- Re-profile to confirm the post-drop churn is gone.
