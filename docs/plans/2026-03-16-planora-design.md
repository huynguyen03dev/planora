# Planora — Project Design Document

> Kanban-style project management system with realtime collaboration
> Solo graduation project · 4-week timeline

---

## 1. Overview

Planora is a web-based project management application inspired by Trello. Users create workspaces, invite team members with role-based permissions, organize work into boards/lists/cards, and collaborate in realtime.

**Target users:** Small teams (2–10 people) managing projects.

**Key differentiators from a basic Trello clone:**
- Workspace-level role-based access control (Admin / Editor / Viewer)
- Realtime board synchronization via WebSocket
- Activity logging and audit trail
- Analytics dashboard

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

These tables are created by Better Auth's core + organization plugin. The Prisma schema must match BA's expected fields exactly. Custom columns (marked with `// app field`) are added via `additionalFields` in the BA config.

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
├── position (double precision — for ordering within workspace)
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

| When deleted...     | Cascades to                                                  |
| ------------------- | ------------------------------------------------------------ |
| user                | session, account, workspaceMember, BoardStar, CardMember     |
| workspace           | workspaceMember, invitation, Board, Activity, Notification   |
| Board               | List, BoardStar, Label, Activity (where boardId = id)        |
| List                | Card                                                         |
| Card                | CardMember, CardLabel, Checklist, Comment, Attachment         |
| Checklist           | ChecklistItem                                                |
| Label               | CardLabel                                                    |

### 4.4 Ordering strategy (float with gap — Planka pattern)

Lists, cards, checklists, and checklist items use **double precision float** position values with a large gap:

```
Constants:
  GAP         = 16384    (2^14 — initial spacing between items)
  MIN_GAP     = 0.125    (minimum allowed gap before cascade shift)
  MAX_POSITION = 2^50    (upper bound before full renormalization)

Initial items:  16384, 32768, 49152, 65536, ...
Insert between 16384 and 32768 → (16384 + 32768) / 2 = 24576

Edge cases:
  - Prepend (before first): firstItem.position - GAP
  - Append (after last): lastItem.position + GAP
  - Gap < MIN_GAP: cascade-shift neighbors outward
  - Position > MAX_POSITION: full renormalize → GAP * (index + 1)
```

With GAP=16384 and MIN_GAP=0.125, you get **131,072 inserts** between the same two items before a cascade shift is needed. More than enough for any Kanban board.

**Position update flow:**
1. Client drag-ends → sends `{ cardId, newListId?, prevCardPosition?, nextCardPosition? }`
2. Server computes midpoint: `(prev + next) / 2`
3. If gap < MIN_GAP → shift neighbors, broadcast shifted positions via Socket.io
4. If position > MAX_POSITION → full renormalize all siblings
5. Save to DB → emit Socket.io event → return updated card

### 4.5 Key indexes

- `Card(listId, position)` — card ordering queries
- `List(boardId, position)` — list ordering queries
- `Board(workspaceId, position)` — board ordering in sidebar
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
- Realtime sync for card moves and comments
- Activity log for key board/card actions
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
- Drag & drop within and between lists (using @dnd-kit or react-beautiful-dnd successor)
- Position-based ordering (float)

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

---

## 6. Features — Stretch (Add If Time Allows)

These features are only allowed after the hard MVP is complete, deployed, and stable in a full end-to-end demo run.
Priority order (highest impact for least effort first):

### 6.1 Dark Mode
- Shadcn/UI built-in theme switching
- ~1-2 hours of work
- High visual impact for demo

### 6.2 Dashboard Analytics (simplified)
- 1-2 charts max: cards by status (pie), cards by member (bar)
- Total counts: boards, cards, members
- Overdue cards count
- Recent activity feed
- Using Recharts

### 6.3 In-App Notifications
- Bell icon in header with unread count badge
- Dropdown with notification list
- Mark as read
- Triggered by: assigned to card, new comment on your card
- Delivered via Socket.io

