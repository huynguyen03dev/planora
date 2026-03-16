# Base Layout Design

## Overview

The authenticated app shell follows a Trello-inspired layout with three main
components: a top navbar, a sidebar (on dashboard pages), and the main content
area. Board pages use a different layout without the sidebar to maximize
horizontal space for kanban columns.

---

## Layout Variants

### 1. Dashboard Layout (Home / Board List)

```
┌─────────────────────────────────────────────────────────┐
│  🔲 Planora                                      [NH]  │  ← Navbar (full width)
├──────────┬──────────────────────────────────────────────┤
│ Sidebar  │                                              │
│          │  Main content                                │
│ Boards   │  (board list, starred, recent)               │
│ Home     │                                              │
│          │                                              │
│ Workspace│                                              │
│  ▼ PGDC  │                                              │
│   Boards │                                              │
│   Members│                                              │
└──────────┴──────────────────────────────────────────────┘
```

### 2. Board Layout (Inside a Board)

```
┌─────────────────────────────────────────────────────────┐
│  🔲 Planora                                      [NH]  │  ← Navbar (full width)
├─────────────────────────────────────────────────────────┤
│  Board Name  ▼                    [Members] [Share] ... │  ← Board header
├─────────────────────────────────────────────────────────┤
│  To Do       │  Doing       │  Done        │ + Add list │
│  ┌────────┐  │  ┌────────┐  │  ┌────────┐  │            │
│  │ Card 1 │  │  │ Card 3 │  │  │ Card 5 │  │            │
│  └────────┘  │  └────────┘  │  └────────┘  │            │
│  ┌────────┐  │              │              │            │
│  │ Card 2 │  │              │              │            │
│  └────────┘  │              │              │            │
│              │              │              │            │
└──────────────┴──────────────┴──────────────┴────────────┘
```

### 3. Onboarding (0 Workspaces)

No navbar, no sidebar. Full-page centered form:

```
┌─────────────────────────────────────────┐
│                                         │
│         Welcome to Planora!             │
│                                         │
│   Create your first workspace to        │
│   start organizing your projects.       │
│                                         │
│   ┌─────────────────────────────┐       │
│   │  Workspace name             │       │
│   └─────────────────────────────┘       │
│                                         │
│         [ Create Workspace ]            │
│                                         │
└─────────────────────────────────────────┘
```

After creating the first workspace, redirect to the dashboard layout.

---

## Components

### Navbar (`components/layout/navbar.tsx`)

- Full-width top bar, fixed ~48px height
- **Left:** Planora logo/text (links to home/dashboard)
- **Right:** User avatar circle (initials), clicking opens user menu dropdown
- Same component on both dashboard and board views
- MVP scope: logo + avatar only (search, create button, notifications added later)

### User Menu (`components/layout/user-menu.tsx`)

- Dropdown triggered by avatar click
- Contains: user name, email, Sign out button
- No theme toggle for MVP (light mode only)

### Sidebar (`components/layout/sidebar.tsx`)

- Fixed ~256px wide, below navbar, full remaining height
- Only rendered on dashboard pages (not on board view)
- **Top nav links:** Boards, Home (highlighted when active)
- **"Workspaces" section label**
- **Workspace list:** All user's workspaces, each expandable/collapsible
  - Expanded shows sub-links: Boards, Members
  - Clicking "Boards" navigates to that workspace's board list
  - Clicking "Members" navigates to member management
- **"+ Create workspace"** button at bottom, opens dialog

### Workspace List (`components/layout/workspace-list.tsx`)

- Lists all workspaces the user belongs to
- Each workspace item expands/collapses independently
- Shows workspace name with expand/collapse chevron
- Active workspace/page is highlighted

### Create Workspace Dialog (`components/layout/create-workspace-dialog.tsx`)

- Modal dialog with workspace name field + create button
- Triggered from sidebar "+" button
- Creates workspace via server action, then refreshes sidebar

---

## Routing Structure

```
app/(authenticated)/
    layout.tsx              ← Session guard (verifySession) + navbar + {children}
                               Fetches user's workspaces; if 0 → redirect to /onboarding
    onboarding/
      page.tsx              ← "Create first workspace" full page
    (dashboard)/
      layout.tsx            ← Sidebar + content area
      page.tsx              ← Home / board list (starred, recent, all boards)
    boards/[boardId]/
      layout.tsx            ← Board header (no sidebar, full width)
      page.tsx              ← Kanban view

app/(public)/
    layout.tsx              ← Public navbar (logo + links + auth buttons) + {children}
    page.tsx                ← Landing page
    sign-in/page.tsx        ← Sign in form
    sign-up/page.tsx        ← Sign up form
```

---

## Data Flow

- `(authenticated)/layout.tsx` calls `verifySession()` to get the user session.
  Fetches user's workspaces from Prisma. If 0 workspaces → redirect to
  `/onboarding`. Otherwise renders navbar (passes user data) + `{children}`.

- `(dashboard)/layout.tsx` fetches workspaces + boards for the current user from
  Prisma, renders sidebar as a **Server Component** (no client-side state needed
  for MVP).

- Navbar is a Server Component that receives user data from the parent layout.
  The user menu dropdown is a Client Component (needs click interaction).

- Sidebar workspace expand/collapse is client-side state (local useState or
  Zustand), but the workspace/board data itself is fetched server-side.

---

## Public Navbar

Separate from the authenticated navbar. Lives in `app/(public)/layout.tsx`.

```
┌─────────────────────────────────────────────────────────┐
│  🔲 Planora     Features  About         [Sign In] [Sign Up] │
└─────────────────────────────────────────────────────────┘
```

- Logo + nav links (Features, About) on the left
- Sign In / Sign Up buttons on the right
- Only shown on public pages (landing, sign-in, sign-up)

---

## Design Decisions

| Decision | Choice | Reasoning |
| --- | --- | --- |
| Layout pattern | Sidebar + navbar (Trello-style) | Natural for kanban apps, good for workspace/board navigation |
| Sidebar on board view | Hidden (no sidebar) | Boards need max horizontal space for lists/columns |
| Workspace selector | Expandable list in sidebar | Follows Trello pattern, better visibility than dropdown |
| Breadcrumbs | Dropped for MVP | Sidebar highlights current location, sufficient context |
| Dark mode | Light only for MVP | Reduces scope, theme tokens already exist for later |
| Navbar content (MVP) | Logo + avatar only | Skip search/create/notifications, add as stretch features |
| Onboarding | Full-page when 0 workspaces | Clean first experience, then dialog for subsequent workspaces |
| Sidebar data fetching | Server Component | No client-side state needed, simpler for MVP |
