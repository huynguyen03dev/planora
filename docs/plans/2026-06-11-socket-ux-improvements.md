# Spec: Socket Tier 1 + Tier 2 UX Improvements

**Date:** 2026-06-11  
**Scope:** Tier 1 (reconnect recovery, connection badge, list:moved) + Tier 2 (board CRUD events, bell polling fix)

---

## Objective

Make the board feel like a live collaborative surface, not a snapshot that goes stale.
Today: card moves and comments sync live; everything else (card create/rename/archive, list
create/rename/delete/reorder) is invisible to other users until they navigate. The socket
lifecycle also kills the notification bell every time you leave a board page (requiring a
polling workaround).

Success = another user's actions on the board appear immediately for all viewers, and the
connection state is visible so users never wonder if they're seeing stale data.

---

## Tech Stack

Next.js 16 (App Router), React 19, Socket.io 4.8, Zustand, TypeScript strict, Prisma 7.

---

## Commands

```bash
npm run dev        # tsx server.ts (custom HTTP + Socket.io)
npm run build      # Next.js production build
npm run lint       # ESLint
npx vitest run     # Unit tests
```

---

## Architecture: The Root Problem

`board-store-provider.tsx` calls `disconnectSocket()` on cleanup (line 103). This kills the
module-level socket variable and disconnects the socket every time you leave a board page.
The `NotificationBell` (always mounted in the app shell) detects its listener is gone and
works around it via a 2-second polling interval.

**Fix:** Create a `SocketLifecycleProvider` at the `app/(authenticated)/layout.tsx` level.
It owns `initSocket()` on mount and `disconnectSocket()` on unmount (i.e., only on
logout/navigating out of the authenticated area). The board provider and bell subscribe
normally via `useEffect` without worrying about socket creation or destruction.

```
app/(authenticated)/layout.tsx
  └─ SocketLifecycleProvider       ← NEW: owns initSocket() + disconnectSocket()
      ├─ AuthenticatedHeaderActions
      │   └─ NotificationBell      ← subscribes via useEffect, no polling
      └─ {children}
          └─ (board pages)
              └─ BoardStoreProvider ← subscribes, manages room joins, NO disconnectSocket()
```

The `disconnectSocket()` also needs to be called in `handleSignOut()` in `user-button.tsx`
so the socket closes cleanly on explicit logout.

---

## Events: Before and After

### Existing (unchanged)

| Event | Room | Direction |
|---|---|---|
| `card:moved` | board | server→client |
| `comment:created` | board | server→client |
| `notification:new` | user | server→client |
| `analytics:refresh` | workspace | server→client |
| `board:join/leave` | — | client→server |
| `workspace:join/leave` | — | client→server |

### New events (this spec)

| Event | Room | Payload | Emitted from |
|---|---|---|---|
| `list:moved` | board | `{ boardId, listId, position }` | `reorderListAction` |
| `list:created` | board | `{ boardId, list: ListSnapshot }` | `createListAction` |
| `list:updated` | board | `{ boardId, listId, title?, isDone? }` | `updateListAction`, `updateListIsDoneAction` |
| `list:deleted` | board | `{ boardId, listId }` | `deleteListAction` |
| `card:created` | board | `{ boardId, card: CardSnapshot }` | `createCardAction` |
| `card:updated` | board | `{ boardId, cardId, title }` | `updateCardDetailsAction` |
| `card:archived` | board | `{ boardId, cardId }` | `archiveCardAction` |

```ts
// Snapshot shapes (board-view only — no detail modal fields)
type ListSnapshot = { id: string; title: string; boardId: string; isDone: boolean; position: number }
type CardSnapshot = { id: string; listId: string; title: string; position: number }
```

`card:updated` carries only `title` — that is the only card field visible on the kanban board
item. Description, estimate, due date changes do not affect the board view and are out of scope.

**⚠️ These payloads are NOT carried by the actions today — they must be added.** The current
actions return only IDs (`createListAction` → `{ success, listId }` at actions.ts:257,
`createCardAction` → `{ success, cardId }`). The full data needed for each snapshot *is* in
scope at emit time — `createList()` returns the full row (`position`, `isDone`, `boardId`,
`title`), and `createCardAction` has the created `card` + computed `position` available — so
building the snapshot is straightforward. But the emit calls do not exist yet; this spec adds
them. Do not read the table above as "the action already emits this."

---

