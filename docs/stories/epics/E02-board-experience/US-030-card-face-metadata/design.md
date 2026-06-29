# Design — US-030 Card-face metadata row

## Domain Model

No new entities. Reuses existing relations on `Card`:

- `dueDate` / `completedAt` — columns on `card` (`completedAt` decides the `done`
  state; the existing `@@index([dueDate, completedAt])` already covers date use).
- `members` — `CardMember` (composite PK `@@id([cardId, userId])`, so `cardId`
  is already indexed). Capped to `MAX_CARD_FACE_AVATARS = 3` for the avatar stack;
  `_count.members` gives the total for the `+N` overflow.
- `checklists` → `checklistItem.isCompleted` — aggregated to `done`/`total`.
- `comments` — `_count.comments`.

## Application Flow

Read-only enrichment of one query. `getListsByBoardId` (`lib/list.ts`) selects
the new fields, takes the first 3 members (ordered by `assignedAt`), projects
checklist item booleans, and `_count`s members + comments. The map step folds the
checklist items into `checklistDone`/`checklistTotal` so the returned
`ListCardRecord` carries only scalars + the capped avatar list — **the wire
payload never includes raw checklist items.** No command/handler change; no new
Server Action.

## Interface Contract

`ListCardRecord` (and the mirrored inline card types in `page.tsx`,
`board-content.tsx`, `board-store.ts`, `list-column.tsx`) gain:
`dueDate: Date | null`, `completedAt: Date | null`,
`members: { id; name; image }[]`, `memberCount: number`,
`checklistDone: number`, `checklistTotal: number`, `commentCount: number`.

`applyRemoteCardCreated` fills empty defaults (a freshly created card has no
members/checklists/comments/due date). No socket payload shape changes.

## Data Model

Migration `20260629023148_add_card_face_metadata_indexes` — **additive,
index-only**:

```sql
CREATE INDEX "checklist_cardId_idx" ON "checklist"("cardId");
CREATE INDEX "checklistItem_checklistId_idx" ON "checklistItem"("checklistId");
CREATE INDEX "comment_cardId_idx" ON "comment"("cardId");
```

No column/data change, no retention concern. Rationale + alternatives in
decision 0011.

## UI / Platform Impact

`list-card-item.tsx` renders the metadata row: a left cluster
(priority chip, due badge, checklist, comments — `flex-wrap`) and a right-aligned
`AvatarGroup` (shadcn, from US-034). Accessibility: every item is icon + text
(never colour-only); the due badge and the `+N` chip carry `aria-label`s; avatars
use `alt`/initials fallback. Must hold on the responsive board (US-021) at
desktop and ≤375px — the row wraps and the avatar stack stays `shrink-0`.

Colours use the `destructive` token + Tailwind `amber`/`emerald` palette
utilities already used elsewhere in the app (the priority chip's raw hex stays as
US-036's tokenization job — out of scope here).

## Observability

None. No new logs/metrics; the existing card-history/activity capture is unchanged.

## Alternatives Considered

See decision 0011: (1) core-only without migration [human chose full],
(2) unindexed aggregates [perf-rejected], (3) ship raw items to client
[payload-rejected], (4) denormalized counter column [over-engineered].
