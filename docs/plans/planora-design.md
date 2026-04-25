# Planora — Project Design Document

> Kanban-style project management system with realtime collaboration
> Solo graduation project · 4-week timeline

---

## 1. Overview

Planora is a web-based project management application inspired by Trello. Users create workspaces, invite team members with role-based permissions, organize work into boards/lists/cards, and collaborate in realtime.

**Target users:** Small teams (2–10 people) managing projects.

### 1.1 Thesis framing (aligned)

- **Tên đề tài:** *Phát triển nền tảng quản lý dự án trực tuyến hỗ trợ cộng tác thời gian thực theo mô hình Kanban*
- **Mục tiêu đề tài cần bám sát trong thiết kế này:**
  1. Xây dựng hệ thống theo cấu trúc **Workspace → Board → List → Card**
  2. Triển khai **WebSocket** cho cộng tác thời gian thực
  3. Thiết lập **RBAC** + thông báo đa kênh (**In-app + Email**)
  4. Trực quan tiến độ bằng **Burndown Chart** và **Lead Time**
- **Nguyên tắc ưu tiên:** các hạng mục trên là **core bắt buộc**, không để ở stretch.

**Key differentiators from a basic Trello clone:**
- Workspace-level role-based access control (Admin / Editor / Viewer)
- Realtime board synchronization via WebSocket
- Multi-channel notifications (In-app + Email)
- Progress analytics (Burndown + Lead Time)
- Activity logging and audit trail

---

## 2. Tech Stack

| Layer            | Technology                                    |
| ---------------- | --------------------------------------------- |
| Framework        | Next.js 15 (App Router, Server Actions)       |
| Runtime          | Custom Node.js server (for Socket.io support) |
| Database         | PostgreSQL (Docker on home server)             |
| ORM              | Prisma                                        |
| Auth             | Better Auth + Organization plugin             |
| Realtime         | Socket.io                                     |
| Client state     | Zustand                                       |
| Styling          | Tailwind CSS + Shadcn/UI                      |
| Charts           | Recharts                                      |
| File uploads     | Cloudinary                                    |
| Email            | Resend                                        |
| Deployment       | Docker + Cloudflare Tunnel (home server)       |
| CI/CD            | GitHub Actions                                |

### Why this stack
- **Next.js fullstack** — no separate backend needed, simpler for solo dev
- **Custom server** — required for Socket.io since Vercel doesn't support persistent WebSocket
- **Better Auth** — self-hosted, free, includes organization/membership/roles out of the box
- **PostgreSQL in Docker** — runs on your home server alongside the app, zero latency, no free tier limits
- **Shadcn/UI** — copy-paste components, full control over code, professional look

---

## 3. Architecture

```
┌─────────────────────────────────────────────────┐
│                   Client (Browser)               │
│  Next.js App Router + Zustand + Socket.io Client │
└──────────────┬──────────────────┬────────────────┘
               │ HTTP             │ WebSocket
               ▼                  ▼
┌──────────────────────────────────────────────────┐
│           Custom Node.js Server                   │
│  ┌────────────────────┐  ┌─────────────────────┐ │
│  │  Next.js Handler   │  │  Socket.io Server   │ │
│  │  (Server Actions   │  │  (board sync,       │ │
│  │   + API Routes)    │  │   notifications)    │ │
│  └────────┬───────────┘  └────────┬────────────┘ │
│           │                       │               │
│           ▼                       ▼               │
│  ┌────────────────────────────────────────────┐  │
│  │          Prisma ORM                         │  │
│  └────────────────┬───────────────────────────┘  │
└───────────────────┼──────────────────────────────┘
                    ▼
          ┌──────────────────┐
          │  PostgreSQL      │
          │  (Docker)        │
          └──────────────────┘
```

### Data flow principle
All mutations go through **Server Actions → Prisma → DB** first. Socket.io only **broadcasts** after a successful DB write. Sockets are never a source of truth.

```
Client action (drag card)
  → Server Action (update card position in DB)
  → On success: emit Socket.io event to room
  → Other clients receive event → refetch or optimistic update
```

---

## 4. Database Schema

The schema is split into two groups:
- **Better Auth–managed** (7 tables) — created and owned by Better Auth. Extended via `additionalFields` config, not by editing the table directly.
- **App-managed** (11 tables) — our Kanban domain tables, fully owned by Prisma migrations.

