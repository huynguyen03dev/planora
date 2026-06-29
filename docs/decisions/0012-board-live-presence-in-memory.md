# 0012 Board live presence is ephemeral and in-memory

Date: 2026-06-29

## Status

Accepted

## Context

The board header should show who currently has a board open ("watchers"),
updating in real time as people open and close it — not a persisted, GitHub-style
"watch/subscribe" toggle. This needs a source of truth for *who is connected to
each board room right now*. Socket.io rooms already track sockets, but we need
user identity, dedupe across a user's multiple tabs, and a list to broadcast.

The app runs a single custom server (`server.ts`) with one Socket.io instance
held as a `global.io` singleton; Prisma/PostgreSQL is the source of truth for all
durable data, and socket events are notifications only.

## Decision

Track presence in an in-memory `PresenceRegistry` (`lib/realtime/presence.ts`),
a process-global singleton mirroring the `global.io` pattern. It maps
`boardId → userId → socketIds` (dedupe by user) with a reverse `socketId → boards`
index for disconnect cleanup. Each mutator returns whether the visible watcher
set changed so callers skip redundant broadcasts.

A new server→client event `board:presence { boardId, watchers: Watcher[] }`
(added to `ServerToClientEvents`) carries the full list to the board room on every
join/leave/disconnect. The server wires presence into the existing `board:join`
(after the `canUserJoinBoard` gate), `board:leave`, and `disconnect` handlers;
`disconnect` (not `disconnecting`) cleans up via the registry's reverse index, so
`socket.rooms` is not consulted. Display profiles (`{id,name,image}`) are resolved
once per connection via `getUserProfile` and memoized on `socket.data`. Presence
is never written to the database.

## Alternatives Considered

1. **Persisted Watch/subscribe model (Prisma `Watcher` table + migration).**
   Rejected: the user explicitly wanted "who's viewing now," which is ephemeral
   presence, not a durable subscription. Would add a hard-gate schema migration
   for no benefit here.
2. **Derive presence from raw Socket.io room membership at query time.** Rejected:
   no per-user dedupe, no cached profile, and `disconnect` clears `socket.rooms`
   before we can read it cleanly.
3. **Redis Socket.io adapter / shared presence store.** Deferred: only needed for
   multi-server deployment, which Planora is not today.

## Consequences

Positive:

- No schema change, no migration, no DB writes on the hot join/leave path.
- Dedupe-by-user and `changed`-gated broadcasts keep emits and re-renders minimal.
- Reuses existing room authorization (`canUserJoinBoard`) — non-members never
  receive presence.
- Pure registry is unit-tested (`lib/realtime/presence.test.ts`).

Tradeoffs:

- **Single-server only.** Presence lives in one process; a horizontally scaled
  deployment would split the watcher set across instances. Moving to multi-server
  requires a shared adapter (e.g. Redis) — see Alternative 3.
- Presence resets if the server restarts (acceptable for ephemeral data; clients
  re-join on reconnect).

## Follow-Up

- If/when the app scales beyond one server, introduce a Redis Socket.io adapter
  and back the registry with it.
