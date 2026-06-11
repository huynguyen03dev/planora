# Implementation Plan: Socket Tier 1 + Tier 2 UX Improvements

**Companion to:** [`2026-06-11-socket-ux-improvements.md`](./2026-06-11-socket-ux-improvements.md) (the spec)
**Date:** 2026-06-11

## Overview

Make the board a live collaborative surface and stop the socket lifecycle from killing the
notification bell. Work splits into three phases: (1) a foundational fix to socket lifecycle
that unblocks everything else, (2) Tier 1 features that validate the full emit→store→subscribe
pipeline, and (3) the mechanical fan-out of seven board-CRUD events that all follow one pattern.

## Architecture Decisions

- **Socket lifecycle moves up to `app/(authenticated)/layout.tsx`.** Today `BoardStoreProvider`
  owns `initSocket()`/`disconnectSocket()` and tears the socket down on every board unmount —
  which is why `NotificationBell` polls every 2s to re-attach its listener. A new client
  `SocketLifecycleProvider` owns the socket for the whole authenticated session; everything else
  just subscribes via `useEffect` + `socket.off` cleanup (no disconnect).
- **All CRUD events are incremental — no `router.refresh()`.** Each payload carries exactly the
  board-view fields (`ListSnapshot` / `CardSnapshot` / title), and the store mutates in place.
  `router.refresh()` is used *only* for reconnect recovery (T1-A), to resync after missed events.
- **Emit functions follow the existing `emitCardMoved` shape** in `lib/realtime/server.ts`:
  `emitX(boardId, payload)` → `io.to(ROOMS.board(boardId)).emit("event", { boardId, ...payload })`,
  wrapped in the `getIO()` null-check + try/catch already used there.
- **Every `applyRemote*` store handler guards `boardId !== payload.boardId` → no-op** and dedupes
  the same way `applyRemoteCommentCreated` does. This is non-negotiable (see spec Boundaries).
- **Emit only after a successful DB write**, inside the action's `try` block after `revalidatePath`,
  reading from objects already in scope.

## Established patterns (verified in code — reuse, don't reinvent)

| Concern | Reference implementation |
|---|---|
| Emit fn | `emitCardMoved` — `lib/realtime/server.ts:30` |
| Event type registration | `ServerToClientEvents` — `lib/realtime/types.ts:55` |
| Action emit call site | `reorderCardAction` — `actions.ts:698` |
| Store handler + guard + dedupe | `applyRemoteCardMoved` / `applyRemoteCommentCreated` — `board-store.ts:118,178` |
| Subscription register/cleanup | socket lifecycle effect — `board-store-provider.tsx:67-105` |

---

## Task List

### Phase 1: Foundation — stable socket lifecycle

#### Task 1: Move socket lifecycle to the authenticated layout; remove bell polling

**Description:** Create `SocketLifecycleProvider` (`"use client"`) that calls `initSocket()` on
mount and `disconnectSocket()` on unmount, and mount it in `app/(authenticated)/layout.tsx`
wrapping the header + `{children}`. Remove `disconnectSocket()` from `BoardStoreProvider`'s
cleanup so navigating between boards no longer tears the socket down. Remove the 2s polling
`setInterval` from `NotificationBell` and replace it with a plain `useEffect` subscription. Add a
defensive `disconnectSocket()` to `handleSignOut` in `user-button.tsx`.

> These changes are interdependent and must land together — removing the bell polling *before*
> removing the board-provider disconnect would break notifications. Treat as one atomic task.

**Acceptance criteria:**
- [ ] `SocketLifecycleProvider` owns the only `disconnectSocket()` call in normal navigation; it
      fires on unmount of the authenticated area, not on board unmount.
- [ ] `NotificationBell` has no `setInterval`; it subscribes to `notification:new` in a single
      `useEffect` with `socket.off` cleanup.
- [ ] `BoardStoreProvider` cleanup no longer calls `disconnectSocket()` (only `socket.off`).
- [ ] The socket-lifecycle effect seeds `setSocketConnected(socket.connected)` **synchronously on
      mount**, not only inside the `connect` handler. With a session-long socket, `connect` won't
      re-fire on a second board visit, so without this the Task 4 badge sticks on "Reconnecting…"
      permanently (`board-store-provider.tsx:70-72` currently only sets it `true` via the listener,
      and `reset()` on unmount at `:128-132` flips it back to `false`).

> **Recommended internal sequence (no broken intermediate state):** (1) add the provider + remove
> `disconnectSocket()` from `board-store-provider.tsx:103` — the bell's polling becomes a harmless
> no-op; verify; (2) then delete the bell `setInterval`. Doing it in this order means notifications
> never break mid-change.