### 4.1 Better Auth–managed tables

> **Workflow:** Do NOT write these tables manually. Install and configure Better Auth
> first, then run `npx @better-auth/cli generate` to generate the Prisma models.
> The generated schema is the source of truth for BA tables. Only add app-managed
> tables (section 4.2) on top of what BA generates.
>
> The `modelName` config (workspace, workspaceMember) controls both the Prisma model
> name and the DB table name. Do NOT add `@@map` directives — BA handles naming.

These tables are created by Better Auth's core + organization plugin. The Prisma schema must match BA's expected fields exactly. Custom columns (marked with `// app field`) are added via `additionalFields` in the BA config. The field definitions below are **reference only** — always defer to BA CLI output.

```
user (BA core)
├── id            String @id
├── name          String
├── email         String @unique
├── emailVerified Boolean @default(false)
├── image         String?
├── createdAt     DateTime
└── updatedAt     DateTime

session (BA core + org plugin)
├── id                   String @id
├── expiresAt             DateTime
├── token                String @unique
├── createdAt            DateTime
├── updatedAt            DateTime
├── ipAddress            String?
├── userAgent            String?
├── userId               → user (cascade delete)
└── activeOrganizationId String?        // injected by org plugin

account (BA core)
├── id                    String @id
├── accountId             String         // OAuth ID or userId for credentials
├── providerId            String         // "google", "github", "credential"
├── userId                → user (cascade delete)
├── accessToken           String?
├── refreshToken          String?
├── idToken               String?
├── accessTokenExpiresAt  DateTime?
├── refreshTokenExpiresAt DateTime?
├── scope                 String?
├── password              String?        // bcrypt hash (credential provider)
├── createdAt             DateTime
└── updatedAt             DateTime

verification (BA core)
├── id         String @id
├── identifier String          // email address
├── value      String          // token/code
├── expiresAt  DateTime
├── createdAt  DateTime
└── updatedAt  DateTime

organization (BA org plugin — renamed to "workspace" via modelName)
├── id        String @id
├── name      String
├── slug      String @unique
├── logo      String?
├── createdAt DateTime
└── metadata  String?          // JSON string, parsed at app layer

member (BA org plugin — renamed to "workspaceMember" via modelName)
├── id             String @id
├── organizationId → organization (cascade delete)
├── userId         → user (cascade delete)
├── role           String @default("member")   // plain string, NOT enum
└── createdAt      DateTime

invitation (BA org plugin)
├── id             String @id
├── organizationId → organization (cascade delete)
├── email          String
├── role           String?                     // plain string
├── status         String @default("pending")  // "pending" | "accepted" | "rejected" | "canceled"
├── expiresAt      DateTime
├── inviterId      → user
└── createdAt      DateTime
```

**Better Auth config for table renaming + custom roles:**
```ts
organization({
  schema: {
    organization: { modelName: "workspace" },
    member: { modelName: "workspaceMember" },
  },
  roles: {
    admin:  createRole({ /* full access */ }),
    editor: createRole({ /* create/edit cards, lists, comments */ }),
    viewer: createRole({ /* read-only, can comment */ }),
  },
  creatorRole: "admin",
})
```

### 4.2 App-managed tables

