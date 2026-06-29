# US-037 Board tiles show info density instead of empty color blocks

## Status

implemented — 2026-06-29 (manual QA). Theme E, IN-02. Intake #28. Closes IN-02
(last remaining child).

## Lane

normal (with stronger validation) — touches already-shipped presentation
(existing-behavior), enriches the boards-overview payload (public-contract,
additive), proof is manual QA (weak-proof, IN-01 residual). 3 flags, **no hard
gate**: no schema/migration (counts use existing FK indexes), no auth/authz
change (the new query is scoped to the already-authorized board set), no Server
Action, no external system, no weakened validation.

## Product Contract

On the boards overview, each board tile shows **information density** instead of
a bare color block: a colored identity header (title + star) plus a footer with
**list count · card count**, a **last-activity** relative timestamp, and a
capped **assignee avatar stack** (`+N` overflow). The figures are read-only and
reflect the viewer's current load; no board data, ordering, navigation, or
starring behavior changes.

- **Last activity** is the most recent of the board's own `updatedAt` and the
  `updatedAt` of any of its lists/cards — i.e. it moves when work happens on the
  board, not only when the board record (title/colour) changes.
- **Card count** counts non-archived cards; **list count** counts the board's
  lists. **Members** are the distinct assignees across the board's non-archived
  cards.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — Boards. The board list/star/create
  contracts are unchanged; the overview payload gains read-only aggregate fields.

## Acceptance Criteria

- Each board tile renders a colored header (title + star) and a footer with
  `{n} lists · {m} cards`, `Updated {relative}`, and (when any) an avatar stack.
- Counts are correct: card count aggregates across the board's lists (cards
  carry no `boardId`); archived cards are excluded.
- Last-activity reflects the latest of board/list/card `updatedAt` (verified:
  "Updated 27 minutes ago" on the actively-edited board vs "3 days ago" on idle
  boards).
- Assignee avatars show distinct card members, capped at 3 with a `+N` overflow,
  reusing the `AvatarGroup` pattern from the card face (US-030); a board with no
  card assignees shows no stack.
- The "+ Create board" tile stretches to the board-tile height so rows stay
  even.
- The boards-data query stays **bounded by list count, not card count** — no
  per-card fetch for counts or avatars.
- No horizontal page overflow at 375px (single full-width column); light + dark
  render correctly; no console errors; unit suite stays green.

## Design Notes

- Commands: none. Queries: `listBoardsByWorkspaceIds` (`lib/workspace.ts`)
  enriched. API/Tables/Domain rules: none.
- **Query shape (bounded):**
  1. `db.board.findMany` with a nested `lists` select carrying `updatedAt`,
     `_count.cards` (non-archived), and the single most-recent card `updatedAt`
     (`orderBy updatedAt desc, take 1`). Rows scale with **list** count; card
     count is a count subquery and freshness is one row per list — never a
     per-card fetch. `cardCount = Σ list._count.cards`;
     `lastActivityAt = max(board, lists, latest-card updatedAt)`.
  2. `getDistinctBoardMembers(boardIds)` — the repo's **first `$queryRaw`**:
     `SELECT DISTINCT l."boardId", cm."userId" FROM "cardMember" cm JOIN "card"
     c … JOIN "list" l …` filtered to the authorized `boardIds`. Cards carry no
     `boardId`, so this joins `cardMember → card → list` once (all joins
     FK/PK-indexed: `cardMember` PK `(cardId,userId)`, `card.@@index([listId,…])`,
     `list.@@unique([boardId,…])`) instead of fetching every card's members.
     Parameterised with `Prisma.join(boardIds)`. Then one `user.findMany` for the
     distinct user ids. Bounded by distinct (board,user) pairs.
- **Type:** `WorkspaceBoard` (`lib/workspace.ts`) gains `listCount`, `cardCount`,
  `lastActivityAt: Date`, `members: WorkspaceBoardMember[]`, `memberCount`. The
  type flows page → wrapper → page-client → overview/workspace-view, so the three
  renderers switched their inline board shapes to `WorkspaceBoard`. `Date` crosses
  the RSC→client boundary natively (Next serializes it); the relative string is
  `suppressHydrationWarning` to avoid a sub-second SSR/hydrate drift.
- **UI:** `components/boards/board-card.tsx` rebuilt — bordered `bg-card` tile
  with a colored header band and a metadata footer; avatars reuse
  `components/ui/avatar` (`AvatarGroup`/`AvatarGroupCount`, `size="sm"`).
  `workspace-section.tsx` / `workspace-boards-view.tsx`: create-board button
  `h-24` → `h-full min-h-32` so it matches the taller tiles.
  `boards/loading.tsx`: skeleton tile height bumped to `h-32`.
- **Why raw SQL (new pattern):** it is the only way to get distinct per-board
  assignees without an unbounded per-card fetch, which the boards overview (all
  boards across all the user's workspaces) would otherwise incur. Read-only,
  parameterised, scoped to authorized ids.

## Validation

`scripts/bin/harness-cli story update --id US-037 --unit 0 --integration 0 --e2e 0 --platform 1`

| Layer | Expected proof |
| --- | --- |
| Unit | n/a today — the enriched query is integration-shaped (Prisma + raw SQL) and there is no Server-Action/DB test harness yet (IN-01 residual). Full suite (514) stays green. Counts/freshness/dedupe logic is small and pure over the query result. |
| Integration | n/a — no test harness for Prisma queries yet; covered by manual DB-backed browser QA below. |
| E2E | n/a — no harness. |
| Platform | Tiles show correct counts, meaningful last-activity, and distinct capped avatars on the seeded data; even rows; no overflow at 375px; light + dark; no console errors. |
| Release | Manual QA on the seeded boards overview. |

## Harness Delta

Introduces the first `$queryRaw` in the codebase (bounded distinct-assignee
join). Future cross-relation aggregates can follow this pattern; a Prisma-query
test harness remains an IN-01 residual gap.

## Evidence

Verified on the seeded boards overview, 2026-06-29, desktop + mobile.

- **Gate:** `tsc --noEmit` clean (excl. pre-existing untracked
  `scripts/perf-measure.ts`). `eslint` on the 6 changed files: 0 errors/warnings.
  `npm run build`: **app compiled successfully in 17.0s** (TS step fails only on
  the pre-existing untracked `scripts/perf-measure.ts`). Unit suite: **514
  passed**.
- **Browser QA:**
  - "Product Roadmap" tile: **5 lists · 17 cards**, **Updated 27 minutes ago**,
    avatar stack **PI · RB** (distinct card assignees) — the raw join returns the
    right people.
  - "Parity Review Board": 1 list · 1 card, Updated 3 days ago, no avatars.
  - "Marketing Launch": 3 lists · **0 cards**, Updated 3 days ago, no avatars
    (no cards → no assignees, as expected).
  - "+ Create board" tiles stretch to the tile height; rows are even.
  - 375px: `scrollWidth === clientWidth` (no horizontal overflow); single
    full-width column; footer metadata renders.
  - Dark mode: `bg-card` footer, muted-foreground text, themed avatars, and the
    dashed create tile all render correctly.
  - No console errors (only Fast-Refresh + `[realtime] Connected`).
- Screenshots: `.ui-review/us037-overview-light2.png`,
  `.ui-review/us037-overview-dark.png`, `.ui-review/us037-overview-mobile.png`.
