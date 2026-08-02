# Boards & Cards

The kanban core: boards hold ordered lists, lists hold ordered cards, and cards
carry rich metadata. All mutations are Server Actions under
`app/(authenticated)/(dashboard)/boards/**/actions.ts`; query logic lives in
`lib/board.ts`, `lib/list.ts`, `lib/card.ts`.

## Boards

- Created inside a workspace with a title and optional `backgroundColor`.
- Actions: `createBoardAction`, `updateBoardAction`, `deleteBoardAction`.
- Soft-deleted via `archivedAt`; deletion cascades to lists, cards, labels,
  stars, and activity.
- Users can **star** a board (favorite) — `BoardStar`, unique per user+board.
- The boards overview lays board tiles out in a **responsive auto-fill grid**
  that fills the available row width (fluid tiles, min ~13rem per column) rather
  than fixed-width tiles clinging to a narrow left column on wide screens
  (US-038). Presentation only.
- Each board tile shows **information density** — a colored identity header
  (title + star) plus a footer with **list count · card count**, a
  **last-activity** relative timestamp, and a capped **assignee avatar stack**
  (`+N` overflow) — instead of a bare color block (US-037). These are read-only
  aggregates added to the overview payload: card count aggregates across the
  board's lists, last-activity is `max(board, list, card updatedAt)`, and members
  are the distinct assignees across the board's non-archived cards (resolved via
  a bounded `cardMember → card → list` join, not a per-card fetch). No data,
  contract, or auth change.

## Lists

- Ordered columns on a board, ordered by `position Float`, unique per
  `(boardId, position)`.
- Actions: `createListAction`, `updateListAction` (rename), `deleteListAction` (legacy alias for `archiveListAction`), `archiveListAction`, `reorderListAction`, `restoreListAction` (pending in Slice C: `permanentlyDeleteListAction`).
- Lists carry **no** completion flag. Completion is a property of the card, not
  of its column (decision 0020) — a list named "Done" is an ordinary list and may
  hold a mix of complete and incomplete cards.
- **Safe List Lifecycle (US-074, Decision 0026 Accepted):** Slices A & B implemented — archiving (`archiveListAction` / `deleteListAction`) soft-deletes the list (`archivedAt = now()`), hiding it and its cards from active board queries. Slice B adds list discovery & restore. Slice B2 adds archived-list boundary hardening: central resolver guards (`getListWithBoard`, `getCardWithListAndBoard`, `getCardWithListAndMembers`) reject mutations on cards under archived lists; checklist scopes expose `listArchived`; due-date reminders and scheduled automation exclude archived-list cards. Slice C (admin permanent delete) pending.

## Cards

- The work item. Fields: title, `description` (text), `priority`
  (`URGENT|HIGH|MEDIUM|LOW`), `dueDate`, `estimateHours`, `completedAt`,
  cover image, `archivedAt` (soft delete).
- Actions: `createCardAction`, `updateCardDetailsAction` (title/description),
  `updateCardEstimateAction`, `updateCardDueDateAction`,
  `toggleCardCompletionAction` (mark complete / reopen), `archiveCardAction`,
  `restoreCardAction`, `reorderCardAction`, `moveCardAction`.
- **Completion:** `Card.completedAt` is the single source of truth, written only
  by `toggleCardCompletionAction` (a card-owned checkbox — Trello-style, decision
  0020). Completing writes `completedAt`, reopening clears it; each transition
  records a `CARD_COMPLETED` / `CARD_REOPENED` history event and broadcasts a
  dedicated `card:completion-updated` realtime event. **Dragging never changes
  completion.**
- **Estimate rule:** the estimate stays editable through complete/reopen cycles
  (no lock — the event log preserves estimate-at-completion for analytics,
  decision 0020). Workspaces may still require an estimate before a card can be
  marked complete (`requireEstimateBeforeDone`), enforced by the completion
  toggle and surfaced inline.
- **Move semantics:** `moveCardAction` relocates a card across lists + positions
  only. It never touches `completedAt` and emits no completion/reopen history.