```
Board
├── id (uuid)
├── workspaceId → workspace (cascade delete)
├── title
├── backgroundColor
├── createdById → user
├── archivedAt (nullable — soft delete)
├── createdAt
└── updatedAt

BoardStar
├── id
├── boardId → Board (cascade delete)
├── userId → user (cascade delete)
├── createdAt
└── @@unique(boardId, userId)

List
├── id (uuid)
├── boardId → Board (cascade delete)
├── title
├── position (double precision — for ordering)
├── createdAt
└── updatedAt

Card
├── id (uuid)
├── listId → List (cascade delete)
├── title
├── description (text, markdown)
├── position (double precision — for ordering)
├── priority: URGENT | HIGH | MEDIUM | LOW | null (enum)
├── dueDate (nullable)
├── coverImage (nullable)
├── archivedAt (nullable — soft delete)
├── createdById → user
├── createdAt
└── updatedAt

CardMember (many-to-many: Card ↔ user)
├── cardId → Card (cascade delete)
├── userId → user (cascade delete)
├── assignedAt
└── @@unique(cardId, userId)

Label
├── id
├── boardId → Board (cascade delete)
├── name
├── color
└── createdAt

CardLabel (many-to-many: Card ↔ Label)
├── cardId → Card (cascade delete)
├── labelId → Label (cascade delete)
└── @@unique(cardId, labelId)

Checklist
├── id
├── cardId → Card (cascade delete)
├── title
├── position (double precision)
└── createdAt

ChecklistItem
├── id
├── checklistId → Checklist (cascade delete)
├── title
├── isCompleted (boolean, default false)
├── position (double precision)
└── createdAt

Comment
├── id
├── cardId → Card (cascade delete)
├── userId → user
├── content (text)
├── createdAt
└── updatedAt

Attachment
├── id
├── cardId → Card (cascade delete)
├── userId → user
├── fileName
├── fileUrl (Cloudinary URL)
├── fileType
├── fileSize (Int, bytes)
└── createdAt

Activity
├── id
├── workspaceId → workspace
├── boardId → Board (nullable)
├── cardId → Card (nullable)
├── userId → user
├── action (enum: CREATED, UPDATED, MOVED, ARCHIVED, COMMENTED, etc.)
├── entityType (enum: BOARD, LIST, CARD, COMMENT, etc.)
├── metadata (Json — Prisma Json type, stores old/new values)
└── createdAt

Notification
├── id
├── userId → user (recipient, cascade delete)
├── type (enum: ASSIGNED, MENTIONED, DUE_DATE, COMMENT, INVITE)
├── title
├── message
├── linkUrl
├── isRead (boolean, default false)
├── createdAt
└── readAt (nullable)
```

### 4.3 Cascade delete rules

> **Note:** Activity uses `SET NULL` (not cascade) on `boardId` and `cardId` to avoid
> PostgreSQL "multiple cascade paths" errors. The cascade path to Activity is
> only through `workspaceId`. This means when a board or card is deleted,
> related Activity rows survive with a null reference — which is correct
> behavior for an audit log.

| When deleted...     | Cascades to                                                  |
| ------------------- | ------------------------------------------------------------ |
| user                | session, account, workspaceMember, BoardStar, CardMember     |
| workspace           | workspaceMember, invitation, Board, Activity                 |
| Board               | List, BoardStar, Label. Activity.boardId → SET NULL          |
| List                | Card                                                         |
| Card                | CardMember, CardLabel, Checklist, Comment, Attachment. Activity.cardId → SET NULL |
| Checklist           | ChecklistItem                                                |
| Label               | CardLabel                                                    |

### 4.4 Ordering strategy (float with gap — Planka pattern)

Lists, cards, checklists, and checklist items use **double precision float** position values with a large gap:

```
Constants:
  GAP          = 16384    (2^14 — initial spacing between items)
  MIN_GAP      = 0.001    (minimum allowed gap before full renormalization)

Initial items:  16384, 32768, 49152, 65536, ...
Insert between 16384 and 32768 → (16384 + 32768) / 2 = 24576

Edge cases:
  - Prepend (before first): firstItem.position - GAP
  - Append (after last): lastItem.position + GAP
  - Gap < MIN_GAP: full renormalize all siblings → GAP * (index + 1)
```

With GAP=16384 and MIN_GAP=0.001, you get well over 100,000 inserts between the same two items before renormalization. More than enough for any Kanban board.

**Why full renormalization instead of cascade-shift:**
Cascade-shifting individual neighbors is complex (how far to shift? what if shifting causes new collisions?) and hard to make concurrent-safe. Full renormalization — re-spacing ALL siblings in one transaction to `GAP * (index + 1)` — is simpler, atomic, and guarantees clean spacing. The cost is one extra query, but it only triggers after extreme repeated reordering.

**Position update flow:**
1. Client drag-ends → sends `{ cardId, targetListId?, prevCardId?, nextCardId? }`
   - Send **neighbor IDs**, not positions. The server looks up current positions from DB, avoiding stale-position race conditions with concurrent users.
2. Server fetches neighbor positions from DB, computes midpoint: `(prev + next) / 2`
3. If computed gap < MIN_GAP → full renormalize all siblings in that list/board → retry with fresh positions
4. Save to DB → (when Socket.io is implemented) emit event → return result
5. Retry up to 3 times on unique constraint violations (renormalize between retries)

**Renormalization function (must exist for both lists AND cards):**
```
normalizePositions(parentId):
  1. Fetch all siblings ordered by [position ASC, createdAt ASC]
  2. In a single transaction, update each to position = GAP * (index + 1)
```