**Verification:**
- [ ] Build succeeds: `npm run build`
- [ ] Tests pass: `npx vitest run`
- [ ] Manual: open a board, navigate back to `/boards`, trigger a notification → bell count
      increments with **no** polling (confirm no repeating `notification:new` re-attach in console).
- [ ] Manual: sign out → no socket-related console errors; socket closes.

**Dependencies:** None
**Files likely touched:**
- `lib/realtime/socket-lifecycle-provider.tsx` (new)
- `app/(authenticated)/layout.tsx`
- `app/(authenticated)/(dashboard)/boards/[boardId]/board-store-provider.tsx`
- `components/notifications/notification-bell.tsx`
- `components/user-button.tsx`

**Estimated scope:** Medium (5 files)

### Checkpoint: Foundation
- [ ] `npm run build` + `npx vitest run` green
- [ ] Bell receives notifications from any authenticated route without polling
- [ ] Existing card-move + comment sync still works (no regression)
- [ ] Review with human before proceeding

---

### Phase 2: Pipeline validation + Tier 1

#### Task 2: `list:moved` event end-to-end

**Description:** Add the `list:moved` event across the full stack to prove the
emit→store→subscribe pipeline on a stable socket. The new position is trivially available:
`reorderListByNeighbors` already returns the full updated `ListRecord` (`lib/list.ts:228`,
returns the `db.list.update` row at `:256`) — `reorderListAction` simply doesn't capture it
(`actions.ts:652`, its only caller). Fix is one line: `const updatedList = await
reorderListByNeighbors(...)`, then `emitListMoved(boardId, { listId: updatedList.id, position:
updatedList.position })`. No signature change, no re-query, no caller audit.

**Acceptance criteria:**
- [ ] `ListMovedPayload { boardId, listId, position }` added to types + registered in
      `ServerToClientEvents`; `emitListMoved` added to `server.ts`.
- [ ] `reorderListAction` emits `list:moved` with the correct new `position` after the DB write.
- [ ] `applyRemoteListMoved` updates the list's `position` and re-sorts `lists`; guards
      `boardId` mismatch.

**Verification:**
- [ ] `npm run build` + `npx vitest run` green
- [ ] Manual (two browsers, same board): user A reorders lists → user B's order updates within 1s.

**Dependencies:** Task 1
**Files likely touched:**
- `lib/realtime/types.ts`, `lib/realtime/server.ts`
- `app/(authenticated)/(dashboard)/boards/[boardId]/board-store.ts`
- `app/(authenticated)/(dashboard)/boards/[boardId]/board-store-provider.tsx`
- `app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts` (capture the return at :652)

**Estimated scope:** Small (5 files, one-line action change)

#### Task 3: Reconnect recovery

**Description:** In `BoardStoreProvider`'s board-join effect (`board-store-provider.tsx:108-125`),
add a `connectedRef`. On first `connect`, set it `true`; on subsequent connects (i.e.
reconnection after a drop), call `router.refresh()` to resync the board to current DB state.

**Acceptance criteria:**
- [ ] First connect does **not** trigger `router.refresh()` (no double-load on initial mount).
- [ ] A reconnect triggers exactly one `router.refresh()`.

**Verification:**
- [ ] `npm run build` green
- [ ] Manual: kill the socket server, wait 3s, restart → board refreshes to current DB state
      within ~2s.

**Note:** `board-store-provider.tsx` does **not** currently import `useRouter` — Task 3 must add it.

**Dependencies:** Task 1
**Files likely touched:**
- `app/(authenticated)/(dashboard)/boards/[boardId]/board-store-provider.tsx`

**Estimated scope:** Small (1 file)

#### Task 4: Connection status badge

**Description:** Add an unobtrusive "Reconnecting…" pill to `board-header.tsx`'s actions row
(`board-header.tsx:114`), shown when `socketConnected` is false. This adds the first board-store
subscription to `BoardHeader` (`useBoardStore((s) => s.socketConnected)`). Avoid a flash on
initial load (socket connects quickly).

**Acceptance criteria:**
- [ ] Badge visible only when `socketConnected === false`; hidden when connected.
- [ ] No badge flash on initial board load.

**Verification:**
- [ ] `npm run build` green
- [ ] Manual: kill socket server → badge appears; restart → badge disappears.

**Dependencies:** Task 1
**Files likely touched:**
- `components/boards/board-header.tsx`

**Estimated scope:** Small (1 file)

