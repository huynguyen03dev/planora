# Design

## Domain Model

No domain entities change. `List` / `Card` shapes, float-gap `position`
ordering, soft-delete/cascade rules are untouched. This story is a
render-performance and client-sync refinement.

## Application Flow

Drop flow today (`board-content.tsx#onDragEnd`), unchanged in order:

```text
onDragEnd -> setDragging(false) -> consumeResync()
  -> translate{List,Card}Drop()  (pure, lib/dnd/apply-drop.ts)
  -> permission re-check (canEdit / canEditCard)
  -> setLists(nextLists)          (OPTIMISTIC commit, stays)
  -> startTransition(server action) -> rollback setLists(snapshot) on failure
  -> reconcile(): router.refresh() only if a remote event was deferred
```

Changes:

- **Item 1 (memoization).** `ListCardItem` and `ListColumn` wrapped in
  `React.memo`. For memo to bite, props must be referentially stable:
  - `BoardContent.openCard` → `useCallback` (deps: router, pathname,
    searchParams).
  - `ListColumn` → pass a stable `card` reference to `ListCardItem` instead of a
    new `{ id, title, listId }` literal each render (e.g. pass the card object
    directly, or memoize per card).
  - `apply-drop.ts` `translateCardDrop` / `translateListDrop` → only clone the
    lists actually mutated (source/destination); return the **same references**
    for untouched lists so their memoized `ListColumn`s skip re-render. The
    function stays pure and index-based; the neighbor-id contract is unchanged.
- **Item 2 (drag lock).** Remove `isPersisting` from `isDropDisabled`,
  `canSortList`, `canSortCards`. `useTransition` may remain only to keep the
  action non-blocking; it must not gate draggability board-wide. Correctness is
  already held by the optimistic store + rollback. The defensive permission
  re-check in `onDragEnd` is retained (never trust the client gate alone).

## Interface Contract

- **No Server Action signature changes.** `reorderCardAction`,
  `reorderListAction`, `moveCardAction` keep their FormData inputs and serializable
  return shape and the `verifySession -> permission -> scope -> Zod -> Prisma ->
  emit -> revalidate -> return` order — except the `revalidatePath` step is
  dropped/narrowed for the three reorder/move actions (decision `0008`).
- **Realtime (decision `0008`):**
  - `applyRemoteCardMoved` / `applyRemoteListMoved` gain self-echo dedupe: if the
    payload describes a state the store already reflects for the acting client,
    it is a no-op (mirrors the existing dedupe in `applyRemoteCardCreated` /
    `applyRemoteListCreated`). Cross-user moves still apply.
  - `card:moved` / `list:moved` remain **structural / deferred** during a drag —
    the deferral invariant in `realtime-sync.md` is preserved unchanged.

## Data Model

No tables, indexes, migrations, or retention changes.

## UI / Platform Impact

- Browser only. Surfaces: `board-content.tsx`, `components/boards/list-column.tsx`,
  `components/boards/list-card-item.tsx`, `lib/dnd/apply-drop.ts`,
  `boards/[boardId]/board-store.ts`, `boards/[boardId]/actions.ts`.
- No mobile/desktop/CLI shell impact. No deployment change.

## Observability

- Verification is via Chrome DevTools performance traces (INP + per-interaction
  latency), not production logging. No new logs/metrics added.

## Alternatives Considered

1. **List virtualization (windowing).** Would cap render count regardless of
   memoization, but adds complexity and fights `@hello-pangea/dnd`'s measurement
   model. Deferred — memoization addresses the measured root cause (wasted
   re-renders of unchanged cards) at far lower risk.
2. **Keep `revalidatePath`, accept the echo.** Simplest, but leaves the actor
   paying a second full RSC re-render + a third socket-echo re-render per drop —
   exactly the post-drop churn the trace shows. Rejected for the actor path;
   cross-user correctness still relies on the socket events.
3. **Memoize only `ListCardItem`, not `ListColumn`.** Cheaper change, but a
   full-array `setLists` still re-renders all columns; preserving untouched-list
   references + memoizing columns is needed to actually skip them.