**Unique constraints:**
Both `List(boardId, position)` and `Card(listId, position)` should have unique constraints to prevent two items sharing the same position. The retry logic handles constraint violations by renormalizing and retrying.

### 4.5 Key indexes

- `Card(listId, position)` — card ordering queries
- `List(boardId, position)` — list ordering queries
- `Activity(boardId, createdAt)` — activity feed
- `Activity(workspaceId, createdAt)` — workspace activity
- `Notification(userId, isRead, createdAt)` — notification dropdown
- `Card(listId, archivedAt)` — filter archived cards
- `member(organizationId)` — BA org plugin index
- `member(userId)` — BA org plugin index
- `invitation(organizationId)` — BA org plugin index
- `invitation(email)` — BA org plugin index

---

## 5. Features — Core (Must Ship)

### 5.0 Hard MVP boundary

The **hard MVP** is the minimum scope that must be completed for the graduation demo and report:
- Authentication: register, login, logout, protected routes
- Workspace flow: create workspace, invite member, accept invitation, role-based access
- Board/list/card CRUD with drag & drop ordering
- Comments on cards
- Basic file attachments on cards
- Realtime sync for card moves and comments
- Activity log for key board/card actions
- Notification system: In-app + Email (at least invite + key status changes)
- Dashboard analytics: Burndown chart + Lead Time
- Graduation artifacts: Use Case, ERD, Sequence Diagram, WebSocket deployment guide
- Deployment on home server with seeded demo data

**Anything outside this list is not required for project success.**
If the hard MVP is not stable by the end of **Week 3**, all remaining time must go to bug fixing, deployment, seed data, and demo rehearsal — **no stretch features are allowed**.

### 5.1 Authentication (Better Auth)
- Register with email + password
- Login / Logout
- JWT session management
- Password reset flow
- Protected routes via Next.js middleware

### 5.2 Workspace Management
- Create workspace (creator gets `admin` role via BA `creatorRole` config)
- Edit workspace name
- Delete workspace (admin only)
- Invite members via email link (BA invitation flow)
- Accept / decline invitation
- Remove members (admin only)
- Roles stored as plain strings in BA's `member.role` column:
  - `admin` — full workspace control
  - `editor` — create/edit content
  - `viewer` — read-only + comment
- Role-based permissions:

| Action                          | admin | editor | viewer |
| ------------------------------- | ----- | ------ | ------ |
| Manage workspace settings       | ✅     | ❌      | ❌      |
| Manage members (invite/remove)  | ✅     | ❌      | ❌      |
| Create / delete boards          | ✅     | ❌      | ❌      |
| Edit boards                     | ✅     | ✅      | ❌      |
| Create / edit / move cards      | ✅     | ✅      | ❌      |
| Comment on cards                | ✅     | ✅      | ✅      |
| View boards and cards           | ✅     | ✅      | ✅      |

### 5.3 Boards
- Create / edit / archive boards
- Board list page (grid layout with color preview)
- Background color selection

### 5.4 Lists
- Create / edit / delete lists within a board
- Drag to reorder lists
- Position-based ordering (float)

### 5.5 Cards
- Create / edit / archive cards
- Drag & drop within and between lists (using @dnd-kit)
- Position-based ordering (float)

#### 5.5.1 Card drag-and-drop — client-side architecture (@dnd-kit)

**Context:** @dnd-kit uses nested `SortableContext`s — an outer horizontal context for lists,
and an inner vertical context per list for cards. This multi-container setup requires careful
collision detection and state management to work reliably.