- **Archive & restore:** `archiveCardAction` soft-archives (sets `archivedAt`,
  records a `CARD_ARCHIVED` history event, emits `card:archived` to remove it
  live). `restoreCardAction` is the inverse — it clears `archivedAt`, records a
  `CARD_RESTORED` event, and re-emits `card:created` so the card reappears live
  for other viewers. Both reuse `card:["delete"]` (editor/admin; viewer denied).
  Restore resolves the card through an **archived-aware** scope resolver
  (`getArchivedCardWithListAndBoard`, requires `archivedAt: not null`) — the
  default `getCardWithListAndBoard` filters archived cards out. The board header
  exposes an **Archived cards** view (editor/admin only) listing the board's
  archived cards with their original list and a Restore button (US-016).
  Cards-only for now — list and board (closed-boards) restore are deferred
  follow-ups. Permanent delete from the archive view is implemented for
  archived lists (Slice C: `permanentlyDeleteListAction`, admin-only via
  `organization:["update"]`, with exact title confirmation, Cloudinary attachment
  guard (decision 0029), and active-cards force option).

## Card metadata

| Feature | Model | Action(s) | Notes |
| --- | --- | --- | --- |
| Assignees | `CardMember` | `assignCardMemberAction`, `removeCardMemberAction` | Workspace members only; assignment notifies + emails; assign/remove broadcast live via `card:members-updated` so an open card detail sheet on another client updates without reload (US-011). Members render in the detail sheet **and** as a capped avatar stack on the card face (up to 3 + a `+N` overflow), surfaced from the board-view payload (US-030). |
| Labels | `Label` / `CardLabel` | `createLabelAction`, `updateLabelAction`, `deleteLabelAction`, `addCardLabelAction`, `removeCardLabelAction` | Board-scoped, named + colored (palette from `BOARD_COLORS`); attached per card. Label-set CRUD reuses `board:["update"]`, attach/detach reuse `card:["update"]` — no dedicated `label` permission statement (US-005). Managed in the card detail sheet; colored chips render on the card face in the board view; attach/detach broadcast live via the `card:labels-updated` socket event; label rename/recolor/delete fan that same event out per affected card so chips refresh live for other viewers (US-010). |
| Checklists | `Checklist` / `ChecklistItem` | `createChecklistAction`, `deleteChecklistAction`, `createChecklistItemAction`, `toggleChecklistItemAction`, `deleteChecklistItemAction` | Card content; reuse `card:["update"]` (viewer denied) — no dedicated `checklist` permission. Ordered items with `isCompleted`, float-gap positioned. Deleting a checklist cascades to its items. Rendered in the card detail sheet (US-015); the card face shows checklist progress (`done/total`) from the board-view payload (US-030). Rename/reorder and cross-client realtime are deferred follow-ups (slice 1 revalidates rather than emitting). |
| Comments | `Comment` | `createCommentAction` | Notifies + emails; applied live over socket. The card face shows the comment count from the board-view payload (US-030). |
| Attachments | `Attachment` | `uploadAttachmentAction` | Cloudinary-hosted; orphan cleanup on failure |

### Card face (board view)

Beyond labels and the priority chip, the card face renders a metadata row from
the board-view payload (US-030, decision 0011): a **due-date badge** with state
(`overdue` / `today` / `soon` / `upcoming`, and `done` once `completedAt` is set —
a completed card never reads as overdue), **assignee avatars** (capped stack +
`+N` overflow), **checklist progress** (`done/total`), and the **comment count**.
Each is icon + text with an accessible label (never colour-only). The row is
omitted entirely when a card has none of these. Values reflect on the viewer's
next board render/refresh; dedicated live broadcast of these fields is a
follow-up (they behave like priority/cover today). The counts are aggregated
server-side over FK-indexed columns so the board-load query stays bounded. The
priority chip and the metadata badges use design-system colour utilities (not
raw hex) so they stay legible in both light and dark mode (US-036).

## Ordering (Float gap positioning)

