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
| Database         | PostgreSQL (Neon — free cloud)                |
| ORM              | Prisma                                        |
| Auth             | Better Auth + Organization plugin             |
| Realtime         | Socket.io                                     |
| Client state     | Zustand                                       |
| Styling          | Tailwind CSS + Shadcn/UI                      |
| Charts           | Recharts                                      |
| File uploads     | Cloudinary                                    |
| Email            | Resend                                        |
| Deployment       | Docker + Nginx (home server)                  |
| CI/CD            | GitHub Actions                                |

### Why this stack
- **Next.js fullstack** — no separate backend needed, simpler for solo dev
- **Custom server** — required for Socket.io since Vercel doesn't support persistent WebSocket
- **Better Auth** — self-hosted, free, includes organization/membership/roles out of the box
- **Neon** — free PostgreSQL with connection pooling, no need to run DB on home server
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
          │  (Neon Cloud)    │
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

### Core entities

```
User
├── id (uuid)
├── name
├── email (unique)
├── password (hashed)
├── image
├── createdAt
└── updatedAt

Workspace (maps to Better Auth Organization)
├── id (uuid)
├── name
├── slug (unique)
├── createdAt
└── updatedAt

WorkspaceMember (maps to Better Auth Member)
├── id
├── workspaceId → Workspace
├── userId → User
├── role: ADMIN | EDITOR | VIEWER
├── createdAt
└── updatedAt

Invitation
├── id
├── workspaceId → Workspace
├── email
├── role: ADMIN | EDITOR | VIEWER
├── status: PENDING | ACCEPTED | DECLINED
├── invitedById → User
├── expiresAt
├── createdAt
└── updatedAt

Board
├── id (uuid)
├── workspaceId → Workspace
├── title
├── backgroundColor
├── createdById → User
├── archivedAt (nullable — soft delete)
├── createdAt
└── updatedAt

BoardStar
├── id
├── boardId → Board
├── userId → User
├── createdAt
└── unique(boardId, userId)

List
├── id (uuid)
├── boardId → Board
├── title
├── position (float — for ordering)
├── createdAt
└── updatedAt

Card
├── id (uuid)
├── listId → List
├── title
├── description (text, markdown)
├── position (float — for ordering)
├── priority: URGENT | HIGH | MEDIUM | LOW | null
├── dueDate (nullable)
├── coverImage (nullable)
├── archivedAt (nullable — soft delete)
├── createdById → User
├── createdAt
└── updatedAt

CardMember (many-to-many: Card ↔ User)
├── cardId → Card
├── userId → User
└── assignedAt

Label
├── id
├── boardId → Board
├── name
├── color
└── createdAt

CardLabel (many-to-many: Card ↔ Label)
├── cardId → Card
└── labelId → Label

Checklist
├── id
├── cardId → Card
├── title
├── position (float)
└── createdAt

ChecklistItem
├── id
├── checklistId → Checklist
├── title
├── isCompleted (boolean)
├── position (float)
└── createdAt

Comment
├── id
├── cardId → Card
├── userId → User
├── content (text)
├── createdAt
└── updatedAt

Attachment
├── id
├── cardId → Card
├── userId → User
├── fileName
├── fileUrl (Cloudinary URL)
├── fileType
├── fileSize
└── createdAt

Activity
├── id
├── workspaceId → Workspace
├── boardId → Board (nullable)
├── cardId → Card (nullable)
├── userId → User
├── action (enum: CREATED, UPDATED, MOVED, ARCHIVED, COMMENTED, etc.)
├── entityType (enum: BOARD, LIST, CARD, COMMENT, etc.)
├── metadata (JSON — stores old/new values, details)
└── createdAt

Notification
├── id
├── userId → User (recipient)
├── type (enum: ASSIGNED, MENTIONED, DUE_DATE, COMMENT, INVITE)
├── title
├── message
├── linkUrl
├── isRead (boolean)
├── createdAt
└── readAt (nullable)
```

### Ordering strategy
Lists and cards use **float position** values:
- Initial items: 1.0, 2.0, 3.0...
- Insert between 1.0 and 2.0 → 1.5
- If precision gets too small after many reorders → renormalize all positions (1.0, 2.0, 3.0...)

This avoids rewriting every item's position on each move.

### Key indexes
- `Card(listId, position)` — fast card ordering queries
- `List(boardId, position)` — fast list ordering queries
- `Activity(boardId, createdAt)` — activity feed
- `Notification(userId, isRead, createdAt)` — notification dropdown
- `Card(listId, archivedAt)` — filter out archived cards

---

## 5. Features — Core (Must Ship)

### 5.1 Authentication (Better Auth)
- Register with email + password
- Login / Logout
- JWT session management
- Password reset flow
- Protected routes via Next.js middleware

### 5.2 Workspace Management
- Create workspace (user becomes Admin)
- Edit workspace name
- Delete workspace (Admin only)
- Invite members via email link
- Accept / decline invitation
- Remove members (Admin only)
- Role-based permissions:

| Action                          | Admin | Editor | Viewer |
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
│   └── cloudflared (Cloudflare Tunnel)
├── External services
│   ├── Neon (PostgreSQL)
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

---

## 10. Timeline

### Week 1: Foundation
- [ ] Initialize Next.js 15 project + Tailwind + Shadcn/UI
- [ ] Set up Prisma + Neon PostgreSQL + schema
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
- [ ] Dark mode
- [ ] Dashboard (1-2 charts if time allows)
- [ ] UI polish, loading states, error handling
- [ ] Docker + Cloudflare Tunnel deployment
- [ ] GitHub Actions CI/CD pipeline
- [ ] Seed data for demo (2 users, workspace, populated board)
- [ ] Test demo scenario: invite → accept → realtime sync → permissions
- [ ] Write graduation report deployment chapter

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
| Neon free tier limits                         | Monitor usage. 0.5 GB storage is plenty for a demo project            |
| Demo failure                                  | Pre-seed data, rehearse demo 3+ times, have backup screenshots/video  |
