# Overview

US-009 — Two-client realtime E2E harness + cross-user sync proof. Sliced from
`docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md`
(Theme A — Trust & Safety, P0). Epic: `E03-trust-and-safety`.

## Current Behavior

Realtime sync is implemented but only **single-client unit-proven**. The store
reducer (`tests/board-store.test.ts`, 37 cases) proves remote-apply, drag-aware
deferral, and self-echo dedupe against *synthetic* events fed directly to the
Zustand store. The wire itself — `lib/realtime/{server,client}.ts`, Socket.io
rooms, the emit→broadcast→apply path — is row `no / no / no` in
`docs/TEST_MATRIX.md`: completely untested. There is no E2E tooling in the repo
at all (no Playwright/Cypress).

So nothing proves the property that actually matters to a user: **a change made
by one person shows up on another person's screen, live, without a reload.** A
regression in room scoping, the socket handshake, the board-join, or the client
apply path would pass every existing test.

## Target Behavior

A real browser-level harness drives **two authenticated users in the same
workspace, both viewing the same board**, against the real running app
(`server.ts` + Socket.io + Postgres), and asserts cross-client propagation.

**This story's slice (slice 1): card-create propagation.** User A creates a
card; User B — already on the board, no reload — sees it appear. This is the
smallest slice that exercises the entire wire end to end: socket connect →
`board:join` room membership → Server Action `emitCardCreated` → broadcast to
the board room → client receives `card:created` → store apply → DOM update.

It also stands up the reusable harness the rest of Theme A realtime work needs:
Playwright config, a two-user same-board fixture, and the two-browser-context
pattern.

## Out of Scope (follow-up slices)

- **Card move / DnD propagation** and the **drag-aware deferral** invariant
  (B mid-drag must not be clobbered by A's update). Needs keyboard-drag
  automation (CDP pointer-drag does not engage `@hello-pangea/dnd`). Tracked as
  US-009 slice 2.
- Label / comment / list realtime propagation (slices 3+).
- US-010 (cross-user label rename/delete needing reload) — a separate bug fix
  that will reuse this harness.
- Making E2E a **required** CI status check — slice 1 ships it as a separate,
  non-blocking workflow; promotion to required comes once it is proven stable.
