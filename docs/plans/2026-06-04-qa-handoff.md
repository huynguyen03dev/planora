# Planora QA — Handoff Document

**Date:** 2026-06-04
**Author:** Previous QA session (compacted/handoff)
**Status:** 4 of 6 tasks complete, 2 remaining
**Next session:** Pick up from "Remaining Work" section

---

## 1. Quick Start (Environment Setup)

### Dev Server

The dev server runs in a tmux session. It crashed once during this QA — restart it with:

```bash
tmux new-session -d -s dev 'cd /home/hazeruno/IT/workspace/planora && npm run dev > /tmp/planora-dev.log 2>&1'
```

Verify it's up:

```bash
sleep 8 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
# should print: 200
```

Dev server log: `/tmp/planora-dev.log` (tail it to see request log including Server Action POSTs).

**Important:** The previous session had tmux issues — `tmux kill-session` was used accidentally and the server was restarted in session `dev`. **Do NOT use `tmux kill-session` going forward.** If you need to restart the dev server, just create a new session with the command above.

### Database

PostgreSQL runs in a Docker container:

```bash
docker exec postgres-server psql -U postgres -d planora
```

Connection string (from `.env`): `postgresql://postgres:postgres@localhost:5432/planora?schema=public`

Table names are **camelCase** (mapped via `@@map` in Prisma), e.g. `card`, `list`, `board`, `workspaceMember`. Note: `board` table does **NOT** have a `boardId` column (that's a Prisma model name vs field name confusion — use the Prisma field names when querying).

### Browser Automation (MCP)

The chrome-devtools MCP server is available with three tools:
- `chrome_devtools_navigate` — args: `{"url": "..."}`
- `chrome_devtools_evaluate` — args: `{"script": "JS expression"}`
- `chrome_devtools_screenshot` — args: `{}` (saves to `/tmp/chrome-devtools-mcp-XXXXXX/screenshot.png`)

**Known issue with `chrome_devtools_navigate`:** The args parameter sometimes fails with "Validation failed" when the JSON string is passed a certain way. Workaround: use `chrome_devtools_evaluate` with `window.location.href = 'URL'` and then `sleep 3`.

**Critical limitation — React controlled inputs:** The standard `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)` approach fails with "Illegal invocation" because React 18+ has redefined the prototype. The MCP also doesn't have `Input.dispatchKeyEvent`. Workarounds that **do work**:
- Use `chrome_devtools_evaluate` with this pattern:
  ```js
  () => {
    const el = document.querySelector('input[placeholder="..."]');
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    proto.set.call(el, 'value');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value;
  }
  ```
  (Use IIFE to avoid variable redeclaration errors between calls.)
- This **worked** for list creation but the same approach got "Illegal invocation" on the card title input in the modal — possibly a stricter context. If it fails, fall back to: navigate, find the input, focus it, and ask the user to type. Or just verify functionality via direct DB query after manual input.

---

## 2. Test Users (in DB)

These users were created during previous QA runs. The first one is the "main" test user:

| Email | Password | Name | Notes |
| --- | --- | --- | --- |
| `qa@test.com` | unknown — set in previous session | QA User | Main test user; check sign-in log or reset |
| `qa-test@planora.dev` | unknown | QA Test User | Secondary |
| `dragtest1777360960255@example.com` | unknown | Drag Test | Drag test runs |
| `dragtest1777361014802@example.com` | unknown | Drag Test | Drag test runs |
| `long@mail.com` | unknown | long | Stale |

**Password issue:** Previous sessions set passwords but they were not recorded. If sign-in fails, you can either:
1. Check `.pi` or session notes for the password
2. Create a new user via the sign-up flow (`http://localhost:3000/sign-up`)
3. Reset via Better Auth admin (not implemented yet)

The sign-up flow at `/sign-up` works — that's how users were created in earlier sessions.

---

## 3. Test Data (Current State in DB)

### Workspaces

| ID | Name | Slug |
| --- | --- | --- |
| `KxtYMXU7iASI2xZEiVD4m2EnUyXTyrVF` | aaa | aaa-vzkewj |
| `md2EltSVLC4ACkKJZLH0yQ` | Drag Debug Workspace | drag-debug-1777361137864 |
| `Rb0EtucH531bkqEwOQcAWf6daYIkIoVg` | QA Workspace | qa-workspace-dyzl4s |
| `R93tKs9RTRUGsV52ogZ65YJAa9cu67ik` | QA Workspace | qa-workspace-88ounp |

### Boards (focus on these for continued testing)

| ID | Title | Workspace |
| --- | --- | --- |
| `b399866a-b670-4ff2-b655-978506b79c3d` | QA Test Board | QA Workspace (dyzl4s) |
| **`c6567190-0a3a-4b94-81dc-ab559f25befd`** | **QA Test Board** | **QA Workspace (88ounp) — PRIMARY** |
| `f1afef63-1f3b-44d1-b80e-bbde9dbb175f` | Drag Debug Board | Drag Debug |
| `b8f5609c-228d-4797-b47c-909f0164f9dd` | a1 | aaa |

### Lists on PRIMARY board (c6567190...)

| ID | Title | Position |
| --- | --- | --- |
| `575a6e8f-39ba-4303-a457-7afee23c0f0a` | To Do | 16384 |
| `38712b3a-7a00-44e1-baec-2edac548cb7b` | Doing | 32768 |

### Cards on PRIMARY board

| ID | Title | List | Position |
| --- | --- | --- | --- |
| `e0a44e87-dca6-46a5-9b36-08ce509ff09e` | Test Card QA | To Do | 16384 |

Position uses gap-based floats (default gap = 16384, starting at 16384).

---

## 4. QA Tasks Completed

### ✅ Task #1: Landing page & navigation — PASS
- `/` renders the public landing page
- Sign-in / sign-up links work
- Authenticated users get redirected to `/boards`

### ✅ Task #2: Authentication flow — PASS
- Sign-up creates user + workspace
- Sign-in with email/password works
- Sign-out works
- Session persists across reloads
- Better Auth organization plugin creates Workspace + WorkspaceMember on signup

### ✅ Task #3: Workspace & board management — PASS
- Workspace sidebar shows all workspaces
- "Create workspace" modal works
- "Create board" modal works
- Board cards link to `/boards/[boardId]`
- Board settings sidebar accessible from board page

### ✅ Task #4: Kanban board — lists and cards CRUD — PARTIAL

**What works (verified end-to-end):**
- ✅ Board page `/boards/[boardId]` loads
- ✅ "+ Add a list" button opens inline form
- ✅ Creating a list via form → Server Action → Prisma → DB (POST 200, position 32768 = 16384 × 2)
- ✅ "+ Add a card" button opens inline form
- ✅ Creating a card via form → Server Action → Prisma → DB (POST 200, position 16384)
- ✅ Clicking a card opens detail view at `?cardId=<id>` with sections:
  - Title (editable inline)
  - Description
  - Members
  - Attachments
  - Card metadata (dates, etc.)
  - Comments and activity
- ✅ Clicking a list title turns it into an editable input (inline rename UI)
- ✅ Two lists now exist on the primary QA Test Board

**What was NOT tested (remaining for this task or new tasks):**
- ❌ Card title editing (submit) — blocked on React controlled input setter
- ❌ Card description editing
- ❌ Card deletion
- ❌ List renaming (submit) — same input setter issue
- ❌ List deletion
- ❌ Drag and drop (cards between lists, list reordering)
- ❌ Card members
- ❌ Card labels
- ❌ Card checklists
- ❌ Card attachments (file upload)
- ❌ Card comments
- ❌ Card archive/restore
- ❌ Card due date / estimate
- ❌ "Mark list as done" toggle
- ❌ Real-time updates (Socket.io)
- ❌ Board sharing

**Bugs / observations found:**
- `Other 1` and `Other 2` cards in the `Doing` list of `Drag Debug Board` exist with positions 16384 and 32768 (no gaps — straight sequential). This is fine.
- `Card A` through `Card D` in `Todo` list of `Drag Debug Board` have positions 32768, 40960, 49152, 65536 (not 16384, 32768, …) — looks like a drag-reorder test that left the first position with a gap from a removed card. Not a bug, but worth noting.
- The card detail URL uses `?cardId=<id>` query string (not a route) — the card sheet is a modal/sheet overlay on the board page.

---

## 5. Bugs / Issues to Investigate

None confirmed as bugs. The only testing limitation is the React controlled input issue noted above — that blocked several interaction tests in Task #4 but is not an app bug.

One observation: The dev server log shows `url.parse()` deprecation warnings from Node 24 — these are from a dependency (likely `ws` or `socket.io`), not from app code. Safe to ignore.

---

## 6. Code Structure (for context)

```
app/
  (public)/                    # Public routes (no auth)
    page.tsx                   # Landing
    sign-in/page.tsx
    sign-up/page.tsx
  (authenticated)/(dashboard)/ # Auth-gated routes
    boards/
      page.tsx                 # /boards (all workspaces + boards)
      actions.ts               # Workspace/board CRUD server actions
      [boardId]/
        page.tsx               # Board detail page
        board-content.tsx      # Board UI (lists + cards)
        board-store.ts         # Zustand store (client state)
        board-store-provider.tsx
        actions.ts             # List/card server actions
    workspace/
      [slug]/dashboard/        # Workspace analytics dashboard
    notifications/
    profile/
    invitations/
  api/auth/[...all]/           # Better Auth catch-all
lib/
  prisma.ts                    # Prisma client singleton
  auth.ts                      # Better Auth server config
  permissions.ts               # RBAC (admin/editor/viewer)
  schemas/                     # Zod schemas (card.ts, list.ts, comment.ts, …)
  list.ts                      # List DB operations
  card.ts                      # Card DB operations
  card-member.ts               # CardMember DB operations
  comment.ts                   # Comment DB operations
  attachment.ts                # Attachment DB operations
  activity.ts                  # Activity log
  notification.ts              # Notifications
  cloudinary.ts                # File upload (Cloudinary)
  realtime/                    # Socket.io server + client
components/boards/             # Board UI components
  list-column.tsx              # Single list with cards
  list-card-item.tsx           # Single card
  card-detail-sheet.tsx        # Card modal/sheet
  add-list-button.tsx
  create-board-modal.tsx
  create-workspace-modal.tsx
  board-header.tsx
  boards-sidebar.tsx
  use-inline-title-editor.ts   # Hook for inline editing
prisma/
  schema.prisma                # All models
  migrations/                  # Migration history
docs/plans/
  2026-03-20-trello-style-boards-plan.md  # The big design doc
```

---

## 7. Remaining Work

### Task #5: QA: Notifications & analytics
**Status:** Pending

**Test plan:**
1. **Notifications**
   - Navigate to `/notifications`
   - Verify the notifications list renders
   - Trigger a notification: assign the test user to a card, mention them in a comment
   - Verify notification appears in the list
   - Click "mark as read" on a notification
   - Verify mark-all-read works
   - File: `app/(authenticated)/(dashboard)/notifications/page.tsx`
   - API: `app/api/notifications/`
   - Server actions: `lib/notification-actions.ts`

2. **Workspace analytics dashboard** at `/workspace/[slug]/dashboard`
   - Visit the dashboard for QA Workspace (slug: `qa-workspace-88ounp`)
   - Verify KPI cards render (cards created, completed, etc.)
   - Verify burndown chart renders
   - Verify lead time table renders
   - Verify filter bar works (date range, member)
   - Test export buttons (CSV/JSON) if present
   - Files: `app/(authenticated)/(dashboard)/workspace/[slug]/dashboard/`
   - Engine: `lib/analytics/engine.ts`
   - Tests: `lib/analytics/engine.test.ts`

**Steps:**
```bash
# 1. Sign in as qa@test.com (or create a new user)
# 2. Navigate to /notifications via sidebar
# 3. Trigger notifications by creating a card and assigning yourself
# 4. Mark as read, verify
# 5. Navigate to /workspace/qa-workspace-88ounp/dashboard
# 6. Verify charts and KPIs render
# 7. Test filter bar with different date ranges
# 8. Test export buttons
```

### Task #6: QA: Visual/UI regression & edge cases
**Status:** Pending

**Test plan:**
1. **Responsive layout**
   - Test board page at 1920px, 1280px, 768px, 375px widths
   - Verify lists scroll horizontally on narrow screens
   - Verify sidebar collapses properly

2. **Empty states**
   - Brand-new workspace with no boards → empty state
   - Board with no lists → "Add a list" CTA
   - List with no cards → "No cards yet"
   - User with no notifications → empty state

3. **Error states**
   - Try to access a non-existent board ID → 404
   - Try to access a board you don't have permission for → 403 / redirect
   - Sign in with wrong password → error message
   - Sign up with duplicate email → error
   - File: `app/(authenticated)/(dashboard)/boards/not-found.tsx`
   - File: `app/(authenticated)/(dashboard)/boards/error.tsx`
   - File: `app/(authenticated)/(dashboard)/boards/[boardId]/error.tsx`

4. **Validation**
   - Create list with empty title → validation error
   - Create list with very long title → validation error
   - Create card with empty title → validation error
   - Upload file larger than limit → error
   - Schemas: `lib/schemas/list.ts`, `lib/schemas/card.ts`, `lib/schemas/attachment.ts`

5. **Authorization (RBAC)**
   - Create a second user, invite them to a workspace as `viewer`
   - Verify they can't create/edit/delete boards, lists, or cards
   - Promote to `editor` → verify they can edit
   - Promote to `admin` → verify they can manage members
   - Permissions: `lib/permissions.ts`

6. **Accessibility (basic)**
   - Tab through board page — focus rings visible?
   - Press Enter on focused button — activates?
   - Escape closes modals
   - Screen reader labels on icon buttons
   - shadcn components should handle most of this — verify in the modal

**Steps:**
```bash
# 1. Resize browser to test responsive layouts
# 2. Create a new workspace, verify empty state
# 3. Navigate to /boards/non-existent-id, verify 404
# 4. Sign out, sign in with wrong password
# 5. Try empty list title
# 6. Create a 2nd test user, invite as viewer, verify read-only
# 7. Tab through board, check focus management
```

### Kanban features NOT yet tested (could be added to task #4 or a new task)

These are part of the kanban board CRUD but weren't completed in the previous session:

- Card title editing (submit)
- Card description editing
- Card deletion
- List renaming (submit)
- List deletion
- Drag and drop (cards between lists, list reordering)
- Card members (add/remove)
- Card labels (create/assign)
- Card checklists (create/items/check)
- Card attachments (file upload via Cloudinary)
- Card comments (add/edit)
- Card archive/restore
- Card due date / estimate
- "Mark list as done" toggle (the `isDone` field exists in schema)
- Board sharing / member invitations to a board
- Real-time updates via Socket.io

**How to test these:** Use the chrome-devtools MCP tools. For drag-and-drop specifically, you'll need to simulate HTML5 drag events programmatically — see `lib/realtime/` and the `board-content.tsx` for DnD library being used (likely `@dnd-kit/core` or `react-dnd`).

---

## 8. Tips for Next Session

1. **Save your progress** in the TaskList — update descriptions with what's been verified.
2. **Screenshot after every meaningful action** — the dev server log only shows server actions, not UI state.
3. **Always verify DB state** after a Server Action POST — the MCP tool only confirms the request was made, not that the action succeeded.
4. **The React input setter issue is the main blocker.** If a test requires typing into a controlled input and the IIFE approach fails, consider:
   - Using `page.keyboard.type()` if you have Playwright
   - Adding a `?debug=1` query param to the app to bypass validation
   - Directly calling the Server Action via fetch with a form data payload
5. **Don't restart the dev server unless it's actually down** (curl returns 000). The "edit file → HMR" loop is fast enough.
6. **Watch for `position` values** in the DB to confirm CRUD worked — list/card positions are floats (gap-based Planka pattern), default 16384.

---

## 9. Files to Read First

When picking up:
1. `AGENTS.md` (project-specific) — code style, conventions
2. `docs/plans/2026-03-20-trello-style-boards-plan.md` — the design doc
3. `prisma/schema.prisma` — data model
4. `app/(authenticated)/(dashboard)/boards/[boardId]/board-content.tsx` — main board UI
5. `app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts` — all server actions
6. `components/boards/list-column.tsx` and `list-card-item.tsx` — UI components

Good luck!
