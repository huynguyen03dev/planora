# 0032 Concurrent Drag-Ordering: Lock Hierarchy + `moveRevision` Optimistic Concurrency

Date: 2026-08-09

## Status

Accepted. Gates the concurrent drag-ordering patch on `dev` (uncommitted working
tree, 2026-08-09).

## Context

Dragging a card or list is an optimistic, index-based client commit
(`@hello-pangea/dnd`). Two users can drag the same card (or the same list) at
the same time, or drag different cards into the same list slot. The pre-0032
protocol handled collisions with **retry loops** outside the write transaction:

- `resolveCardPosition` / `resolveListPosition` threw a `StaleNeighborError`
  when a client-supplied prev/next hint no longer named a live occupant, and the
  reorder functions retried with the stale hint dropped;
- a `P2002` (rival grabbed the slot) or `PositionSpaceExhaustedError` triggered a
  renumber **in a separate transaction**, then a full retry.

Three problems with that design:

1. **Lost updates.** A stale client's reorder could still *succeed* against a
   rival's newer move (append after the surviving anchor), silently overwriting
   the rival's intent. There was no notion of "the item was moved by someone
   else since you read it."
2. **Cross-transaction renumber races.** Renumbering outside the ordering
   transaction re-read the scope without locks, so two concurrent renumbers (or
   a renumber racing an append) could interleave and still collide.
3. **No deadlock discipline.** Nothing enforced a global lock order; as more
   writers took row locks (`restoreCardAction` already locks the parent list
   first), an inconsistent acquisition order would eventually produce
   deadlocks.

## Decision

### 1. Workspace-scoped lock hierarchy: workspace → boards → lists → card

Every production ordering transaction acquires row locks in one global order,
**one row per statement**:

- `lockWorkspaceRowForUpdate(workspaceId)` is the first gate.
- Board rows are then locked in ascending id order.
- Live list rows are then locked in ascending id order.
- The moved card is locked last with `lockCardRowForUpdate(cardId)`.

List ordering (create/reorder/restore) uses workspace → board → list. Card
creation uses workspace → board → list; card restore uses workspace → board →
list → card. A cross-list card move locks
the source and target boards/lists in sorted order before the card. Human moves
and automation call the same `moveCardInTransaction` helper.

The workspace gate is deliberately broader than one board. Recursive automation
can discover another target board after its first move; a board-only lock plan
would require cascade-wide pre-planning and could not prove deadlock safety.
Re-acquiring the workspace row from a recursive call is safe because the calls
share the same Prisma transaction. With the workspace gate, any two cascades in
one workspace serialize before they can discover disjoint scopes.

Automation enters this gate centrally at both `evaluateRules` and
`executeRuleActions`, before an ordered action step can mutate or lock its card.
The executor boundary is the invariant for every ordered action sequence, so a
sequence such as `set-priority` → `move-card-to-list` cannot acquire the card
before the move's workspace gate. Recursive calls re-acquire the same row in the
shared transaction; this is intentionally re-entrant. The workspace gate is the
deadlock-prevention boundary, while `moveCardInTransaction` retains the
parent-to-child board → list → card lock order inside it.

Restore card additionally locks the (archived) card row directly (the live lock
helper filters it out) and re-verifies `archivedAt` under the lock.

Completion is not a position mutation, but completion/reopen can produce a
recursive move-capable automation event. The human completion action still calls
`lockCardOrderingScopeForUpdate` before `setCardCompletion` because that card
CAS occurs before evaluator entry. Automation `set-completion` is protected by
the central evaluator/executor workspace gate; any recursive move then takes
its parent board/list/card locks through `moveCardInTransaction`. This is a
lock-order precondition only; estimate gating, authorization, transition
semantics, history, and deferred effects remain unchanged. The assignment and
label trigger call sites do not explicitly take a card row lock before
evaluation; their automation action sequence is still gated centrally.

The SQL proof in `tests/db-0032-ordering-proof.test.ts` directly exercises the
workspace/board/list/card lock statements and CAS SQL. The application-path
proof is separate: `lib/card.test.ts`, `lib/list.test.ts`, server-action tests,
and automation executor/evaluator tests exercise the helpers and routing. The
completion-specific race proof holds the scope in one transaction while an
automation-order move waits at the workspace gate, and retains a card-first
control that deterministically fails with a lock timeout/deadlock code. The
automation-sequence proof likewise holds the workspace gate before a priority
card update and move, with the old card-first sequence retained only as a SQL
deadlock control.