### Checkpoint: Tier 1
- [ ] `npm run build` + `npx vitest run` green
- [ ] Two-browser list reorder syncs; reconnect resyncs; badge reflects connection state
- [ ] Review with human before the CRUD fan-out

---

### Phase 3: Board CRUD events (Tier 2)

Both tasks below repeat the same six-step pattern per event (type → payload → `emit*` →
action emit call → `applyRemote*` → subscription). Snapshot shapes:
`ListSnapshot = { id, title, boardId, isDone, position }`, `CardSnapshot = { id, listId, title, position }`.

> **⚠️ Self-echo & dedupe (applies to every handler below).** Emits use `io.to(ROOMS.board(id))`
> (`server.ts:42`) and the actor's own socket is in that room (`board:join` → `socket.join`,
> `server.ts:46-60`), so **the user who performed the mutation receives their own event back** —
> on top of the `revalidatePath` reseed of the store. Therefore:
> - **`*:created` handlers (`list:created`, `card:created`) MUST early-return if an item with that
>   `id` already exists** — otherwise the creator double-inserts. This is the actual dedupe concern.
> - **All other handlers (`*:updated`, `*:deleted`, `*:archived`, `list:moved`) are idempotent** —
>   patch/filter in place is safe to re-apply; no dedupe needed.
>
> The idempotent precedent to copy is `applyRemoteCardMoved` (`board-store.ts:118`), **not**
> `applyRemoteCommentCreated` — the latter dedupes because comments are append-only, which only
> matches the `*:created` case.

#### Task 5: List CRUD events — `list:created`, `list:updated`, `list:deleted`

**Description:** Add the three list events. The data needed is in scope at each emit site —
`createList()` returns the full row; `updateListAction`/`updateListIsDoneAction` know the changed
field; `deleteListAction` has `result.list.boardId`. Note: the actions currently return only IDs,
so the emit calls do not exist yet and must be added.

**Acceptance criteria:**
- [ ] `list:created` → store prepends the list and sorts by position; **early-returns if a list
      with that `id` already exists** (self-echo dedupe).
- [ ] `list:updated` → store patches `title` or `isDone` in place (payload carries only the
      changed field; emitted from both `updateListAction` and `updateListIsDoneAction`). Idempotent.
- [ ] `list:deleted` → store filters the list out; its cards disappear with it (client cascade).
      Idempotent.
- [ ] All three handlers guard `boardId` mismatch.
- [ ] Unit tests for the three `applyRemote*` handlers (pure functions over store state),
      including the `list:created` re-insert guard.

**Verification:**
- [ ] `npm run build` + `npx vitest run` green
- [ ] Manual (two browsers): A creates / renames / deletes a list → B sees it within 1s.

**Dependencies:** Task 1 (Task 2 recommended first to establish the pattern)
**Files likely touched:** `types.ts`, `server.ts`, `board-store.ts`, `board-store-provider.tsx`, `actions.ts`
**Estimated scope:** Medium (5 files)

#### Task 6: Card CRUD events — `card:created`, `card:updated`, `card:archived`

**Description:** Add the three card events. `createCardAction` has the created `card` + computed
`position` in scope; the title rename emits `{ cardId, title }` (title is the only card field on the
board face — verified in `list-card-item.tsx:96`); `archiveCardAction` has `result.list.boardId`.

> **⚠️ Emit from `updateCardDetailsAction`, NOT `updateCardAction`.** The card detail sheet's
> "Save changes" button calls `updateCardDetailsAction` (`card-detail-sheet.tsx:193`). `updateCardAction`
> is orphaned dead code — never called by any UI path. Attaching the `card:updated` emit to
> `updateCardAction` means renames never propagate. (This was the original mistake; caught only by the
> cross-user browser test, not by unit tests or the build. See "Post-implementation findings".)

**Acceptance criteria:**
- [ ] `card:created` → store pushes `CardSnapshot` to the matching list and sorts by position;
      **early-returns if a card with that `id` already exists** (self-echo dedupe).
- [ ] `card:updated` → store patches `title` in place across lists; if it's the selected card,
      also patch `selectedCard.card.title`. Idempotent.
- [ ] `card:archived` → store filters the card from all lists; if selected, clear
      `selectedCardId` + `selectedCard`. Idempotent.
- [ ] All three handlers guard `boardId` mismatch.
- [ ] Unit tests for the three `applyRemote*` handlers, including the `card:created` re-insert guard.

