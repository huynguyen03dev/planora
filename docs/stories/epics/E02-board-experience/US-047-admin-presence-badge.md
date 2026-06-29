# US-047 Board admins are marked in the live presence avatars

## Status

implemented — 2026-06-29 (manual QA, browser-verified). Builds on the US-041
live-presence avatars; pairs with the US-046 board-header avatar treatment.

## Lane

normal (with stronger validation) — adds a field to the realtime presence
contract (public-contract), reads the workspace role for display (authorization,
read-only), and changes the custom `server.ts` board:join path
(existing-behavior, weak-proof). ~3 flags, **no hard gate**: no schema/migration,
no auth/authz *enforcement* change (role is read for display only; the same
membership check still gates the join), no external system, no weakened
validation.

## Product Contract

In the live "who's viewing now" presence avatars (US-041), a watcher who is an
**admin** of the board's workspace is visually distinguished from editors/viewers,
the way Trello marks board admins. Specifically, an admin's avatar carries a
small **crown** marker at its bottom-right corner. The marker is informational
only — it does not change what anyone can do.

- "Admin" means the `admin` workspace role (`admin`/`editor`/`viewer`,
  `lib/authorization.ts`); Planora has no board-level role distinct from the
  workspace role.
- The badge is decorative; the role is also exposed to assistive tech via the
  avatar's title (`"<name> (admin)"`).

## Relevant Product Docs

- `docs/product/realtime-sync.md` — presence is broadcast-only, Prisma is source
  of truth; this only adds a field to the presence payload.
- `docs/product/workspaces-and-access.md` — workspace roles.

## Dependencies

- **US-041** (live presence avatars) — this enriches that avatar list.
- **US-046** (board-header avatar treatment) — the presence avatars' fill/ring on
  the colored header was established there; this story tunes it for overlap
  clarity (see Evidence).

## Acceptance Criteria

- The realtime `Watcher` payload carries the watcher's workspace `role`, resolved
  per board on join (a user may be admin in one workspace, viewer in another), not
  cached with the board-independent profile.
- An admin watcher's avatar shows a small crown badge at the bottom-right; non-
  admins show no badge. The badge is decorative (`aria-hidden`); the role is
  conveyed to assistive tech via the avatar title.
- Authorization is unchanged: the same membership check still gates `board:join`
  (now returning the role, `null` = denied), and the badge confers no abilities.
- Overlapping presence avatars stay visually distinct (a clear ring), and an
  admin's crown is never hidden under an overlapping neighbour.
- Works in light + dark on the colored board header; unit suite green; no console
  errors on client navigation.

## Design Notes

- **Contract:** `Watcher` (`lib/realtime/types.ts`) gains `role: WorkspaceRole`;
  a new `UserProfile` is the board-independent profile that `getUserProfile`
  returns. `canUserJoinBoard` → `getBoardMembershipRole` (returns the role, or
  `null` when the user can't join) so one query does both authorization and the
  badge. `server.ts` merges the per-board role into the cached profile to build
  the `Watcher`.
- **UI:** `components/boards/board-header.tsx` renders the shadcn `AvatarBadge`
  (existing bottom-right slot) with `Crown02Icon` for `role === "admin"`, lifted
  with `z-10` so the badge isn't covered by the next avatar.
- **Avatar treatment:** shared in `components/boards/board-header-controls.ts` —
  light `bg-white text-slate-700` fill with a `ring-black/40` ring (a dark ring
  contrasts the light fill so overlapping avatars separate, and reads on any
  board-theme header in both themes).
- **No completion/role-management change** — display only.

## Non-Goals

- Per-board roles distinct from workspace roles (Planora has none).
- Changing authorization, role assignment, or what admins can do.
- Badging anything other than the presence avatars (e.g. card members).

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-047 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | `lib/realtime/presence.test.ts` updated to carry roles; full suite stays green. No new pure logic beyond `normalizeRole`. |
| Integration | n/a — no Server-Action/Prisma test harness (IN-01 residual); socket path is untested (realtime gap). |
| E2E | n/a — no harness. |
| Platform | Admin avatar shows the crown; non-admins don't; role rides the presence payload; authorization unchanged; overlap stays distinct; light + dark; no console errors. |
| Release | Manual QA: open a board as an admin (crown shows) and verify a non-admin watcher has none. |

## Harness Delta

Extends the realtime presence contract with `role` and splits `UserProfile`
(board-independent) from `Watcher` (per-board, role-bearing). `server.ts` changed
— **needs a dev-server restart** to take effect (no hot-reload for the custom
server). Future presence consumers get the role for free.

## Evidence

### What shipped

- **Contract + role resolution.** `Watcher` now extends `UserProfile` with
  `role: WorkspaceRole`. `getBoardMembershipRole(userId, boardId)` replaces
  `canUserJoinBoard` — one indexed `workspaceMember` query returns the role
  (`null` = can't join), serving both the join authorization and the badge.
  `server.ts` resolves the role on `board:join` and merges it into the cached
  board-independent profile to build the broadcast `Watcher`. The optimistic
  self-seed (`board-store-provider.tsx`) and the board page (`page.tsx`, reusing
  the role it already resolves for permissions) pass the role through.
- **Crown badge.** Admin watchers render a small gold `Crown02Icon`
  (`AvatarBadge`, bottom-right, `size-3`, `-right-0.5 -bottom-0.5`), lifted with
  `z-10` so an overlapping neighbour can't cover it. Decorative (`aria-hidden`);
  the avatar title reads `"<name> (admin)"` for assistive tech.
- **Overlap clarity.** Presence avatars use a light `bg-white text-slate-700`
  fill with a `ring-black/40` ring — the dark ring contrasts the light fill so
  overlapping avatars (`-space-x-2`) stay distinct, on any board-theme header, in
  both light and dark. (Iterated from a white ring, which is invisible between
  two white avatars, and a slate fill, which read too dark.)

### Verified (browser, authenticated)

- As the workspace admin, the presence avatar shows the gold crown at bottom-right
  in **light and dark** (`.ui-review/us-047-admin-crown-light.png`,
  `us-047-admin-crown-dark.png`).
- Overlap QA (temporary 3-watcher injection: admin + editor + viewer): the three
  avatars are clearly separated by the dark ring, only the admin shows a crown,
  and the admin (lifted) keeps its crown on top of the overlap. Injection
  reverted after QA.
- Authorization unchanged — `board:join` still denies non-members (the role
  resolver returns `null`).
- `tsc` clean; changed files lint clean; **523 unit tests green**; console clean
  on client navigation. (On a hard reload, the pre-existing dev-only
  `@hello-pangea/dnd` "drag handle" + radix `useId` hydration warnings appear;
  they are unrelated to this change — the crown renders only after the client-side
  presence seed, so it cannot cause an SSR mismatch.)