Two cross-moves in opposite directions therefore queue at the same workspace
gate instead of deadlocking. The proof retains a deliberately wrong-order SQL
control that times out with `55P03`/`40P01`; that control is not an application
path.

### 2. `moveRevision` — a monotonic OCC revision on `List` and `Card`

- New column `moveRevision INTEGER NOT NULL DEFAULT 0` on both tables
  (migration `20260809070623_add_move_revision`). It represents a logical move
  of that row: create, restore, human reorder, and successful user/automation
  move bump the moved row. Internal normalization is maintenance: it preserves
  sibling relative order and rewrites positions only, so it does not bump or
  emit sibling revisions/events.
- The client sends the revision it observed **before** its optimistic bump as
  `expectedMoveRevision`; the server reads the moved row **under the lock** and
  rejects with `OrderConflictError("MOVE_REVISION")` when it does not match, and
  again CAS-es the write (`UPDATE ... WHERE moveRevision = expected`) so the
  reject is race-free.
- Actions map the typed error to `{ success: false, code: "ORDER_CONFLICT" }`;
  the client rolls back its optimistic commit and `router.refresh()`es canonical
  state. Echo payloads (`card:moved` / `list:moved`) carry the post-bump
  revision; the store rejects lower-revision echoes, dedupes equal+same-position
  echoes, and applies equal+different-position (canonical correction) and
  higher-revision (cross-user) echoes.

### 3. Explicit placement intent — never guess from null hints

The translate layer derives an explicit `intent: "start" | "end" | "between"`
from the exact drop index and sends it with the neighbors:

- `start` / `end` are **absolute** against the current live ends of the scope —
  a stale anchor hint can never block or misplace them.
- `between` is **relative** to the named anchors: preserve prev-anchored
  insertion when both anchors are live and `prev.position < next.position` (a
  rival inserted between them does not discard the prev anchor); rebase on the
  single surviving anchor when exactly one is stale; throw
  `OrderConflictError("ANCHORS_STALE")` when both are stale or both remain live
  but `prev.position >= next.position`.

### 4. Renumber stays IN the transaction (lock still held)

`PositionSpaceExhaustedError` no longer triggers a separate-transaction retry:
the caller renumbers the scope inside the same transaction (the ordering lock is
still held) and re-resolves against the fresh layout.

### 5. Dead retry loops removed

`StaleNeighborError`, `MAX_REORDER_*_RETRIES`, and the restore P2002 retry loop
are gone; the serialization is now the locks + the OCC revision, not
retry-on-stale.

## Alternatives Considered

1. **Keep hint-dropping retries + add revision check only.** Rejected: the
   retry loops were the collision mechanism, so both mechanisms would coexist
   with conflicting outcomes (a stale hint still silently relocated the item).
   The explicit-intent model is strictly more faithful to what the user dropped.
2. **Application-level advisory lock per board/list.** Rejected: row-level
   `FOR UPDATE` gives the same serialization with a finer granularity and no
   new lock table/lifecycle; the existing US-074/US-083 lock protocol already
   uses row locks.
3. **Client-generated UUID ordering positions (no revision).** Rejected: larger
   change to the float-gap model already proven by US-056/US-062; the revision
   preserves the proven position math and adds exactly the missing OCC piece.

## Consequences

- Every production ordering write now takes the workspace gate and the
  parent-to-child scope locks; contention serializes all ordering work in one
  workspace (correctness over throughput — drags are human-rate).
- Normalization may issue multiple sibling position updates inside the held
  transaction, but it never bumps sibling `moveRevision` or emits sibling
  events. Sibling relative order therefore stays correct in an optimistic
  client; a later authoritative board read supplies the normalized numeric
  positions. A cross-board automation move emits the canonical card once to
  the destination room and once to the source room so both boards reconcile.
- The `moveRevision` column is new; pre-0032 rows default to 0 and remain valid
  (a client that never saw a revision sends 0 and matches).
- Socket payloads for `card:moved`/`list:moved` gained `moveRevision`; older
  emitters' payloads without it are treated as revision 0 by receivers.
- A cross-board automation `card:moved` includes the canonical card snapshot in
  the destination-room payload; the source-room payload removes the old copy.
- Ordering writers and automation-capable completion paths MUST follow the lock
  order; a future writer that locks a card before its workspace/parent scope
  would reintroduce deadlocks (the DB proof's completion control demonstrates
  the failure mode).