Lists, cards, checklists, and checklist items order by `position Float` with a
gap of `16384`. New positions are the midpoint between neighbours; the system
normalizes positions on overflow. The neighbour math is pure and unit-tested in
`lib/dnd/apply-drop.ts` (`translateCardDrop`, `translateListDrop`).

## Drag-and-drop

- Implemented with `@hello-pangea/dnd`; both lists and cards are draggable,
  within and across lists.
- The drag handle is the surface itself, Trello-style (US-069): a **card** drags
  from anywhere on its body (its interactive controls — completion toggle,
  actions menu, label toggle — stop propagation so they still click), and the
  card body doubles as the open affordance (click / focus + Enter opens the
  detail sheet; there is no title button). A **list** drags from its header bar,
  while clicking the title still enters inline rename (the movement threshold
  disambiguates). Both handles carry the keyboard drag entry point (focus +
  Space to lift). There are no separate grip-icon buttons.
- The drop produces an optimistic local update, then a `reorder*`/`moveCard`
  Server Action persists the new position and emits a socket event.
- Remote structural events are **deferred during an active drag** and resynced
  on drop — see `realtime-sync.md`. This is a load-bearing invariant.
- The board does **not** lock during persistence: `ListColumn` / `ListCardItem`
  are memoized and `apply-drop` preserves untouched-list references, so a drop
  re-renders only the affected columns, and dragging stays available while the
  Server Action is in flight (correctness held by the optimistic commit +
  rollback). Pure reorder/move skip `revalidatePath`; see decision 0008 and
  story `US-004`. On very large columns (~90+ cards) the residual cost is DOM
  layout / `@hello-pangea/dnd` measurement, not React re-renders — windowing is
  a tracked follow-up, not done here.

## Filtering & search

- A single board-header **Filter popover** narrows the visible cards, client-side
  and per-viewer (US-065, consolidating the original label filter US-013 and title
  search US-014). It is live with no reload, no server round-trip, and no Server
  Action; it never mutates data nor is shared with other viewers. There is **no
  standalone header search box** — the keyword search lives inside the popover.
- **Keyword search** (top of the popover) filters cards by **title**
  (case-insensitive substring), **debounced ~250ms** so the board is not
  re-filtered on every keystroke (the input updates instantly). While a keyword is
  present the other dimensions are **suspended and hidden** — the keyword alone
  governs card visibility, and the popover collapses to just the search box, a
  short "clear the search to use the filters" hint, and (when nothing matches) a
  "No cards match your search" message, so there is no greyed, non-interactive
  dimension list taking up space. Search is title-only (the board-view card
  carries `title`/`labels` but not `description`).
- **Filter dimensions:**
  - **Members** — cards assigned to any selected member (OR); options are members
    actually assigned on the board, **minus the current viewer** (covered by the
    "Assigned to me" quick option) plus "No members" (unassigned).
  - **Card status** — Complete (`completedAt` set) or Not complete (per US-045).
  - **Due date** — Overdue / next day / next week / next month + "No due date" (OR),
    computed by **calendar day**: a card due **today** is never "Overdue" (Overdue
    = a strictly past day) — it falls into the forward windows, matching the
    card-face badge.
  - **Labels** — cards carrying any selected label (OR); hidden when the board has
    no labels.
  - **Activity** — cards updated in the last 1 / 2 / 4 weeks (card `updatedAt`, OR).
- **Composition:** within a dimension options combine via **OR**; across dimensions
  via **AND** — a card is visible only if it satisfies every active dimension
  (except while a keyword is active, which suspends the dimensions).
- **Empty state:** when a keyword matches no card titles, the popover shows "No
  cards match your search. Try another keyword."
- Non-matching cards are **hidden (CSS), not removed** from the rendered list, so
  `@hello-pangea/dnd`'s index space stays aligned with the store's `cards` array
  and drop positions are never corrupted (see `lib/dnd/apply-drop.ts`).
- A list whose cards are all narrowed out shows a "No cards match" hint instead of
  the empty "No cards yet" placeholder.

## Responsive / mobile (US-021)

