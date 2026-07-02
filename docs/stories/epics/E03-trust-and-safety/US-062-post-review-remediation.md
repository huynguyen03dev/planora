# US-062 Post-review remediation — Fix-Now + Fix-Soon backlog

## Status

in progress — FIX-NOW complete (2026-07-01); FIX-SOON complete (2026-07-02),
with mn7 + mn12·email-verification + deps-track explicitly deferred (reasons below)

## Lane

high-risk (remediation **backlog**) — the bundle trips multiple FEATURE_INTAKE
hard gates: data migration (two indexes), auth (email verification), authorization
(realtime eviction, socket-authz test coverage, workspace-id validation), external
provider (`resend`). Per intake that is high-risk. But this is a *checklist of
independently-sized fixes*, not one atomic change: **implement each item as its own
right-sized slice/PR** using the per-item lane noted below, and **spin out a
`docs/decisions/NNNN-*.md` record for the hard-gate items** (indexes/migration,
email verification, socket-authz coverage, realtime eviction) when you touch them.
Do not weaken any validation. Surfaced by the whole-project 7-slice deep review +
an independent senior sign-off (Opus), **2026-07-01**.

## Source

Whole-project audit (7 parallel reviewers over Server Actions, auth/RBAC, realtime,
schema, frontend, shared libs, tests/deps) + a fresh adversarial senior validation,
2026-07-01. **Severities below are the senior-validated ones** — several were
downgraded from the first pass (MJ1/MJ3/MJ4/MJ5→MINOR, MJ6→defer), one was refuted
(mn5). Two first-pass errors are corrected here: (a) `board-header.tsx:292` uses an
**undefined** CSS var (a real render bug, not token hygiene); (b) `resend` is a
**production** runtime dep (`lib/email.ts`), not a dev tool.

Build state at time of review (independently re-run): `npm test` = **578 pass / 26
files**; `npx tsc --noEmit` = **0 errors**; `npm audit --omit=dev` = **1 critical +
13 high** (drifted since US-061); dev-branch lint clean (the 53 "errors" are ESLint
scanning the stray `.claude/worktrees/…` checkout, not source).

## Product Contract

The app stays correct, safe, and performant under the review's scrutiny: no
cross-tenant leak (already true — keep it); analytics reports are internally
consistent (the lead-time table agrees with its own count); the CSV export can never
carry a spreadsheet formula; the two security boundaries that actually matter —
socket room-authorization and Server Action transaction bodies — are test-proven;
and known dependency advisories are cleared to the extent a non-major fix allows.

## Relevant Product Docs

- `docs/product/analytics.md` — MJ2, MJ1, MJ6.
- `docs/product/workspaces-and-access.md` — mn12 (email verification), mn11 (workspace id).
- `docs/product/realtime-sync.md` — mn7 (eviction), mn8/mn9 (reconnect), tg1 (room authz).
- `docs/product/boards-and-cards.md` — MJ3/mn2 (reorder), mn1/fyi1 (soft-delete).
- `DESIGN.md` — mn13 (token fix, `board-header.tsx:292`).
- `docs/TEST_MATRIX.md` — tg1, tg2 (record the new proofs; the matrix is the map).
- `AGENTS.md` — Server Action contract. **Note: its test-coverage section is STALE**
  (says Server Actions/auth/RBAC/realtime "untested" — there are 578 tests incl. a
  142-case RBAC matrix + 28 sabotage-verified action tests). Correct it (Harness Delta).
- Decisions: `0010` (defer perf until proven — governs MJ6 defer), `0015`
  (soft-delete + position integrity — governs mn1).
- Related stories: US-058 (`csvCell`, MJ1), US-006/US-007/US-009 (test siblings for
  tg1/tg2), US-056 (reorder parity for MJ3/mn2), US-061 (deps, dp1).

## FIX NOW — cheap, real value (≈ a morning; do these first)

Each: `[id]` validated-severity · per-item-lane · `file:line` — change → proof.