**Reference:** Based on the [official dnd-kit MultipleContainers example](https://github.com/clauderic/dnd-kit/blob/master/stories/2%20-%20Presets/Sortable/MultipleContainers.tsx).

**Collision detection strategy (card-aware):**
When the active dragged item is a **card**, apply the official multi-container pattern:
1. **Phase 1 — `pointerWithin`:** Run on ALL droppable containers (both `card:*` and `list:*`
   sortables). This gives precision — only matches when the pointer is physically inside a
   droppable rect.
2. **Phase 2 — `rectIntersection` fallback:** If `pointerWithin` returns no matches (pointer
   is in a gap), use `rectIntersection` to find intersecting containers.
3. **`getFirstCollision`** to extract the best match from the collision array.
4. **Container drill-down:** If the match is a `list:*` ID (a list container, not a card):
   - If the list has cards → run `closestCenter` filtered to only that list's card sortables
     to find the specific card target.
   - If the list is empty → use the list ID as-is (means "drop at end of this list").
5. **`lastOverId` caching:** Cache the last valid match in a ref. When no collision is found
   and `recentlyMovedToNewContainer` is true, return `activeId` to prevent stale matches.
   Otherwise fall back to the cached `lastOverId`.

When the active item is a **list**, keep the existing strategy (filter to list-only
containers, `pointerWithin` → `closestCorners`).

**No separate `useDroppable` needed:** Each list's `useSortable` (in the outer
`SortableContext`) already provides a droppable rect covering the entire column. The
collision detection's container drill-down handles both empty and non-empty lists. This
matches the official dnd-kit pattern where containers are sortable (not separately droppable).

