# 0017 Unit-test the socket room-authorization boundary

Date: 2026-07-02

## Status

Accepted

## Context

The 2026-07-01 whole-project review (US-062, gap tg1) found that
`lib/realtime/auth.ts` — `authenticateSocket`, `getBoardMembershipRole`,
`canUserJoinWorkspace`, `getUserProfile` — had **zero** unit tests, despite being
the authorization boundary for the realtime layer. `server.ts` calls
`getBoardMembershipRole` on `board:join` and `canUserJoinWorkspace` on
`workspace:join`; a regression that returns a non-null role (or `true`) for a
non-member would leak a workspace's live board stream (card moves, presence,
analytics refresh) to an outsider. This is the realtime analogue of the Server
Action RBAC matrix, which is heavily tested — so the gap was a real,
untested-authorization hard gate under FEATURE_INTAKE.

## Decision

Add `lib/realtime/auth.test.ts` as the durable proof for the socket room-auth
boundary and treat it as a required check going forward. Coverage:

- `getBoardMembershipRole`: denies (null) for a missing board, an archived board,
  and a non-member; scopes the membership lookup to the board's workspace and the
  given user; returns `admin`/`editor`/`viewer` verbatim; **normalizes an unknown
  role down to `viewer`** (least privilege); fails closed (null) on a db error.
- `canUserJoinWorkspace`: allow member / deny non-member / fail-closed.
- `authenticateSocket`: no-cookie → null, no-session → null, valid → userId
  (cookie forwarded, case-insensitive), throw → null.
- `getUserProfile`: resolves display fields / fails closed.

## Alternatives Considered

1. Rely on the existing two-client realtime E2E (US-009). Rejected: there is no
   E2E harness in this repo (no Playwright), and unit tests pin the exact
   deny/fail-closed semantics far more cheaply and precisely.
2. Leave untested and depend on code review. Rejected: this is an authorization
   boundary; the RBAC matrix sets the precedent that such boundaries are proven,
   not assumed.

## Consequences

Positive:

- The realtime room-auth boundary now has a regression net; the least-privilege
  role normalization and fail-closed behaviours are locked in.
- `docs/TEST_MATRIX.md` reflects the realtime boundary as tested.

Tradeoffs:

- The tests assert current behaviour; a deliberate future change to the deny
  semantics must update them (intended — that is the point of the net).

## Follow-Up

- Realtime authorization *staleness* (US-062 mn7 — a demoted/removed user keeps
  receiving board broadcasts until disconnect) remains open; see US-062 for why
  it is deferred (no first-party demote/remove action exists yet to host the
  socket eviction).