- [x] **[MJ2] MAJOR (correctness)** · normal · `lib/analytics/engine.ts:574` & `:587`
  — the lead-time detail rows are capped at `MAX_LEAD_TIME_ROWS` **in
  `context.cardIds` (creation) order**, then sorted by `completedAt` desc *after*
  the cap. For >100 completions in range the table shows an arbitrary 100 while the
  header count (`totalCompleted`, `engine.ts:824`) reports the true total — they
  disagree. **Change:** collect all qualifying rows → `sort` by `completedAt` desc →
  `slice(0, MAX_LEAD_TIME_ROWS)`. **Proof:** unit test in `lib/analytics/engine.test.ts`
  with >100 completions asserting the returned rows are the newest-completed (this
  path is currently untested — only a ≤100 case at `:190` exists).

- [x] **[MJ1] MINOR (security-hardening; senior downgraded from CRITICAL — self-download,
  reflected-only)** · normal (public-contract + security, no hard gate — same posture
  as US-058) · `app/(authenticated)/(dashboard)/workspace/[slug]/dashboard/actions.ts:205-206`
  — `Board ID`/`Member ID` header cells interpolate `boardId`/`memberId` **raw**,
  bypassing `csvCell` (which is applied at `:250` and `:266`). Values come from
  `page.tsx:90-95` (`searchParams.board/member`, no UUID parse). **Change:** wrap
  both header values in `csvCell(...)`; also add validation of those params
  (defense-in-depth). Finishes the US-058 control. **Proof:** extend
  `tests/analytics-export.test.ts` — a `=`-leading `boardId`/`memberId` round-trips
  inert.
  **DONE + correction:** the story said `z.string().uuid()` for *both* params, but
  `memberId` is a Better Auth **user id** (nanoid-style — verified `page.tsx:75` →
  `m.userId`; cf. `card-member.ts`, which validates user ids as `.min(1).max(255)`,
  NOT `.uuid()`). `.uuid()` on `memberId` would have rejected every legitimate
  member filter. Shipped: `boardId` → `z.string().uuid()` (boards genuinely are
  UUIDs); `memberId` → `z.string().min(1).max(255)`. `csvCell` is the authoritative
  injection guard for both.

- [x] **[MJ4]+[MJ5] MINOR / perf-latent** · **high-risk (schema migration — record ONE
  decision covering both)** · `prisma/schema.prisma` `Label` (306-317) add
  `@@index([boardId])`; `BoardStar` (228-238) add `@@index([userId])`. `Label` is the
  only child model missing its FK index (cf. `Checklist:339`, `Comment:366`,
  `Attachment:386`); `getStarredBoardIds` (`lib/board.ts:114`) filters `BoardStar` by
  `userId` alone, unusable against the `[boardId,userId]` composite. Both run on every
  board open / dashboard render. Small tables today, guaranteed to degrade. **Change:**
  add the two `@@index` lines → `npx prisma migrate dev --name add_label_boardstar_indexes`
  → `npx prisma generate`. **Proof:** migration file present; index appears in schema.

- [x] **[mn13:292] MINOR (render bug — first-pass correction)** · tiny ·
  `components/boards/board-header.tsx:292` — `text-destructive-foreground` is an
  **undefined** CSS var in `globals.css` (only `--destructive` exists), so the error
  text renders with no color; every other error site uses `text-destructive`.
  **Change:** `text-destructive-foreground` → `text-destructive`.

- [x] **[mn10] MINOR (cosmetic)** · tiny · `components/boards/card-detail-sheet.tsx:177`
  (rendered at `:1203`) — the @mention option's role badge is stubbed `role: ""` and
  renders blank on the normal path. **Change:** delete the vestigial empty `<span>`
  (or thread the real role through if the badge is wanted).

- [x] **[mn14] NIT** · tiny · `lib/schemas/card-member.ts:6-7,18-19` — comment claims
  `cardId` is a Better-Auth 32-char id, but `cardId` is an app UUID and `.uuid()`
  (`:9,:21`) is correct; the comment describes `userId` and is misplaced. **Change:**
  delete/relocate the comment (do NOT "fix" the validator).

- [x] **[mn15] NIT** · tiny · `lib/list.ts:10` — redefines `MIN_POSITION_GAP = 0.0001`
  locally while `lib/ordering.ts:14` already exports it. **Change:** import it.

