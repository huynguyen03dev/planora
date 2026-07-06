# US-041 Board live presence avatars

## Status

implemented — merged to dev (bd4281b, PR #45). Manual browser QA of live
presence avatars; decision `0012-board-live-presence-in-memory.md`. Status
corrected from stale `planned` on 2026-07-01 (bookkeeping, intake #42).

## Lane

normal

## Product Contract

The board header shows avatars of the people who **currently have the board
open**, updating in real time. Opening the board makes you appear to everyone
viewing it; closing the tab or navigating away makes you disappear. Presence is
ephemeral — nothing is persisted. Multiple tabs from the same user collapse to a
single avatar. This replaces the previous hardcoded placeholder avatars
(`AL`/`MK`).

## Relevant Product Docs

- `docs/product/realtime-sync.md`

## Acceptance Criteria

- Each viewer of a board sees an avatar for every other user who currently has
  that board open, plus themselves.
- When a user opens the board, their avatar appears for all current viewers
  within a moment; when they close the tab / navigate away / disconnect, it
  disappears.
- The same user with two tabs open is shown as one avatar (deduped by user id).
- Presence is scoped to the board room — only authorized board viewers
  (`canUserJoinBoard`) receive presence; non-members receive nothing.
- No empty-avatar flash on open: the current viewer is seeded immediately, then
  reconciled by the first server broadcast.
- Overflow beyond the visible cap collapses into a `+N` count (reuses the
  existing `AvatarGroup` block).

## Design Notes

- Commands: n/a (no Server Action; presence is socket-only, no DB write).
- Queries: `getUserProfile(userId)` for `{id,name,image}` on socket join
  (memoized per-socket on `socket.data`).
- API (realtime contract): new server→client event
  `board:presence { boardId, watchers: Watcher[] }`; reuses existing
  `board:join` / `board:leave` / `disconnect` client→server lifecycle.
- Tables: none (ephemeral, in-memory `PresenceRegistry`).
- Domain rules: dedupe by user id across sockets; broadcast only on a real
  membership change (`changed` return gates emits); `disconnect` cleanup via the
  registry's reverse `socketId → boards` index (not `socket.rooms`).
- UI surfaces: `components/boards/board-header.tsx` avatar group, fed from the
  Zustand board store `watchers`.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-041 --unit 1 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | `lib/realtime/presence.test.ts` — dedupe, last-tab-leaves, multi-board disconnect, idempotency, reconnect interleave |
| Integration | Manual two-session socket exercise (no automated socket harness exists yet) |
| E2E | Not covered (no Playwright in repo) |
| Platform | n/a |
| Release | Type-check + lint clean |

## Harness Delta

Adds a decision record for the in-memory / single-server presence architecture
(new realtime contract `board:presence`). Updates `docs/product/realtime-sync.md`
and `docs/TEST_MATRIX.md`.

## Evidence

Add commands, reports, screenshots, or links after validation exists.