The authenticated shell and board view are usable at phone width with no
horizontal page overflow — only the board canvas scrolls sideways, inside its
own region. Lists are **fluid-width on phones** (`~80vw`, capped at the `20rem`
desktop column) so the next list peeks into view and signals horizontal scroll;
at the `sm:` breakpoint and up they return to the fixed `w-80` (320px) desktop
width, so desktop renders unchanged. Page/canvas/header padding and the board
title scale down on small screens. This is a presentation-only concern (pure
Tailwind breakpoints, no JS viewport detection, no data/contract change).
Drag-and-drop is untouched — width is the only thing that changes, so the
`@hello-pangea/dnd` index space and `apply-drop` math (and the long-press touch
sensor) behave exactly as on desktop.

## Activity

Board/list/card changes write to the workspace **Activity** log
(`lib/activity.ts`) with an action + entity type, powering audit and recent-
activity views. Board/card references use `SetNull` so the log survives deletion.

## Validation & access

Every action: `verifySession()` → workspace permission check
(`board`/`list`/`card` statements in `lib/permissions.ts`) → Zod parse
(`lib/schemas/`) → Prisma (transaction for multi-row position writes) → emit.
`viewer` role cannot mutate structure; `editor` can CRUD content but not delete
boards or manage members; `admin` has full control.

## Automation attribution

Several card actions — `createCardAction`, `moveCardAction`,
`toggleCardCompletionAction`, `addCardLabelAction`, `assignCardMemberAction` —
are **automation triggers**: they evaluate workspace rules **inside their own
Prisma transaction** (after their write + history, before commit), so
rule-driven card mutations (move, label, priority, member, completion) are atomic
with the human edit that fired them. A failing rule action rolls back the whole
transaction, including the user's edit. Rule-driven mutations are attributed to
the seeded **"Planora Automation"** system user with `metadata: { ruleId }` on
their history events, so they never inflate a real user's counts. See
`automation.md` and decision 0022.

## Personal Productivity & Capture (Roadmap IN-04)

- **Today / My Work View (US-083 W6, formerly US-077):** A unified personal dashboard (`/today`) aggregating cards assigned to the current user across **every workspace the user is a member of**, grouped into the locked sections **Overdue, Due Today, Due This Week, and Later** (exact calendar-day predicates, viewer-local time; the older "Today/Upcoming/Unscheduled" naming is retired). Workspace scope is derived server-side from the user's memberships — never client-supplied. This is strictly a **read model** over existing `Card`, `CardMember`, `dueDate`, `priority`, and `archivedAt` data; no new domain table is introduced. The US-077 packet's acceptance criteria are retained there and incorporated by exact reference.
- **Global Quick Capture (US-083 W7, formerly US-078):** A low-friction modal accessible via header button or global keyboard shortcut (`C` / `Cmd+K`) from any page. Wraps existing `createCardAction` to create standard `Card` entities on a selected board and list. No separate capture entity. The US-078 packet's acceptance criteria are retained there and incorporated by exact reference.
- **Per-Board Capture & Triage (US-079):** Kanbans designate an inbox list (defaults to left-most column) for receiving quick-captured cards. Includes a triage toolbar for rapid one-click moves, assignments, and due-date settings. Uses standard cards. Escalate to high-risk if schema additions are required.
- **External Intake Deferral (Decision 0028 Accepted):** External email (`support@`) and public web form intake are explicitly deferred and out of scope. Intake is strictly first-party via authenticated workspace sessions.

## Reusable Workflows (Roadmap IN-04)

- **Card Templates (US-081):** Standalone vertical slice allowing workspace members to define templates (pre-configured title, description skeleton, priority, labels, checklist structures) and instantiate new active cards from templates. Data model decision gate (dedicated template tables vs `isTemplate` flag) is recorded inside the packet.
- **Recurring Cards (US-082):** Scheduled template instantiation on recurring intervals (daily, weekly, monthly) using `/api/cron` and atomic deduplication keys (`<scheduleId>:<date>`). Depends on US-081. Scheduler/dedup decision gate is recorded inside the packet.