- [x] **[dp1] hygiene** · normal (deps — cf. US-061) — run `npm audit fix` (**non-major,
  no `--force`**) → clears ~12/14 advisories (mostly the Prisma-7 CLI/dev subtree). Do
  **not** auto-bump `vitest 2→4` here (major, dev-only vitest-UI critical — its own
  decision). **Proof:** fresh `npm audit --omit=dev` diff attached.

## FIX SOON — real hardening (larger effort / lower urgency)

- [x] **[tg1] test gap — HIGH RISK surface** · **high-risk (authorization coverage —
  decision record; extends US-006/US-009)** · `lib/realtime/auth.ts`
  (`getBoardMembershipRole` / `canUserJoinWorkspace` / `authenticateSocket`) has
  **zero unit tests** (grep: referenced only by `server.ts`). This is the socket
  room-authorization boundary — a regression leaks a workspace's live board stream to
  non-members. **Change:** add `lib/realtime/auth.test.ts` — deny non-member join,
  deny archived/foreign board, unknown role handled. **Proof:** new unit tests +
  `docs/TEST_MATRIX.md` row.
  **DONE:** `lib/realtime/auth.test.ts` (19 cases) — missing/archived/foreign board
  + non-member all deny; unknown role → `viewer` (least privilege); fail-closed on db
  error; `canUserJoinWorkspace` + `authenticateSocket` + `getUserProfile`. Decision
  **0017**; TEST_MATRIX row added.

- [x] **[tg2] test gap** · normal (extends US-006) · `tests/server-actions/list-card.test.ts`
  — `$transaction` is `vi.fn().mockResolvedValue` (never `mockImplementation`), so the
  transaction body never runs and the reorder libs are themselves mocked (`:70,:72`);
  the tests assert only that the write seam was *reached* (self-admitted, header
  `:10-14`). **Change:** `mockImplementation` that runs the callback against a fake tx
  so position / multi-row writes are exercised at the action layer. **Proof:** allow-path
  tests assert DB effects, not just that `$transaction` was called.
  **DONE:** a shared `makeTx()` fake tx + `mockImplementation` runs the real callback for
  a representative set — `createCard` (inserts at a gap position), `deleteList` (deletes
  the list), `moveCard` (relocates to target list at a resolved position via the real
  `resolveCardPosition`), `assign`/`removeCardMember` (member row created/deleted + history)
  — each asserting the tx effect. Reorder-lib seams stay mocked; their bodies are now
  unit-tested directly (see MJ3/mn2). Header comment updated.

- [x] **[MJ3]+[mn2] MINOR (reorder robustness)** · normal · give
  `resolveListPosition` (`lib/list.ts:287-291`) the same **live-adjacent-occupant
  re-query** cards use (`lib/ordering.ts:96-130`) instead of bisecting the client's
  stale prev/next hints; and make the retry guards (`lib/card.ts:205-207`,
  `actions.ts:1263-1264`) treat the stale-neighbor `Error("Invalid prev/nextCardId")`
  (`ordering.ts:87,91`) as **retryable** (renumber/append + retry, parity with the
  P2002 path). **Proof:** unit test simulating a concurrently-moved neighbor.
  **DONE:** `resolveListPosition` rewritten to re-query the live adjacent occupant
  (mover excluded), mirroring `resolveCardPosition`; new `bisectListPosition` throws
  `PositionSpaceExhaustedError` on a tight gap (dropped the old `Math.abs(...)` heuristic).
  New `StaleNeighborError` (tagged `prev|next`) replaces the hard `Error("Invalid …")`
  in both resolvers; the card, list, and cross-list-move retry loops **drop the offending
  hint and retry** (self-heal to the surviving neighbour / append) — genuine recovery,
  not just delayed failure. Position is not an authz boundary (the card still lands in the
  already-authorized target), so appending on a bogus hint is safe. Proof:
  `lib/list.test.ts` (list resolver + `reorderListByNeighbors` recovery), `lib/card.test.ts`
  (`reorderCardWithinListByNeighbors` recovery), `lib/ordering.test.ts` (both resolvers
  throw the tagged StaleNeighborError).

