# US-016 Card Archive/Restore

## Status

implemented

## Lane

normal (with stronger validation — a new DB-writing Server Action on the mutation
boundary)

Spec slice from `docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md`
(Theme B — Daily-use Parity, "Archive/trash management UI with restore"; fourth
child of epic `E04-board-parity`, after US-013 filtering, US-014 search, and
US-015 checklists). Soft-delete already works — `archiveCardAction` archives a
card and `Card.archivedAt` is set — but `restoreCard()` in `lib/card.ts` is **dead
code** (no action, no UI) and there is no view of archived cards. Archived cards
simply vanish with no way to recover them. This slice closes the recover half for
**cards**.

Risk flags: public-contract (new Server Action shape / client-visible behavior),
weak-proof (board UI has no RTL harness), existing-behavior (touches the archive
lifecycle already covered by US-006 `archiveCardAction` tests). **No migration** —
`archivedAt` already exists. No hard gate: reuses the existing `card:["delete"]`
permission (same gate as archive, no new role/statement), no external system, no
validation weakened. ~2 effective flags → normal lane with a US-006-style security
suite on the new action.

## Scope

**Cards only.** Lists and boards also support soft-delete (`List.archivedAt`,
board "Archive" via `deleteBoard`) but neither has a restore path; those are
deferred to follow-up slices (Trello parity is cards + lists + boards, delivered
incrementally):

- **List archive/restore** — lists can't even be archived yet (no action); that
  slice adds both halves.
- **Board restore ("Closed boards")** — lives at the workspace surface, its own
  slice.

Also deferred within cards: permanent delete (hard delete) from the archive view,
bulk restore, and an archived-cards realtime panel sync (the live board already
reconciles — see Realtime below).

## Product Contract