**Preventing oscillation during `handleDragOver`:**
Use the official `recentlyMovedToNewContainer` pattern (from the dnd-kit MultipleContainers
example, also addresses known issues #552 and #1678):
- **`recentlyMovedToNewContainer` ref (boolean):** Set to `true` after any cross-list
  card move in `handleDragOver`.
- **Reset via `useEffect` + `requestAnimationFrame`:** After `boardLists` state updates,
  reset the flag in a `requestAnimationFrame` callback. This ensures the reset happens
  AFTER React has processed the state update AND the browser has recalculated layout.
- **Integration with collision detection:** When `recentlyMovedToNewContainer` is true
  and no collision is found, the collision strategy returns `activeId` instead of a stale
  match, preventing the bounce-back loop.

**DragOverlay:**
Always use `DragOverlay` for the visual preview of the dragged card. The original card
in the list should show reduced opacity (`0.5`) as a placeholder. This separation
prevents the dragged card's DOM element from interfering with collision detection.

**`handleDragEnd` — persist to server:**
- Compare source list ID vs target list ID (not array indices) to determine if the card
  moved across lists.
- Extract `prevCardId` / `nextCardId` from the card's neighbors in the optimistic state.
- Call `reorderCardAction` (same list) or `moveCardAction` (cross-list).
- On server error, restore the snapshot taken at `handleDragStart`.

### 5.6 Card Detail (Modal)
- Title (inline edit)
- Description (Markdown — plain textarea with preview, or simple editor)
- Labels (select from board labels, create new)
- Due date + priority level
- Assign members (from workspace members)
- Checklist with progress bar
- Comments (create / edit / delete own)
- Activity log (read-only timeline)

### 5.7 Realtime Board Sync (Socket.io)
- When user A drags a card → user B sees the card move
- When user A adds a comment → user B sees it appear
- Room-based: each board is a Socket.io room
- Implementation:
  1. Server Action mutates DB
  2. On success, server emits event to board room
  3. Clients in room receive event and update UI (refetch or Zustand update)

### 5.8 Activity Log
- Append-only Activity table
- Logged actions: card created, moved, edited, archived, commented, member assigned
- Displayed in card detail modal and board sidebar
- Stored as structured data (action enum + JSON metadata)

### 5.9 Notification System (Core)
- In-app notification center (badge + dropdown/list)
- Email notifications via Resend for:
  - Workspace invitation
  - Card status/assignee changes (minimum event set for demo)
- Notification records persisted in DB (`Notification` table)

### 5.10 File Attachments (Core)
- Upload attachment to Cloudinary from card detail
- Show attachment list and download URL
- Basic file metadata tracking (name/type/size/uploader/time)

### 5.11 Analytics Dashboard (Core)
- **Burndown Chart:** remaining open work by day/sprint window
- **Lead Time:** average/median time from card creation to done state
- Supporting counters: total boards, total cards, overdue cards

### 5.12 Required Graduation Documentation (Core)
- Use Case Diagram
- ERD
- Sequence Diagram (e.g., card move + realtime broadcast)
- WebSocket deployment guide (topology, auth middleware, reconnect strategy)

---

## 6. Features — Stretch (Add If Time Allows)

These features are only allowed after the hard MVP is complete, deployed, and stable in a full end-to-end demo run.
Priority order (highest impact for least effort first):

### 6.1 Dark Mode
- Shadcn/UI built-in theme switching
- ~1-2 hours of work
- High visual impact for demo

### 6.2 Advanced Analytics (optional)
- Additional charts (cards by member, throughput by week)
- Filtered analytics by workspace/member/time range

### 6.3 Advanced Notifications (optional)
- Notification preferences per user (event/channel opt-in)
- Scheduled digest emails

### 6.4 Board Favorites (Star/Unstar)
- Star icon on board card
- Starred boards section on workspace page

### 6.5 Table View
- Alternative card view: spreadsheet-style table
- Columns: title, status (list), priority, due date, assignees, labels
- Sortable and filterable

### 6.6 Card Extras
- Copy / duplicate card
- Filter cards by label, member, due date, priority
- Search cards by title

---

## 7. Pages & Routes

```
/                           → Landing page (public)
/login                      → Login
/register                   → Register
/forgot-password            → Password reset

/workspace                  → Workspace list (select or create)
/workspace/[slug]           → Workspace home (board list)
/workspace/[slug]/settings  → Workspace settings (Admin)
/workspace/[slug]/members   → Member management (Admin)
/workspace/[slug]/board/[id]         → Board view (Kanban)
/workspace/[slug]/board/[id]/table   → Board view (Table — stretch)
/workspace/[slug]/dashboard          → Analytics (Burndown + Lead Time)

/invite/[token]             → Accept invitation page
/notifications              → All notifications
```

---

## 8. Realtime Architecture

### Socket.io Rooms
```
workspace:{workspaceId}     → workspace-wide events (member joined, board created)
board:{boardId}             → board-specific events (card moved, list reordered)
user:{userId}               → personal events (notifications)
```

### Events
```
Client → Server:
  join-board(boardId)       → join board room
  leave-board(boardId)      → leave board room

Server → Client:
  card:moved                → { cardId, fromListId, toListId, position }
  card:created              → { card }
  card:updated              → { cardId, changes }
  card:archived             → { cardId }
  list:created              → { list }
  list:reordered            → { listId, position }
  comment:created           → { comment }
  notification:new          → { notification }
```

### Auth for Socket.io
- Client sends JWT token on connection
- Server verifies token in Socket.io middleware
- Attach userId to socket, use it for room authorization

---

## 9. Deployment

```
Home Server
├── Docker Compose
│   ├── planora (Next.js + Socket.io custom server)
│   ├── postgres (PostgreSQL)
│   └── cloudflared (Cloudflare Tunnel)
├── External services
│   ├── Cloudinary (attachments/images — core)
│   └── Resend (email notifications — core)
└── GitHub Actions
    └── Push to main → SSH deploy → docker compose pull → restart
```

### Cloudflare Tunnel
- `cloudflared` container runs alongside the app in Docker Compose
- Tunnel points to Next.js container (port 3000)
- WebSocket (Socket.io) works through the tunnel natively
- SSL handled by Cloudflare — no certbot needed
- No ports exposed on home server

### Database deployment
- PostgreSQL runs as an existing Docker container on the home server
- The Planora app connects to it over the Docker network or the server's internal network
- Regular backups should be scheduled because the database is self-hosted

---

## 10. Timeline

The timeline is organized around **weekly milestones**. Each week should end with a working build that can be shown and tested, not just partially finished features.

### Week 1: Foundation + deployment smoke test
- [ ] Initialize Next.js 15 project + Tailwind + Shadcn/UI
- [ ] Set up Prisma + PostgreSQL (Docker on home server) + schema
- [ ] Set up custom Node.js server + Socket.io
- [ ] Integrate Better Auth (register, login, logout, sessions)
- [ ] Set up Better Auth Organization plugin (workspace, members, roles)
- [ ] Build base layout: sidebar, header, workspace selector
- [ ] Protected route middleware
- [ ] Run first home-server deployment smoke test

**Week 1 exit criteria:** a user can register/login, access protected routes, create/select a workspace, and the app can run successfully on the home server.

### Week 2: Core board workflow
- [ ] Board CRUD + archive + background color
- [ ] Board list page (grid layout)
- [ ] List CRUD + position ordering
- [ ] Card CRUD + position ordering
- [ ] Drag & drop for lists and cards (@dnd-kit)
- [ ] Workspace member invitation flow (invite, accept, decline)

**Week 2 exit criteria:** one workspace can contain boards, lists, and cards, and the board is fully usable for normal task management without realtime features yet.

### Week 3: Demo-critical collaboration flow
- [ ] Comments (CRUD)
- [ ] Activity log (append-only, display timeline)
- [ ] Socket.io board sync (card move, card create, comment)
- [ ] Permission enforcement (Editor can't delete boards, Viewer can only comment)
- [ ] Card detail modal (title, description)
- [ ] Assign members to cards
- [ ] In-app notifications (badge, list, mark-as-read)
- [ ] Email notifications via Resend (invite + key card status events)
- [ ] File attachments (upload + list + download)
- [ ] Seed data for demo (2 users, workspace, populated board)
- [ ] Test the full demo scenario end-to-end
- [ ] Only if time remains: labels, due date, priority, checklist

**Week 3 exit criteria:** the full committee demo flow works end-to-end with two accounts, realtime sync, comments, activity log, notifications (in-app + email baseline), attachments, and role restrictions.

### Week 4: Stabilization, documentation, and final deploy
- [ ] UI polish, loading states, error handling
- [ ] Implement analytics dashboard: Burndown + Lead Time
- [ ] Finalize Docker + Cloudflare Tunnel deployment
- [ ] Set up GitHub Actions CI/CD pipeline
- [ ] Rehearse demo scenario multiple times
- [ ] Prepare backup screenshots / screen recording for demo safety
- [ ] Finalize graduation artifacts: Use Case, ERD, Sequence Diagram, WebSocket deployment guide
- [ ] Write graduation report deployment chapter
- [ ] Fix bugs only — no new non-essential features
- [ ] Only if MVP is fully stable: add Dark mode
- [ ] Only if MVP is fully stable: add advanced analytics charts

**Week 4 exit criteria:** the deployed app is stable, the demo has been rehearsed, Burndown + Lead Time are working, backups are ready, and documentation artifacts are complete.

---

## 11. Demo Scenario

Prepare this exact flow for the committee presentation:

1. **Account A** (Admin) creates workspace "Nhóm Đồ Án"
2. **Account A** invites **Account B** (as Editor)
3. **Account B** opens invitation link, accepts
4. **Split screen**: both accounts viewing the same board
5. **Account A** drags a card from "Đang làm" to "Hoàn thành" → **Account B** sees it move in realtime
6. **Account B** adds a comment on a card → **Account A** sees it appear
7. Trigger a card status/assignment change → show **in-app notification** and **email notification**
8. Show activity log — all actions recorded
9. Change **Account B** role to Viewer → demonstrate they can no longer edit, only comment
10. Open dashboard and show **Burndown** + **Lead Time**
11. Show the database schema (ERD) and explain architectural decisions

**Pre-seed the demo board** with realistic data (8-10 cards across 3-4 lists with labels, due dates, members assigned) so the demo looks like a real project, not an empty app.

---

## 12. Risk Mitigation

| Risk                                          | Mitigation                                                            |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Better Auth org plugin doesn't map to my roles | Test role mapping in week 1. Fallback: implement roles manually       |
| Drag & drop ordering bugs                     | Use float positions + full renormalization (see §4.4). Card-aware collision detection with `pointerWithin` + `closestCenter` (see §5.5.1). Anti-oscillation guard in `handleDragOver`. `useDroppable` on each list's card area for empty-list drops. |
| Socket.io + custom server deployment issues   | Set up Docker + deploy in week 1, not week 4                          |
| Email delivery issues (Resend quota/DNS)      | Prepare fallback: in-app only for demo + capture SMTP logs/screenshots |
| Burndown/Lead Time data quality mismatch       | Freeze metric definitions early; validate with seeded scenarios         |
| Scope creep in week 3                         | If core flow isn't stable by end of week 3, STOP adding features      |
| Self-hosted PostgreSQL failure or data loss   | Set up automated backups and test restore before the final demo        |
| Demo failure                                  | Pre-seed data, rehearse demo 3+ times, have backup screenshots/video  |

---

## 13. Objective → Deliverable Mapping (for thesis alignment)

| Objective | Concrete deliverable in Planora |
|---|---|
| Workspace → Board → List → Card management | CRUD + hierarchy pages and schema relations |
| Realtime collaboration | Socket.io rooms/events for board collaboration |
| RBAC + multi-channel notifications | Admin/Editor/Viewer permissions + In-app + Email notifications |
| Progress visualization | Dashboard with Burndown and Lead Time |
| Required final report outputs | Use Case, ERD, Sequence Diagram, WebSocket deployment guide |
