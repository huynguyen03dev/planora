# US-011 Card-member assign/remove realtime propagation

## Status

implemented

## Lane

normal

Change request — same family as US-010 (a mutating action that emitted no socket
event). Risk flags: public contract (new socket event), existing behavior
(assign/remove are US-006 boundary-tested), weak proof (member realtime was
unproven). No hard gate — authorization reuses the existing `card:["update"]`
gate (proven by US-006/007), no schema/migration. Normal lane.

## Product Contract

When an `admin`/`editor` assigns or removes a card member, any other user with
that card's detail sheet open sees the assignee list update **live** — no
reload. Prisma remains the source of truth; the socket event is a notification
only.

Scope note: members render in the **card detail sheet only**, never on the card
face in the board view. So the visible surface — and the proof — is the open
detail sheet, not the board at large.

## Relevant Product Docs

- `docs/product/realtime-sync.md` (events; in-place/live classification)
- `docs/product/boards-and-cards.md` (Assignees row)

## Acceptance Criteria

- Assigning a member updates the open card detail sheet's assignee list live on
  other viewers (no reload); the assigned member also leaves the "Add members"
  list.
- Removing a member drops them from the open sheet's assignee list live and
  returns them to the "Add members" list.
- Propagation uses a new in-place `card:members-updated` event (never deferred
  during drag — members never touch the list array).
- No new authorization surface: the actions keep the existing `card:["update"]`
  gate and workspace-isolation scoping.

## Design Notes

- **Event:** new `CardMembersUpdatedPayload { cardId, members[] }` +
  `card:members-updated` in `lib/realtime/types.ts`; `emitCardMembersUpdated` in
  `lib/realtime/server.ts` (mirrors `emitCardLabelsUpdated`).
- **Commands:** `assignCardMemberAction`/`removeCardMemberAction` emit it after
  the DB transaction when `changed`, carrying the fresh `getCardMembers(cardId)`
  snapshot (alongside the existing `emitAnalyticsRefresh`).
- **Store:** `applyRemoteCardMembersUpdated` patches `selectedCard.assignees`
  (scoped to the currently-open card, like `applyRemoteCommentCreated`) and
  recomputes `assignableMembers` from the known pool (assignees ∪ assignable)
  minus the new assignees — so the "Add members" list stays consistent without a
  server round-trip. Self-echo dedupe by assignee id set.
- **UI:** the detail sheet now reads `liveAssignees`/`liveAssignableMembers` from
  the store when the open card matches (mirrors `liveComments`). No card-face
  change — members aren't rendered there. The dialog body's `assignableMembers`
  prop was widened to the role-less shape (role is unused in render; the store
  snapshot carries none).
- **Scope decision:** reused the per-open-card `selectedCard` slice rather than
  threading a `members` array onto every board-store card, since nothing renders
  members on the card face — avoids dead data.
- **Tables / API:** none changed.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-011 --unit 1 --integration 1 --e2e 1 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | `tests/board-store.test.ts` — `applyRemoteCardMembersUpdated` (6 cases: assign adds + drops from pool, remove returns to pool deduped, self-echo no-op, wrong-card no-op, no-sheet-open no-op, boardId-mismatch no-op). Sabotage-verified (neutered apply turns add/remove red). |
| Integration | `tests/server-actions/list-card.test.ts` — assign/remove auth/permission/isolation boundary stays green (the emit path is guarded by `changed`, which the existing `changed: false` allow-tests exercise; no test change needed). |
| E2E | `e2e/realtime-card-members.spec.ts` — two users, one board, one card: with Bob's sheet open, Alice assigns Bob (assignee appears live) then removes him (assignee disappears live). Sabotage-verified (emit off → observer stays stale → red). |
| Platform | chromium on `ubuntu-latest` via `e2e.yml`; unit/integration via `ci.yml`. |
| Release | `npm run lint`, `npx tsc --noEmit`, `npm test` (369) all green; full E2E suite (6 tests) green together. |

## Harness Delta

None to harness tooling. Updates `docs/product/realtime-sync.md`,
`docs/product/boards-and-cards.md`, and `docs/TEST_MATRIX.md`.

## Evidence

- Unit: `npm test` → 369 passing (was 363; +6 reducer cases). Sabotage:
  neutering the reducer's assignee/pool update turns the add + remove cases red;
  reverted.
- E2E: `npx playwright test realtime-card-members` → 1 passing (~20s). Sabotage:
  early-returning `emitCardMembersUpdated` leaves Bob's open sheet stale
  (`toHaveCount(1)` → 0); reverted. Full E2E suite (6 tests) green together.
- `npm run lint` clean; `npx tsc --noEmit` clean.