- [ ] **[mn7] MINOR (authz staleness)** · **high-risk (authorization — decision
  record)** · `server.ts:56` + `lib/realtime/auth.ts:41-67` — board role is resolved
  once at `board:join`; a demoted/removed user keeps **receiving** (read-only) board
  broadcasts until disconnect. **Change:** on the demote/remove action, evict the
  user's sockets (`io.in(ROOMS.user(id)).socketsLeave(ROOMS.board(boardId))`) or
  re-check membership on sensitive emits. **Proof:** test/manual — demoted user stops
  receiving broadcasts.
  **DEFERRED (reason):** there is **no first-party demote/remove Server Action** in the
  codebase to host the eviction — member management (role change / removal) has no UI or
  action yet (grep: only `card-member` removal exists; `organization` is exported from
  `auth-client` but the app never calls `removeMember`/`updateMemberRole`). Better Auth's
  org endpoints run inside the `/api/auth/[...all]` catch-all with no clean seam to the
  socket `io` instance (which lives in `server.ts`, not importable from `lib/auth.ts`).
  Building an adjacent half-mechanism would violate "preserve the claim or stop" — the
  eviction must land **with** the member-management feature. The read-only exposure window
  is bounded (demoted user keeps *viewing* until disconnect; all *writes* stay gated by the
  DB RBAC path, which re-checks per action). Revisit when member management ships.

- [~] **[mn12] MODERATE (pre-launch)** · **high-risk (auth hard gate — decision
  record)** · `lib/auth.ts:31-33` — `emailAndPassword.enabled` with no
  `requireEmailVerification` and no explicit session expiry; combined with
  invitation-accept-by-email match, an unverified signup on an invited email could
  accept another's invite. **Change:** enable `requireEmailVerification` (+
  `sendVerificationEmail`) and set `session.expiresIn`/`updateAge` **before public
  launch**. **Proof:** manual/e2e — unverified user cannot accept an invite.
  **PARTIAL — session hardening DONE, email verification DEFERRED (decision 0018):**
  shipped explicit `session.expiresIn = 7d` / `updateAge = 1d` (was implicit defaults —
  safe, no behaviour change). `requireEmailVerification` is **deferred to pre-launch**
  because (a) `lib/email.ts` logs instead of sending when `RESEND_API_KEY` is unset (the
  dev default), so enabling it now would lock out **every** new signup, and (b) the proof
  is E2E ("unverified user cannot accept an invite") and there is no E2E harness in-repo,
  so it can't be verified here — enabling an unprovable auth gate that breaks signup fails
  "preserve the claim or stop". A `NOTE` in `lib/auth.ts` + decision 0018 record the gate
  and its prerequisites (provision RESEND, wire `sendVerificationEmail`, add E2E).

- [x] **[mn17] LOW (footgun)** · tiny · `dashboard/actions.ts:196` — `generateAnalyticsCSV`
  is a `"use server"` export with no auth (pure formatter today; `db` imported `:10`
  but unused in it). **Change:** move it to a non-`"use server"` helper (e.g.
  `lib/analytics/csv-export.ts`) or add `verifySession`, so it can't become an
  unauthenticated endpoint if it ever reads the DB.
  **DONE:** moved to pure, sync `lib/analytics/csv-export.ts`; `AnalyticsExportPayload`
  type relocated to `lib/analytics/types.ts` (re-exported from the action for compat).
  Consumers (`analytics-export-buttons.tsx`, `tests/analytics-export.test.ts`) updated.

