# Real-time Sync

Planora broadcasts board and workspace changes to connected clients over
**Socket.io**. Socket events are **notifications only** — Prisma/PostgreSQL is
always the source of truth. Code lives in `lib/realtime/` and `server.ts`.

## Transport & lifecycle

- A **custom HTTP server** (`server.ts`, run via `tsx`) wraps the Next.js
  handler and attaches Socket.io (`initIO(server)`, stored as a singleton).
- The client holds a **single session-long socket**, set up by
  `lib/realtime/socket-lifecycle-provider.tsx` at the authenticated layout level
  (`initSocket()`), with reconnect handling.

## Auth & rooms

- **Authentication** happens at the socket handshake: middleware in `server.ts`
  reads the Better Auth cookie → resolves `userId` → stores `socket.data.userId`.
- **Authorization** happens at room join: `board:join` checks
  `canUserJoinBoard()`, `workspace:join` checks `canUserJoinWorkspace()`.
- Room scheme (`lib/realtime/events.ts`):
  `board:${boardId}`, `workspace:${workspaceId}`, `user:${userId}`.
- Client joiners: `joinBoard`/`leaveBoard`, `joinWorkspace`/`leaveWorkspace`.

## Events

Emitted from `lib/realtime/server.ts` inside Server Actions after a DB write.
Typed via `ServerToClientEvents` / `ClientToServerEvents` in
`lib/realtime/types.ts`.

| Event | Scope | Payload (shape) | Drag handling |
| --- | --- | --- | --- |
| `card:moved` | board | cardId, listId, position | **deferred** (structural) |
| `card:created` | board | card snapshot | **deferred** |
| `card:updated` | board | card changes | live (in-place) |
| `card:labels-updated` | board | cardId, labels[] | live (in-place); fanned out per affected card on label rename/recolor/delete (US-010) |
| `card:members-updated` | board | cardId, members[] | live (in-place); emitted on assign/remove (US-011) |
| `card:archived` | board | cardId | **deferred** |
| `list:moved` | board | listId, position | **deferred** |
| `list:created` | board | list snapshot | **deferred** |
| `list:updated` | board | title / isDone | live (in-place) |
| `list:deleted` | board | listId | **deferred** |
| `comment:created` | board | comment + activity + author | live (in-place) |
| `notification:new` | user | notification | live |
| `analytics:refresh` | workspace | (signal only) | live |
| `board:error` | board | error | live |

## Drag-Aware Deferral (critical invariant)

The board store (Zustand, `boards/[boardId]/board-store.ts` +
`board-store-provider.tsx`) must not apply **structural** remote events while a
local drag is in progress — doing so corrupts `@hello-pangea/dnd`'s array state.

```text
remote event
  -> isDragging ?  yes -> markResyncPending()        (defer; drop the change)
                   no  -> applyRemote<Thing>(payload) (mutate the store)
drop completes -> consumeResync()
  -> if a resync was pending: router.refresh() to pull canonical server state
```

- **Deferred while dragging:** card/list moved, created, deleted, archived.
- **Applied live (safe mid-drag):** comments, title edits, `isDone` toggles,
  card label changes (`card:labels-updated` — replaces a card's label set in
  place; emitted on attach/detach, and (US-010) fanned out per affected card on
  label rename/recolor/delete so every chip refreshes live), card member changes
  (`card:members-updated` — replaces the open card's assignee set; emitted on
  assign/remove, US-011), notifications, analytics refresh.

