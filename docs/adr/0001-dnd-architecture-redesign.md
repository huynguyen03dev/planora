# ADR 0001: Drag-and-drop architecture redesign

The current DnD implementation mutates the Zustand store on every pointer move during a drag, making the store both the source of truth and the drag-visual buffer. This caused recurring band-aid fixes (snap-back workaround, dual indicator state, snapshot diffing). We're extracting a `useBoardDnd` hook that owns a local items array for visual feedback during drag and only commits to the Zustand store on drop.

## Locked decisions

1. **Failure model**: Revert local array to server state on server-action rejection → animated snap-back (matches current UX).
2. **Done-list pre-check**: Deferred. The hook does NOT pre-check the "require estimate before done" rule. Server rejection + snap-back handles it.
3. **Socket events during drag**: Pause `applyRemoteCardMoved` while `activeDrag` is non-null. Reconcile via `router.refresh()` on drop.
4. **Empty-list drop (C2)**: Fixed. Add virtual list-end droppables for empty lists.
5. **Type extraction**: Move `ListWithCards` to a shared types file (e.g., `lib/board/types.ts`). Both `lib/dnd/` and the hook import from it. Fixes cross-namespace coupling (finding A6).
6. **Hook location**: Co-located with the route at `app/(authenticated)/(dashboard)/boards/[boardId]/use-board-dnd.ts`.
7. **Component tests**: Set up React Testing Library + jsdom. Write `renderHook` tests for the hook.