- [x] **[mn11] consistency** · tiny · `workspace/actions.ts:137,176,216` — take raw
  `workspaceId` with no Zod (safe: `hasWorkspacePermission` denies foreign/bogus ids
  before any write). **Change:** add `z.string().uuid()` parse per CLAUDE.md gotcha #4.
  **DONE + correction:** the story (and CLAUDE.md gotcha #4) said `.uuid()`, but a
  workspace IS a Better Auth **organization** — its id is a 32-char nanoid, NOT a UUID
  (same correction class as FIX-NOW MJ1; caught by `workspace.test.ts`, which uses a
  32-char org id). Shipped `z.string().min(1).max(255)` on all three settings actions.
  `hasWorkspacePermission` remains the real gate.

- [x] **[mn3] MINOR** · tiny · `lib/analytics/engine.ts:103` — `metadataNullableDate`
  does `new Date(value)` with no NaN guard → `Invalid Date` silently drops a card from
  overdue/late/burndown. **Change:** `Number.isNaN(d.getTime()) ? null : d`.
  **DONE:** guarded (unparseable → null = treated as no date). Regression test in
  `engine.test.ts` (garbage due date → card still counted/estimated, never overdue).

- [x] **[mn1] MINOR (latent; governed by decision 0015)** · normal · `lib/card.ts:222-260`
  & `:433-479` — card resolvers filter `archivedAt: null` but not `deletedAt` (diverge
  from `LIVE_CARD_SCOPE`). Latent only — `softDeleteCard` (`lib/card.ts:502`) is **dead
  code** (no callers). **Change:** either add `deletedAt: null` to both resolvers when
  soft-delete is wired, OR delete the dead `softDeleteCard` now to remove the trap.
  **DONE:** deleted the dead `softDeleteCard` (verified zero callers). It was the only
  writer of `deletedAt`, so no live card can carry it — the `archivedAt`-only resolvers
  are now safe by construction and the divergence trap is removed. `deletedAt` /
  `LIVE_CARD_SCOPE` stay in the schema/index (decision 0015) for the reorder scope.

- [x] **[mn8] MINOR** · normal · `components/authenticated-header-actions.tsx:41-53` —
  subscribes to `notification:new` once (`[]`), no reconnect refetch; the badge
  under-counts during a disconnect window (self-heals on nav). **Change:** refetch
  unread count on socket `"connect"`, mirroring `board-store-provider`.
  **DONE:** on socket `"connect"` the header now calls a new
  `getUnreadNotificationCountAction` (`app/(authenticated)/actions.ts`) and resets the
  authoritative unread count (best-effort; keeps current count on failure).

- [x] **[fyi2] hygiene** · normal · `lib/prisma.ts:4` — `PrismaPg` constructed with only
  `connectionString`, no pool bounds. **Change:** set `max`/`idleTimeoutMillis` before
  load.
  **DONE:** `PrismaPg` now takes `max` (default 10) and `idleTimeoutMillis` (default 30s),
  both env-overridable (`DATABASE_POOL_MAX` / `DATABASE_POOL_IDLE_MS`).

- [~] **[deps-track] watch** · normal — `resend` is a **prod** dep (`lib/email.ts`), so
  the `resend→svix→uuid` / `qs` advisories are in the prod tree. Not exploitable as
  used (no attacker-controlled input into those APIs), so not urgent; upgrade when a
  non-breaking `resend` lands. (Corrects the first pass, which mislabeled `resend` as a
  dev tool.)
  **DEFERRED (watch, as designed):** no code change — this item is a standing watch, not
  a fix. `npm audit --omit=dev` state re-checked below; upgrade `resend` when a
  non-breaking release clears the transitive `svix→uuid` / `qs` advisories.

## Explicitly DEFERRED / NOT in this story (recorded so we don't re-litigate)

- **mn5 — SKIP (refuted).** `notifications-list-client.tsx:37-45` is *pessimistic*
  (awaits the action, then sets state); there is no optimistic update to roll back.
  Optional only: add an error toast on rejection.
- **MJ6 — DEFER.** Burndown `getBurndownValueAt` is O(days × cards × events) × 2
  periods (`engine.ts:445-495`) — a scaling ceiling, not a defect; fine at real board
  sizes. Governed by **decision 0010** (prove the perf problem first). Perf harness
  already exists (`scripts/perf-measure.ts`, `scripts/seed-perf-board.ts`) — revisit if
  a seeded board is measurably slow.
- **mn6 — DEFER.** `normalizeRole`→`viewer` coercion (`lib/realtime/auth.ts:7-9`) vs
  `getWorkspaceRole`→`null` (`lib/authorization.ts:100-108`) is safe-by-design (least
  privilege; realtime role is presence/join only, DB path stays strict). Document intent.
- **mn4 — DEFER.** Burndown ideal-line anchoring (`engine.ts:488-491`) is a product choice.
- **mn9 — DEFER.** Board mount-while-disconnected reconnect gap
  (`board-store-provider.tsx:275-286`) — sub-second, self-healing; RSC render is fresh.
- **mn16 — DEFER/SKIP.** Parse-before-`verifySession` (`actions.ts:208-235,331-356`) has
  nil security impact, and ARCHITECTURE.md's own "Parse-First Boundary Rule" contradicts
  its numbered step order — arguably not even a violation.
- **fyi1 — DEFER.** List hard-delete cascades to its cards (bypasses card soft-delete),
  `schema.prisma:240-254` + `lib/list.ts:383` — consistent with the documented
  hard-cascade model. Record a decision only if list deletion should become recoverable.
- **Design-token nits — DEFER** (`list-card-item.tsx:50-70,364-366`, `list-column.tsx:254`,
  `board-header.tsx:266-268`, `board-card.tsx:111-115`): partly DESIGN.md-sanctioned
  (priority ramp is a declared adaptation; white-on-cover is intentional). Only the
  undefined-var `:292` is a real fix — it's in FIX-NOW.

## Acceptance Criteria

- Every **FIX-NOW** item is done; `npm test` green; a fresh `npm audit --omit=dev`
  shows the non-major advisories cleared (dev-only vitest critical may remain, tracked
  separately).
- Every **FIX-SOON** item is either done or explicitly deferred with a one-line reason
  (and a `docs/decisions/NNNN-*.md` for any hard-gate item that ships).
- The two test gaps (**tg1**, **tg2**) have new tests and `docs/TEST_MATRIX.md` rows.
- No cross-tenant leak or authorization regression is introduced (the review's headline
  strength must survive).

## Validation

`scripts/bin/harness-cli story update --id US-062 --unit 1 --integration 0 --e2e 0 --platform 0`
(set flags to what the shipped slices actually prove).

| Layer | Expected proof |
| --- | --- |
| Unit | MJ2 (>100-completions row ordering vs count); MJ1 (`=`-leading id round-trips inert via csvCell); MJ3/mn2 (stale-neighbor reorder retries); tg1 (socket authz: non-member/archived/unknown-role); tg2 (action transaction body runs — DB effects asserted); mn3 (NaN date → null). |
| Integration | tg2 at the Server Action layer (allow-path asserts writes, not just `$transaction` called). |
| E2E | mn12 (unverified user cannot accept an invite); mn7 (demoted user stops receiving board broadcasts) — extend US-009's two-client realtime spec. |
| Platform | MJ4/MJ5 migration applies cleanly (`prisma migrate deploy`); `lib/prisma.ts` pool bounds under load. |
| Release | Manual: open a CSV export with a `=`-leading board/member filter in a spreadsheet — no formula executes; analytics lead-time table's rows match its completed count. |

## Harness Delta

- **Correct `AGENTS.md`** test-coverage section — it understates reality (578 tests incl.
  142-case RBAC matrix + 28 sabotage-verified action tests). State it accurately:
  "security boundary is tested; transaction bodies (tg2) and realtime room-auth
  functions (tg1) are the real gaps."
- Record a `docs/decisions/NNNN-*.md` for each hard-gate item shipped (indexes/migration,
  email verification, socket-authz coverage, realtime eviction) per FEATURE_INTAKE.
- Add `docs/TEST_MATRIX.md` rows for tg1/tg2 when proven.

## Evidence

### FIX-NOW landed — 2026-07-01 (branch `fix/us-062-fix-now-remediation`)

All 8 FIX-NOW items shipped. `npm test` = **580 pass / 26 files** (+2 new tests);
`npx tsc --noEmit` = **0 errors**; `npx eslint` on changed source = **0 errors**
(only 3 pre-existing `<img>` warnings in `card-detail-sheet.tsx`, untouched lines).

- **MJ2** — `lib/analytics/engine.ts`: collect all lead-time rows → `sort` by
  `completedAt` desc → `slice(0, MAX_LEAD_TIME_ROWS)` (was cap-in-creation-order
  then sort). New regression test in `engine.test.ts` (120 completions; asserts the
  100 *newest* are returned, oldest 20 excluded, `totalCompleted` consistent).
- **MJ1** — `dashboard/actions.ts`: `Board ID`/`Member ID` header cells now go
  through `csvCell`. `page.tsx`: defense-in-depth `safeParse` — `boardId` as UUID,
  `memberId` as bounded string (see correction note above). New test in
  `analytics-export.test.ts` (formula-leading ids round-trip inert).
- **MJ4+MJ5** — `schema.prisma`: `@@index([boardId])` on `Label`,
  `@@index([userId])` on `BoardStar`. Migration
  `20260701100202_add_label_boardstar_indexes` created + applied; client
  regenerated. Decision **0016** recorded (hard-gate: schema migration).
- **mn13** — `board-header.tsx:292`: `text-destructive-foreground` (undefined var)
  → `text-destructive`.
- **mn10** — `card-detail-sheet.tsx`: removed the blank `@mention` role badge.
- **mn14** — `card-member.ts`: relocated the misplaced BA-id comment to `userId`.
- **mn15** — `list.ts`: imports `MIN_POSITION_GAP` from `ordering.ts` (was a local
  duplicate).
- **dp1** — `npm audit fix` (non-major, no `--force`): **34 → 11** vulnerabilities.
  Residual **1 critical + 1 high** are dev-only (`vitest`/`vite`), needing the major
  `vitest 2→4` bump — deferred to its own decision (per this story). Only
  `package-lock.json` changed (transitive bumps within semver).

Full source of this backlog: the 2026-07-01 whole-project review + senior validation.

### FIX-SOON landed — 2026-07-02 (branch `fix/us-062-fix-soon-remediation`)

`npm test` = **610 pass / 29 files** (+30 from the 580 FIX-NOW baseline);
`npx tsc --noEmit` = **0 errors**; `npx eslint` on changed source = **0 errors**.
`npm audit` unchanged (**11**: 9 moderate + 1 high + 1 critical) — no dependency
changes in this bucket; the critical (`vitest`) + high (`vite`) remain dev-only,
gated on the deferred `vitest 2→4` major; moderates include the prod `better-auth
<1.6.2` + `postcss` (tracked under deps-track).

**Shipped:**

- **tg1** — `lib/realtime/auth.test.ts` (19 cases); decision **0017**; TEST_MATRIX row.
- **tg2** — `list-card` positive controls now run the tx body against a fake tx and
  assert DB effects (createCard/deleteList/moveCard/assign+removeCardMember).
- **MJ3+mn2** — `resolveListPosition` re-queries the live adjacent occupant; new
  `StaleNeighborError` makes stale prev/next hints self-heal (drop hint → retry) in the
  card, list, and move loops. Proof: `lib/list.test.ts`, `lib/card.test.ts`,
  `lib/ordering.test.ts`.
- **mn17** — `generateAnalyticsCSV` → pure `lib/analytics/csv-export.ts` (no longer
  `"use server"`); type moved to `lib/analytics/types.ts`.
- **mn11** — workspaceId validated as a bounded string (NOT `.uuid()` — it's a Better
  Auth org id; see correction note above).
- **mn3** — NaN-date guard in `metadataNullableDate` + regression test.
- **mn1** — deleted dead `softDeleteCard` (removes the `deletedAt` resolver trap).
- **mn8** — unread-count resync on socket `"connect"` + `getUnreadNotificationCountAction`.
- **fyi2** — pg pool bounds (`max` / `idleTimeoutMillis`, env-overridable).
- **mn12 (session half)** — explicit `session.expiresIn`/`updateAge`; decision **0018**.

**Deferred (with reasons, per acceptance criteria):**

- **mn7** (socket eviction on demote/remove) — no first-party demote/remove action exists
  to host it; no clean seam from Better Auth's org endpoints to the socket `io`. Land it
  with member-management UI. Read-only exposure window is bounded; writes stay RBAC-gated.
- **mn12 email verification** — pre-launch gate (decision 0018): enabling it now locks out
  signups without a verified email transport, and the claim is E2E-only (no harness here).
- **deps-track** — standing watch; no code change.

**Harness delta applied:** `AGENTS.md` test-coverage section corrected (was stale — it
claimed Server Actions/auth/RBAC/realtime untested and denied E2E/CI; both exist).