This is the fix behind commit `7706b6d` ("pause remote board updates during drag
to prevent drop corruption") and is covered by `tests/board-store.test.ts`. When
adding or changing board events, classify each as structural (defer) or in-place
(live) and preserve this behavior. The store handlers are named
`applyRemoteCardMoved`, `applyRemoteListCreated`, `applyRemoteListDeleted`,
`applyRemoteCommentCreated`, etc.

## Optimistic reorder/move & self-echo dedupe (decision 0008)

Card/list **reorder and move** are optimistic: `board-content.tsx` commits the
new order to the store before the Server Action runs. For these three actions
(`reorderCardAction`, `reorderListAction`, `moveCardAction`) the server **does
not** call `revalidatePath` — the optimistic commit is authoritative on the
actor's client, and every client (the actor included) converges via the
`card:moved` / `list:moved` socket event. (Create/update/delete/archive actions
still revalidate.)

Because the actor receives their **own** echo, `applyRemoteCardMoved` and
`applyRemoteListMoved` carry a **position-aware self-echo dedupe**: if the card /
list is already at the **canonical position** the payload carries, the handler
no-ops (no re-render). The optimistic commit is index-based and leaves a *stale*
position, so the actor's first echo still applies and corrects it — that echo,
not `revalidatePath`, is now what delivers canonical float-gap positions to the
actor. Deduping by id alone would leave stale positions that a later remote
re-sort could scramble; the position check prevents that. Genuine cross-user
moves always apply. Mirrors the existing id-based dedupe in
`applyRemoteCardCreated` / `applyRemoteListCreated`. Covered by
`tests/board-store.test.ts`.

The drag-aware deferral invariant above is unchanged: `card:moved` / `list:moved`
remain structural and are deferred during a local drag.

## Proof

The store reducer (remote-apply, drag-defer, self-echo dedupe) is unit-proven
against synthetic events in `tests/board-store.test.ts`. The **wire itself** —
socket connect → `board:join` room → Server Action emit → broadcast → client
apply — is proven end-to-end by US-009 against the real `server.ts` (Next +
Socket.io) and Postgres, with two real browser users on one board:

- **Card create** (`e2e/realtime-card-create.spec.ts`, slice 1): a card created
  by one user appears live for the other with no reload. Sabotage-verified —
  neutralizing `emitCardCreated` turns it red.
- **Card move** (`e2e/realtime-card-move.spec.ts`, slice 2): a card dragged
  across lists by one user (keyboard sensor — `@hello-pangea/dnd` ignores
  synthetic pointer drags) relocates live on the other's board. Sabotage-verified
  via `emitCardMoved`.
- **Drag-aware deferral** (same spec, slice 2): the critical invariant — while
  one user holds a card mid-drag, a structural remote event (an archive) is
  *deferred* rather than applied to the list array, then reconciled on drop via
  `router.refresh()`. A live-applied rename is used as a deterministic delivery
  barrier (so the deferral assertion isn't timing-based), and socket in-order
  delivery pins archive-before-rename. Sabotage-verified — removing the
  `isDragging` guard makes the archive apply mid-drag and turns it red.

- **Label CRUD propagation** (`e2e/realtime-label-sync.spec.ts`, US-010): a label
  renamed or deleted by one user updates/removes the card-face chip live on
  another user's board with no reload. `updateLabelAction`/`deleteLabelAction`
  fan the in-place `card:labels-updated` event out to every card carrying the
  label (delete captures the affected cards *before* the row cascade). Closes the
  US-005 limitation where label-set CRUD only propagated via `revalidatePath`.
  Sabotage-verified — neutralizing the fan-out leaves the other user's chip
  stale and turns both tests red. (Also fixes a latent id-only self-echo dedupe
  in `applyRemoteCardLabelsUpdated` that would have swallowed a recolor; now
  compares the full `{id,name,color}` snapshot, unit-covered.)

- **Member propagation** (`e2e/realtime-card-members.spec.ts`, US-011): with one
  user's card detail sheet open, another user assigning or removing a member
  updates the open sheet's assignee list live (no reload).
  `assignCardMemberAction`/`removeCardMemberAction` emit the in-place
  `card:members-updated` event; the store reducer patches `selectedCard`
  (scoped to the open card) and recomputes the assignable pool. Members render
  only in the detail sheet (never the card face), so the proof watches the open
  sheet. Sabotage-verified — neutralizing the emit leaves the observer's sheet
  stale and turns the test red.

Remaining slices (comment propagation, list reorder) still have single-client
unit proof only.

## Notification & analytics signals

- `emitNotificationNew(userId, payload)` pushes to the user's room — the bell
  updates without polling.
- `emitAnalyticsRefresh(workspaceId)` signals dashboard clients to refetch;
  no data rides the event, the client re-runs the analytics query.
