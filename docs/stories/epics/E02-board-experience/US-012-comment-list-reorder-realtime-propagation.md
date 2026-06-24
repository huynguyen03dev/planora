# US-012 Comment + list-reorder realtime propagation (E2E proof)

## Status

implemented

## Lane

normal

Change request — closes the two realtime slices the test matrix listed as
pending (comment propagation, list reorder) with two-client E2E proof. Both
events (`comment:created`, `list:moved`) were already emitted by the Server
Actions; this story adds the cross-client proof, mirroring US-009/010/011. Risk
flags: weak proof (comment + list-reorder propagation were unproven end-to-end).
No hard gate — no schema/migration, no new authorization surface, no new socket
event. Normal lane.

Scope honesty: this does **not** seal the entire realtime surface. Events still
lacking dedicated cross-client proof: `card:updated` (title edit),
`list:created` / `list:updated` / `list:deleted`, `notification:new`,
`analytics:refresh`. These are lower-risk (none carry the drag-corruption risk
this campaign targeted) and are left for a follow-up.

## Product Contract

When a user posts a comment, any other user with that card's detail sheet open
sees the comment appear **live** (no reload). When a user reorders a list, any
other user viewing the board (and not mid-drag) sees the columns relocate
**live**. Prisma remains the source of truth; the socket events are
notifications only.

This is the first proof that a **structural list** event (`list:moved`) applies
live on an observer — card structural events were proven in US-009; lists were
not.

## Relevant Product Docs

- `docs/product/realtime-sync.md` (`comment:created` live in-place; `list:moved`
  structural / deferred-while-dragging classification)
- `docs/product/boards-and-cards.md` (card detail comments; list order)

## Acceptance Criteria

- A comment posted by one user appears live in another user's already-open card
  detail sheet — no reload.
- A list keyboard-reordered by one user relocates live on another observer's
  board (applied because the observer is not dragging) — no reload.
- No new event, schema, or authorization surface — reuses the existing
  `comment:created` / `list:moved` emitters and their action gates.

## Design Notes

- **No implementation change.** `emitCommentCreated` and `emitListMoved` are
  already invoked by the Server Actions
  (`app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts`), and the store
  reducers (`applyRemoteCommentCreated`, structural list apply) already exist.
  This story is the E2E proof only.
- **Comment surface:** comments render only in the open card detail sheet, so
  the proof opens Bob's sheet and asserts the comment text appears live.
- **List surface:** list order is read from the columns' left-edge `x`
  (`listColumnX` helper). List drags use the **keyboard sensor** — the "Drag
  list" handle carries the same `data-rfd-drag-handle-draggable-id` attribute the
  card helpers use, so `liftCard`/`moveLifted`/`dropCard` are reused verbatim
  (`@hello-pangea/dnd` ignores synthetic pointer/CDP drags).
- **New E2E helpers** (`e2e/helpers/app.ts`): `postComment`, `dragListLeft`,
  `listColumnX`.
- **Tables / API:** none changed.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-012 --unit 1 --integration 1 --e2e 1 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | Covered by existing `tests/board-store.test.ts` (`applyRemoteCommentCreated` + structural list reducers from US-009). No new reducer in this story. |
| Integration | Covered by existing `tests/server-actions/` boundary tests (comment + list-move actions). The emit path is unchanged. |
| E2E | `e2e/realtime-comment-list-reorder.spec.ts` — two users, one board: (1) Alice posts a comment → it appears live in Bob's open detail sheet; (2) Alice keyboard-reorders a list → Bob sees the columns relocate live. Sabotage-verified (both emits off → both observers stay stale → both red). |
| Platform | chromium on `ubuntu-latest` via `e2e.yml`. |
| Release | `npm run lint`, `npx tsc --noEmit`, `npm test` green; full E2E suite green together. |

## Harness Delta

None to harness tooling. Updates `docs/product/realtime-sync.md` and
`docs/TEST_MATRIX.md`.

## Evidence

- E2E: `npx playwright test realtime-comment-list-reorder` → 2 passing (~37s).
  Sabotage: renaming both `emitListMoved` / `emitCommentCreated` socket events
  (so listeners never receive them) leaves both observers stale → both tests
  red; reverted.
- `npm run lint` clean; `npx tsc --noEmit` clean.
