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
| `card:labels-updated` | board | cardId, labels[] | live (in-place) |
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
  place; emitted on attach/detach. Label rename/recolor/delete propagate via
  `revalidatePath`, not this event), notifications, analytics refresh.

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
apply — is proven end-to-end for card creation by US-009
(`e2e/realtime-card-create.spec.ts`): two real users on one board, a card created
by one appears live for the other with no reload, run against the real
`server.ts` (Next + Socket.io) and Postgres. Sabotage-verified — neutralizing
`emitCardCreated` turns it red. Remaining slices (DnD/`card:moved` with the
drag-defer invariant, label/comment propagation) still have single-client unit
proof only.

## Notification & analytics signals

- `emitNotificationNew(userId, payload)` pushes to the user's room — the bell
  updates without polling.
- `emitAnalyticsRefresh(workspaceId)` signals dashboard clients to refetch;
  no data rides the event, the client re-runs the analytics query.