**Verification:**
- [ ] `npm run build` + `npx vitest run` green
- [ ] Manual (two browsers): A creates / renames / archives a card → B sees it within 1s.
- [ ] Manual: B has a card's detail sheet open; A archives it → B's sheet closes cleanly. The
      sheet's open state derives from `?cardId` + the server-fetched `selectedCard` prop
      (`page.tsx:222`), not just the store — confirm clearing store state (and likely a
      `router.replace` to strip `?cardId`) actually closes it, leaving no broken sheet.

**Dependencies:** Task 1 (Task 5 recommended first — same files, same pattern)
**Files likely touched:** `types.ts`, `server.ts`, `board-store.ts`, `board-store-provider.tsx`, `actions.ts`
**Estimated scope:** Medium (5 files)

### Checkpoint: Complete
- [ ] All spec Success Criteria boxes pass (two-browser checks for every event)
- [ ] Existing card-move + comment sync still works (no regression)
- [ ] `npm run build` + `npx vitest run` green
- [ ] Ready for review

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Actor self-echo double-inserts on `*:created` (sender is in the board room) | High | `*:created` handlers early-return on existing `id`; covered by unit tests (Task 5/6) |
| Badge stuck on "Reconnecting…" on second board visit (`connect` doesn't re-fire) | Med | Seed `setSocketConnected(socket.connected)` on mount (Task 1) |
| `card:archived` leaves a broken detail sheet open for other viewers | Med | Verify sheet closes via store clear + `router.replace`; manual two-browser check (Task 6) |
| Tasks 5 & 6 touch the same 5 files — merge conflicts if parallelized | Med | Run sequentially, or pre-agree the type/server/store insertion points |
| Stale-listener regression if Task 1 lands partially | High | Task 1 is atomic; verify bell-without-polling before merging |
| Badge flashes on every load | Low | Gate on "was ever connected" / brief delay before showing |
| `card:updated` scope creep (labels, due date, assignees) | Low | Board face shows title only (verified); other fields are explicitly out of scope |

## Open Questions

- None blocking. (The earlier `reorderListByNeighbors` question is resolved: it already returns
  `ListRecord` and has a single caller — Task 2 just captures the return.)

## Parallelization

- **Sequential (shared files):** Tasks 5 and 6 edit the same five files — do them one after another.
- **Safe to parallelize after Task 1:** Task 3 (reconnect, board-store-provider only) and Task 4
  (badge, board-header only) touch disjoint files and can go in parallel.
- **Gating contract:** Task 1 must be merged before any other task — every subscription assumes a
  stable, session-long socket.

## Post-implementation findings (2026-06-11 cross-user browser test)

Two real accounts (isolated browser contexts) sharing one workspace + board via the real
invite → accept flow. Verified by acting as one user and confirming the other's screen with no reload.

**Passed end-to-end, cross-user:** `list:created`, `card:created` (+ self-echo dedupe — actor shows
no duplicate), `card:updated` (after the fix below), `card:archived` + the N4 sheet-close (B's open
detail sheet closed, `?cardId` stripped via `router.replace`, no broken dialog), `list:deleted`,
notification-bell delivery, **bell survives navigation with no polling** (B off the board page still
received `notification:new`), connection badge (appears on disconnect), and reconnect recovery (a list
created while B was offline appeared on reconnect via `router.refresh`).

**Bug found and fixed — `card:updated` emitted from the wrong action.** The emit was attached to
`updateCardAction`, which is **orphaned dead code never called by any UI path**. The card detail
sheet's "Save changes" calls `updateCardDetailsAction` (`card-detail-sheet.tsx:193`). Renames
therefore never propagated. Fix: moved the emit to `updateCardDetailsAction` (after `revalidatePath`,
payload `{ cardId, title }`). **Caught only by the cross-user browser test** — the build, 58 unit
tests, and code review all passed with the bug present.

**Dead code removed (the duplicate title-update path that caused the bug):** `updateCardAction`,
its `UpdateCardResult` type, `lib/card.ts#updateCardTitle`, and `updateCardSchema`/`UpdateCardInput`
from `lib/schemas` — all consumed only by the orphaned action.

**Not exercised (test-tooling limitation, not a defect):** `list:moved` drag — synthetic
pointer/keyboard events don't reliably drive `@hello-pangea/dnd`'s sensors (the keyboard live-region
confirmed the sensor *engages*, but the index wouldn't advance). Same emit→store→subscribe path as the
verified events; `applyRemoteListMoved` has unit coverage. `list:updated` was likewise not driven via
UI but shares the unit-tested `applyRemoteListUpdated` handler. Worth a manual drag/rename to close out.
