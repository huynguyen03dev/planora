# Exec Plan

## Goal

Prove — automatically, on every PR — that each mutating Server Action enforces
the security boundary in the right order: authenticated caller, then a
permission check against the **resource-derived** workspace, before any Prisma
write. Close the single highest-severity unproven gap in the app (multi-tenant
data isolation) without changing any production authorization behavior.

## Scope

In scope:

- A test harness (`tests/server-actions/` or `lib/actions/*.test.ts`) that can
  invoke a Server Action with a controllable identity and assert which DB calls
  did and did not happen. Mocks `@/lib/dal` (`verifySession`), the resource
  loaders (`getBoardById`, `getListWithBoard`, `getCardWithListAndBoard`,
  `getCardWithListAndMembers`), and `@/lib/prisma` (`db`), following the existing
  `vi.hoisted` + `vi.mock("@/lib/prisma")` pattern in `lib/label.test.ts`.
- **Isolation is tested one layer below `hasWorkspacePermission`.** Mock the
  membership boundary (`auth.api.hasPermission` / the membership lookup) keyed by
  `(userId, workspaceId)`, **not** `hasWorkspacePermission` itself — otherwise the
  isolation assertion is a tautology. The workspaceId-scoping logic must run for
  real so a WS-B member is genuinely denied on a WS-A resource.
- Three assertions per mutating action: (1) no session → no write; (2) denied
  permission → failure shape + zero writes + no emit; (3) wrong-workspace
  resource → denied via the resource-derived workspaceId.
- A coverage list (in `validation.md`) enumerating every mutating action so the
  suite is demonstrably exhaustive, not a sample. Specifically including the
  `moveCardAction` two-workspace case.
- Update `docs/product/workspaces-and-access.md` and `docs/TEST_MATRIX.md`.

Out of scope:

- Per-role allow/deny matrix (US-007).
- Realtime / two-client proof (US-009).
- Real-DB integration or HTTP-level tests.
- **Any change to production action code.** If a test cannot pass because the
  action has a real flaw, stop (see Stop Conditions) — do not fix it here.

## Risk Classification

Risk flags (inherited from IN-01, scoped to this child):

- **Auth** — verifies `verifySession` gating on the write path.
- **Authorization** — verifies `hasWorkspacePermission` gating and ordering.
- **Audit/security** — this *is* the multi-tenant isolation proof.
- **Weak proof** — the entire reason the story exists; the boundary is untested.
- **Existing behavior** — exercises accepted, shipped action behavior.
- **Multi-domain** — boards, lists, cards, comments, members, workspace settings.

Hard gates:

- Touches auth + authorization → high-risk lane (confirmed). **But** the change
  is test-only and adds no migration, no external provider, and weakens no
  validation. No production behavior changes, so **no decision record is required
  to land the tests themselves.** A decision becomes required only if a test
  reveals a real boundary gap and we choose to fix it (that fix is a separate
  intake).

## Work Phases

1. **Discovery** — done: mutation surface enumerated (see `design.md` coverage
   matrix); isolation mechanism confirmed (resource → `board.workspaceId` →
   `hasWorkspacePermission`).
2. **Design** — see `design.md`: harness shape, the "mock one layer below" rule,
   the three canonical assertions, and the `moveCardAction` two-workspace case.
3. **Validation planning** — see `validation.md`: per-action coverage table +
   commands + fixtures.
4. **Implementation** — build the harness + one fully-worked action
   (`updateBoardAction`) end-to-end first; review the assertion shape; then fan
   out across the remaining actions. Land `moveCardAction` last (most complex).
5. **Verification** — `npm test` green; every row in the coverage table has all
   three assertions; deliberately breaking an action (e.g. moving the permission
   check after the write) turns the suite red.
6. **Harness update** — update `workspaces-and-access.md` + `TEST_MATRIX.md`;
   `harness-cli story update --unit 1`; note US-007/US-008 as the next links.

## Stop Conditions

Pause for human confirmation if:

- A test cannot pass because the **action itself** is wrong (e.g. `moveCardAction`
  doesn't validate the target list's workspace, or a write precedes the gate).
  That is a real security finding — record it, stop, and open a fix as its own
  intake + decision. Do not silently fix or weaken the test to make it green.
- Proving isolation honestly would require mocking `hasWorkspacePermission`
  itself (tautology) instead of the layer below — re-confirm the seam first.
- A real-DB integration harness turns out to be needed for honest proof (would
  expand scope and need its own intake).
- Any validation requirement would have to be weakened to pass.
