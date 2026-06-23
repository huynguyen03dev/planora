# Design

## Domain Model

No new entities. The story formalizes one existing invariant as testable
assertions:

> A mutating Server Action must call `verifySession()` and then
> `hasWorkspacePermission(W, …)` — where `W` is derived from the **loaded
> resource**, not caller input — and must perform **no** Prisma write or realtime
> emit unless both succeed.

Trust chain under test:

```
caller identity (verifySession → userId)
        │
resource id (boardId/listId/cardId from input)
        │  loader: getBoardById / getListWithBoard / getCardWithListAndBoard
        ▼
resource.board.workspaceId   ← the authority, derived not asserted
        │
hasWorkspacePermission(workspaceId, {…}) ← membership(userId, workspaceId) + role
        │ true → proceed   │ false → { success:false } and STOP
        ▼
Prisma mutation → realtime emit → revalidatePath
```

Isolation holds because `W` comes from the resource. The test must defend exactly
that: feed a resource whose `workspaceId` the caller is *not* a member of, and
assert the gate denies.

## Application Flow

Each test invokes the real action function with mocked collaborators:

- `@/lib/dal.verifySession` → returns a chosen `{ userId }`, or is made to
  `redirect` (throw) for the no-session case.
- Resource loaders (`@/lib/board`, `@/lib/list`, `@/lib/card`) → return a fixture
  resource carrying a chosen `board.workspaceId`.
- Membership seam → a fake `auth.api.hasPermission` (or membership lookup) that
  answers from a fixture map `{ [userId]: { [workspaceId]: role } }`. This is the
  one rule that makes the isolation test real: **mock here, not at
  `hasWorkspacePermission`.**
- `@/lib/prisma` `db` → spy-only; every `create/update/delete/$transaction` is a
  `vi.fn()` whose call count we assert.
- Realtime emitters → spies, asserted not-called on the denied paths.

Three canonical assertions per mutating action:

| # | Setup | Assert |
| --- | --- | --- |
| A1 — auth | `verifySession` redirects (no session) | action throws/redirects; **0** Prisma writes; **0** emits |
| A2 — permission | session present; membership map denies the action's verb | returns `{ success: false }`; **0** Prisma writes; **0** emits |
| A3 — isolation | session user is a member of WS-B (any role); resource resolves to WS-A | denied via the WS-A-derived workspaceId; **0** writes; **0** emits |

A "happy path" allow case per action (member with sufficient role → write
happens) is included as the positive control so A2/A3 aren't vacuously green.

## Interface Contract

No public contract change. Actions keep their existing
`{ success: true, … } | { success: false; error }` shapes (and the redirect on
missing session). The story asserts those shapes under denial; it does not alter
them.

## Data Model

None. No schema, migration, or retention change. DB access is fully mocked.

## UI / Platform Impact

None (Vitest, node env). Output is a CI signal once US-008 wires the gate.

## Special case — `moveCardAction` (two-workspace)

`moveCardAction` loads the source card (`getCardWithListAndBoard(cardId)`) **and**
the target list (`getListWithBoard(targetListId)`). Both yield a `workspaceId`.
Extra assertions beyond A1–A3:

- Source card in WS-A, target list in WS-B, caller member of only one → **denied**,
  zero writes (no half-move, no cross-tenant card relocation).
- Source and target both WS-A, caller is a WS-A editor → allowed.

This is the highest-value single case in the suite; implement and review it
explicitly rather than letting the generic harness imply it.

## Observability

The suite itself is the audit surface. No new logs/metrics. Note in
`workspaces-and-access.md` that isolation is now unit-proven and where.

## Alternatives Considered

1. **Real-DB integration tests (test Postgres + seeded tenants).** Highest
   fidelity, but Server Actions depend on `headers()` / Better Auth session
   context that is awkward to stand up headless, and it needs a DB harness that
   doesn't exist yet. Deferred — would be its own intake. Mock-based proof at the
   action boundary is honest enough *because* we mock below
   `hasWorkspacePermission`, so the scoping logic runs for real.
2. **Mock `hasWorkspacePermission` directly.** Rejected — makes A3 a tautology
   (you'd be asserting your own mock). The whole point is to prove the
   workspaceId-derivation + check, so the mock seam must sit one layer lower.
3. **Sample a few "representative" actions.** Rejected — isolation bugs hide in
   the un-sampled action. The coverage table in `validation.md` is exhaustive by
   construction; US-008 keeps it from rotting.