A card archived from the board (the existing card "Archive" action) can be
**restored**. The board header exposes an **Archived cards** view (gated to users
who can archive cards — editor/admin, not viewer) listing the board's archived
cards with their original list, each with a **Restore** button. Restore returns
the card to its list at the end (float-gap append) and it reappears live for other
viewers of the board. Restore is a Server Action gated by `card:["delete"]`
(viewer denied; editor/admin allowed), workspace-isolation-scoped via the card's
owning board, and only operates on a card that is actually archived.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` (Card lifecycle → Archive/restore)

## Acceptance Criteria

- A `restoreCardAction` Server Action exists: `verifySession()` →
  `card:["delete"]` permission → workspace-isolation scoping (workspaceId derived
  from the card's board, never client-supplied) → Zod parse → Prisma → realtime
  emit → `revalidatePath`.
- It resolves the card via an **archived-aware** resolver
  (`getArchivedCardWithListAndBoard`) — `getCardWithListAndBoard` filters
  `archivedAt: null` and could never find an archived card.
- A denied caller (signed out / viewer / wrong workspace) reaches **no** write
  seam and gets a not-found-style error (no resource existence leak).
- Restore clears `archivedAt` and records a `CARD_RESTORED` card-history event
  (mirrors the `CARD_ARCHIVED` event archive records, so analytics stays
  balanced).
- The board header surfaces an Archived cards view (editor/admin only) that lists
  archived cards (title + original list) with a Restore action; restoring removes
  the row and the card reappears on the board.

## Design Notes

- Permission: reuse `card:["delete"]` (the same gate as `archiveCardAction`) — no
  dedicated statement; restore is the inverse of the destructive op.
- Scoping resolver: `getArchivedCardWithListAndBoard(cardId)` mirrors
  `getCardWithListAndBoard` but requires `archivedAt: { not: null }` and returns
  the same `{ card, list, board:{workspaceId,archivedAt} }` envelope — the action
  derives `workspaceId` from it (A3 isolation), and a non-archived/foreign id
  resolves to null → "Card not found".
- Query: `getArchivedCards(boardId)` returns the board's archived cards
  (`{ id, title, listId, listTitle, archivedAt }`, newest first) for the view,
  scoped through `list.boardId` with the owning board not archived.
- History: `buildCardRestoredEvent` (already present, takes the same
  `CardArchivedMetadata` as archive) recorded inside the restore transaction.
- Realtime: restore reuses `emitCardCreated` — observers' boards already have a
  tested `card:created` reducer, so a restored card reappears live (symmetric with
  `emitCardArchived` removing it). Plus `emitAnalyticsRefresh`. No new event type.
- UI: shadcn `Dialog` + `ScrollArea` (`ArchivedCardsDialog`), a header button with
  a count badge next to the filter/search controls; `useTransition` +
  `router.refresh()` runner mirroring `CardLabelsSection`/`CardChecklistsSection`.
  Archived-cards data loaded in `page.tsx` (only when `canArchiveCard`) and passed
  down, same as the other board props.

## Slices / PRs

Single PR: data layer + `restoreCardAction` + the archived-cards view + the
security suite + manual browser QA.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-016 --unit 0 --integration 1 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — the action is integration-shaped (mock Prisma); the lib query/resolver are thin Prisma reads. |
| Integration | `tests/server-actions/list-card.test.ts` — `restoreCardAction`: A1 auth / A2 viewer-denied / A3 cross-workspace isolation + positive control, plus an archived-board guard and a not-archived/foreign-id guard (resolver returns null). Sabotage-verified (defeating the gate turns A2+A3 red). |
| E2E | Manual browser QA of the archive → Archived cards view → Restore round-trip; automated E2E deferred (same board-UI debt as US-005/013/014/015). |
| Platform | n/a |
| Release | `npx tsc --noEmit`, `npm run lint`, `npm test` green. |

## Harness Delta

Fourth child of epic `E04-board-parity` (Theme B of IN-01). No new artifact
locations. Establishes the archive-*restore* pattern (archived-aware resolver +
`CARD_RESTORED` history + `emitCardCreated` re-appearance) that the deferred
list/board restore slices will follow.

## Evidence

- Data layer: `lib/card.ts` — `getArchivedCards(boardId)` (newest-first archived
  summaries scoped through the list/board) + `getArchivedCardWithListAndBoard`
  (archived-aware scope resolver). The dead, history-skipping `restoreCard()`
  helper was removed (superseded by the in-transaction action path). Schema:
  `restoreCardSchema` + barrel export.
- Action: `restoreCardAction` in board `actions.ts` — `verifySession()` →
  `card:["delete"]` → archived-aware scope (archived-board + null guards) → tx
  (`archivedAt: null` + `buildCardRestoredEvent` / `CARD_RESTORED`) →
  `revalidatePath` + `emitCardCreated` (reappears live) + `emitAnalyticsRefresh`.
- UI: `components/boards/archived-cards-dialog.tsx` (shadcn `Dialog` +
  `ScrollArea` + `Button`, count badge, `useTransition` + `router.refresh()`),
  mounted in the board header next to filter/search; gated to `canArchiveCard`
  (editor/admin); archived data loaded in `page.tsx` only for those roles.
  Stale "cannot be undone" archive-confirm copy in `list-card-item.tsx` updated.
- Integration: `npx vitest run tests/server-actions/list-card.test.ts` → **90
  passing** (+6 restore cases). Full suite `npm test` → **411 passing** (was
  405; +6). `npx tsc --noEmit` + `npm run lint` clean.
- Sabotage-verified: defeating the `card:["delete"]` gate on `restoreCardAction`
  turned its A2 (viewer) + A3 (cross-workspace) red while A1/allow stayed green;
  reverted with a targeted edit.
- Manual browser QA (2026-06-24, dev server + Chrome DevTools MCP, board "Filter
  Board"): Archived cards view opens empty ("No archived cards."); archive Card A
  via its menu → it leaves the board; reopen the view → "Card A" listed "in To
  Do" with a Restore button; Restore → row disappears ("No archived cards.") and
  Card A reappears in To Do **with its Urgent label intact**. No console
  errors. Screenshot in scratchpad (`archived-cards-view.png`).
- E2E: automated deferred (same board-UI debt as US-005/013/014/015).