## Feature Breakdown

### T1-A: Reconnection Recovery

**What:** When the socket reconnects after a drop, the board has missed events. On `connect`
after the first successful connection, trigger `router.refresh()` to sync the board to the
current DB state.

**Where:** `board-store-provider.tsx` — add a `connectedRef = useRef(false)` to the board
join effect. Set it `true` on first connect; on subsequent connects, call `router.refresh()`.

```tsx
const connectedRef = useRef(false);
function onConnect() {
  joinBoard(boardId);
  if (connectedRef.current) {
    router.refresh();
  }
  connectedRef.current = true;
}
```

**Files:** `board-store-provider.tsx`

---

### T1-B: Connection Status Badge

**What:** When `socketConnected` is false, show a small "Reconnecting…" chip in the board
toolbar so users know they might be seeing stale data. Disappears when connected.

**Where:** The board toolbar lives in the board page layout. Read `socketConnected` from the
board store. The badge should be unobtrusive — a small pill in the header row of the board,
not a blocking overlay.

**Criteria:** Badge visible when disconnected, hidden when connected. No badge on initial
load (socket connects quickly; avoid flash).

**Files:** Board page header component (wherever the board title/actions row is rendered).
Read: `useBoardStore((s) => s.socketConnected)`.

---

### T1-C: `list:moved` Event

**What:** When `reorderListAction` succeeds, emit `list:moved` to the board room. Other
clients' `applyRemoteListMoved` re-sorts the list array by the new position value.

**Server emit pattern** (same as `emitCardMoved`):
```ts
export function emitListMoved(boardId: string, payload: { listId: string; position: number }) { ... }
```

**Store handler** — `applyRemoteListMoved(payload)`:
- Guard: `boardId !== payload.boardId` → no-op
- Find the list by id, update its position, re-sort `lists` by position

**Position is one line away.** `reorderListByNeighbors` already returns the full updated
`ListRecord` (`lib/list.ts:228`, returns the `db.list.update` row at `:256`); `reorderListAction`
just doesn't capture it (`actions.ts:652`, its only caller). Capture it and emit:
```ts
const updatedList = await reorderListByNeighbors({...});
emitListMoved(boardId, { listId: updatedList.id, position: updatedList.position });
```
No signature change, no re-query, no caller audit.

**Files:** `lib/realtime/types.ts`, `lib/realtime/server.ts`, `board-store.ts`,
`board-store-provider.tsx`, `actions.ts`.

---

### T2-A: Fix Notification Bell Polling

**What:** Remove the 2-second `setInterval` in `notification-bell.tsx`. Instead:
1. Add `SocketLifecycleProvider` to `app/(authenticated)/layout.tsx` (calls `initSocket()` on
   mount, `disconnectSocket()` on unmount).
2. Remove `disconnectSocket()` from `board-store-provider.tsx` cleanup.
3. In `notification-bell.tsx`, subscribe to `notification:new` in a plain `useEffect` — the
   socket is now stable for the entire session.
4. In `user-button.tsx`, call `disconnectSocket()` in `handleSignOut()` before/after `signOut`.
   Note: this is defensive — `signOut` redirects to `/sign-in` (outside `(authenticated)`), so the
   `SocketLifecycleProvider` already unmounts and disconnects. The load-bearing change is **removing**
   `disconnectSocket()` from the board provider (step 2), not adding it here.

**Files:** `app/(authenticated)/layout.tsx`, `lib/realtime/socket-lifecycle-provider.tsx`
(new), `board-store-provider.tsx`, `notification-bell.tsx`, `user-button.tsx`

---

### T2-B: Board CRUD Events

Seven new event types. Each follows this pattern:
1. **Type** added to `ServerToClientEvents` in `lib/realtime/types.ts`
2. **Payload interface** added to `lib/realtime/types.ts`
3. **`emit*` function** added to `lib/realtime/server.ts`
4. **Emit call** added in the server action after the DB write
5. **`applyRemote*` handler** added to `board-store.ts`
6. **Subscription** added in `board-store-provider.tsx`

#### `list:created`
- Emitted: after `createListAction` Prisma insert; payload includes the full list row + `position`
- Store: prepend to `lists`, sort by position

#### `list:updated`
- Emitted: after `updateListAction` (title) and `updateListIsDoneAction` (isDone); payload has
  only the changed field
- Store: find list by id, patch title or isDone in place