### 6.4 File Attachments
- Upload to Cloudinary from card detail
- Display file list with download link
- Image preview for image files

### 6.5 Board Favorites (Star/Unstar)
- Star icon on board card
- Starred boards section on workspace page

### 6.6 Table View
- Alternative card view: spreadsheet-style table
- Columns: title, status (list), priority, due date, assignees, labels
- Sortable and filterable

### 6.7 Card Extras
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
/workspace/[slug]/dashboard          → Analytics (stretch)

/invite/[token]             → Accept invitation page
/notifications              → All notifications (stretch)
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
│   ├── Cloudinary (images — stretch)
│   └── Resend (email — stretch)
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

### Week 1: Foundation
- [ ] Initialize Next.js 15 project + Tailwind + Shadcn/UI
- [ ] Set up Prisma + PostgreSQL (Docker on home server) + schema
- [ ] Set up custom Node.js server + Socket.io
- [ ] Integrate Better Auth (register, login, logout, sessions)
- [ ] Set up Better Auth Organization plugin (workspace, members, roles)
- [ ] Build layout: sidebar, header, workspace selector
- [ ] Protected route middleware

### Week 2: Board & Card CRUD + Drag & Drop
- [ ] Board CRUD + archive + background color
- [ ] Board list page (grid layout)
- [ ] List CRUD + position ordering
- [ ] Card CRUD + position ordering
- [ ] Drag & drop for lists and cards (@dnd-kit)
- [ ] Workspace member invitation flow (invite, accept, decline)

### Week 3: Card Detail + Realtime
- [ ] Card detail modal (title, description, labels, due date, priority)
- [ ] Assign members to cards
- [ ] Checklist (sub-tasks + progress bar)
- [ ] Comments (CRUD)
- [ ] Activity log (append-only, display timeline)
- [ ] Socket.io board sync (card move, card create, comment)
- [ ] Permission enforcement (Editor can't delete boards, Viewer can only comment)

### Week 4: Polish + Deploy + Documentation
- [ ] UI polish, loading states, error handling
- [ ] Docker + Cloudflare Tunnel deployment
- [ ] GitHub Actions CI/CD pipeline
- [ ] Seed data for demo (2 users, workspace, populated board)
- [ ] Test demo scenario: invite → accept → realtime sync → permissions
- [ ] Write graduation report deployment chapter
- [ ] Only if MVP is fully stable: add Dark mode
- [ ] Only if MVP is fully stable: add Dashboard (1-2 charts max)

---

## 11. Demo Scenario

Prepare this exact flow for the committee presentation:

1. **Account A** (Admin) creates workspace "Nhóm Đồ Án"
2. **Account A** invites **Account B** (as Editor)
3. **Account B** opens invitation link, accepts
4. **Split screen**: both accounts viewing the same board
5. **Account A** drags a card from "Đang làm" to "Hoàn thành" → **Account B** sees it move in realtime
6. **Account B** adds a comment on a card → **Account A** sees it appear
7. Show activity log — all actions recorded
8. Change **Account B** role to Viewer → demonstrate they can no longer edit, only comment
9. Show the database schema (ER diagram) and explain architectural decisions

**Pre-seed the demo board** with realistic data (8-10 cards across 3-4 lists with labels, due dates, members assigned) so the demo looks like a real project, not an empty app.

---

## 12. Risk Mitigation

| Risk                                          | Mitigation                                                            |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Better Auth org plugin doesn't map to my roles | Test role mapping in week 1. Fallback: implement roles manually       |
| Drag & drop ordering bugs                     | Use float positions + renormalization. Test edge cases early           |
| Socket.io + custom server deployment issues   | Set up Docker + deploy in week 1, not week 4                          |
| Scope creep in week 3                         | If core flow isn't stable by end of week 3, STOP adding features      |
| Self-hosted PostgreSQL failure or data loss   | Set up automated backups and test restore before the final demo        |
| Demo failure                                  | Pre-seed data, rehearse demo 3+ times, have backup screenshots/video  |