#### `list:deleted`
- Emitted: after `deleteListAction`
- Store: filter out list by id (cascade: all its cards disappear with it)

#### `card:created`
- Emitted: after `createCardAction`; payload is `CardSnapshot { id, listId, title, position }`
- Store: push to the matching list's `cards`, sort by position

#### `card:updated`
- Emitted: after `updateCardDetailsAction` (the detail sheet's save path — NOT the orphaned
  `updateCardAction`); payload is `{ boardId, cardId, title }`
- Store: find card by id (across all lists), patch `title` in place; if card is the currently
  selected card, also patch `selectedCard.card.title`

#### `card:archived`
- Emitted: after `archiveCardAction`
- Store: filter card out of all lists; if it was the selected card, set `selectedCardId` and
  `selectedCard` to null

#### `list:moved` (covered in T1-C above)

---

## Success Criteria

- [ ] Socket lifecycle: navigating between board pages does not kill the socket. `NotificationBell`
  receives `notification:new` without any polling interval.
- [ ] Reconnect recovery: disconnect the network, wait 3s, reconnect → board refreshes to
  current DB state within 2s.
- [ ] Connection badge: simulate disconnect (kill socket server) → "Reconnecting…" badge
  appears. Restart server → badge disappears.
- [ ] Two browsers, same board: user A creates a list → appears in user B's board within 1s.
- [ ] Two browsers: user A renames a list → user B sees new title within 1s.
- [ ] Two browsers: user A deletes a list → disappears from user B's board.
- [ ] Two browsers: user A creates a card → appears in user B's board.
- [ ] Two browsers: user A renames a card → user B sees new title.
- [ ] Two browsers: user A archives a card → disappears from user B's board.
- [ ] Two browsers: user A reorders lists → user B's list order updates.
- [ ] Existing: card moves and comments still sync (no regression).
- [ ] `npx vitest run` passes.
- [ ] `npm run build` passes with no TypeScript errors.

---

## Boundaries

**Always:**
- Guard every `applyRemote*` handler with `boardId !== payload.boardId` → no-op
- Remember the actor receives their own emit (`io.to(board)` includes the sender — `server.ts:42,46`).
  `*:created` handlers MUST early-return on an existing `id` to avoid double-insert (dedupe like
  `applyRemoteCommentCreated`). All other handlers must be idempotent (re-apply safe), like
  `applyRemoteCardMoved` — no dedupe needed.
- Keep payloads minimal — board-view fields only, no detail modal fields
- Emit after successful DB write, never before

**Ask first:**
- Any schema changes to Prisma models
- Adding fields to existing event payloads (breaks type contract for existing clients)

**Never:**
- Emit from a failed action (always check action success before emit)
- Add realtime to card detail modal fields (description, estimate, due date) — that's a
  separate feature requiring open-card refresh logic

---

## Implementation Order

These are ordered by dependency. Each step has a build-green checkpoint.

```
T2-A (socket lifecycle) FIRST — all other subscriptions depend on a stable socket
T1-C (list:moved)       — smallest new event; reorder helper already returns the position,
                          just capture it (see T1-C). Validates the full pipeline.
T1-A (reconnect)        — 10-line change once socket lifecycle is fixed
T1-B (badge)            — pure UI; first store subscription added to board-header.tsx
T2-B (CRUD events)      — 7 events, each independent; do in alphabetical order
```

| # | Task | Files changed | Est. |
|---|---|---|---|
| 1 | `SocketLifecycleProvider`, remove `disconnectSocket` from board provider, remove bell polling | layout.tsx, socket-lifecycle-provider.tsx (new), board-store-provider.tsx, notification-bell.tsx, user-button.tsx | 1h |
| 2 | `list:moved` end-to-end (capture `reorderListByNeighbors` return for position) | types.ts, server.ts, board-store.ts, board-store-provider.tsx, actions.ts | 1h |
| 3 | Reconnect recovery | board-store-provider.tsx | 20min |
| 4 | Connection status badge | board page header | 30min |
| 5 | `list:created`, `list:updated`, `list:deleted` events | types.ts, server.ts, board-store.ts, board-store-provider.tsx, actions.ts | 2h |
| 6 | `card:created`, `card:updated`, `card:archived` events | same files | 2h |

Total estimated: ~7 hours.

---

## Open Questions

None — all decisions are resolved above based on codebase inspection. Implementation can begin.
