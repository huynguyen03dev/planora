# Trello-Style Boards Page Design

## Overview

Redesign `/boards` to follow Trello's navigation pattern: sidebar-driven workspace navigation with a main content area showing boards. Remove the separate `/workspace` route.

## Goals

- Single `/boards` page as the main hub after login
- Sidebar shows workspaces with expandable "Boards" links
- Main content switches between overview (all workspaces) and single-workspace view
- Create Workspace via modal dialog

## Page Structure

### Top Navbar
- **Left:** Planora logo
- **Right:** User avatar dropdown containing:
  - User name/email (display only)
  - Profile link
  - Create Workspace (opens modal)
  - Sign out

### Sidebar
```
┌─────────────────────┐
│ 📋 Boards           │  ← Top-level: shows overview
├─────────────────────┤
│ WORKSPACES          │
│ ┌─────────────────┐ │
│ │ P Product Team ▼│ │  ← Collapsible workspace
│ │   📋 Boards     │ │  ← Shows this workspace only
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ M Marketing   ▶ │ │  ← Collapsed workspace
│ └─────────────────┘ │
└─────────────────────┘
```

### Main Content Area

**Overview mode** (top "Boards" selected):
- Heading: "Your Workspaces"
- For each workspace: workspace header + board grid
- Each board card links to `/boards/[boardId]`

**Workspace mode** (workspace "Boards" selected):
- Heading: Workspace name + board count
- Board grid for that workspace only
- "+ Create board" card at end (out of scope for this iteration — shown as disabled/placeholder)

## Create Board (Deferred)

The "+ Create board" card appears in the UI but is **not functional in this iteration**. It will be implemented in a follow-up spec. For now:
- Card is visible but styled as disabled (grayed out, no hover effect)
- Clicking shows a tooltip: "Coming soon"

## States

| State | Sidebar | Main Content |
|-------|---------|--------------|
| Overview | Top "Boards" active | All workspaces with boards |
| Workspace view | Workspace's "Boards" active | Single workspace's boards |
| Empty (no workspaces) | Hidden completely | Centered CTA to create first workspace (full-width) |
| Empty workspace (no boards) | Normal | Workspace header + "No boards yet" message (no create card in overview, disabled card in workspace view) |
| Board click | — | Navigate to `/boards/[boardId]` (kanban page) |
| Workspace list fetch error | Hidden | Full-page error with retry button |
| Board data fetch error | Normal | Full-page error with retry button (granular error handling deferred) |

## Sidebar Behavior

- **Clicking workspace row:** Expands/collapses that workspace (toggle)
- **Clicking workspace "Boards" link:** Navigates to `/boards?workspace=[id]`
- **Multiple expanded:** Yes, multiple workspaces can be expanded simultaneously
- **Default on load:** All workspaces collapsed; if URL has `?workspace=[id]`, that workspace auto-expands

## Create Workspace Modal

- Triggered from:
  1. User dropdown → "Create Workspace"
  2. Empty state CTA button
- Form fields:
  - Workspace name (required, 2-64 chars)
- Validation:
  - Empty name → inline error "Workspace name is required"
  - Too short/long → inline error with character requirements
- On submit error (network/server):
  - Show error message in modal
  - Keep modal open, allow retry
- On success:
  - Modal closes
  - New workspace appears in sidebar
  - Navigate to `/boards?workspace=[newId]` (show new workspace's boards)

## URL Structure

| URL | View |
|-----|------|
| `/boards` | Overview (all workspaces) |
| `/boards?workspace=[id]` | Workspace view (single workspace's boards) |
| `/boards/[boardId]` | Kanban board page (lists + cards) |

**Routing contract:**
- Query param `workspace` is the source of truth for view selection
- No query param → overview mode
- With query param → workspace mode
- Sidebar "Boards" links update the URL (not just client state)
- Browser back/forward works correctly via URL
- Direct links to workspace views are shareable

**Invalid workspace param handling:**
- If `workspace=[id]` doesn't exist or user lacks access → redirect to `/boards` (overview)

## Component Breakdown

### New Components
- `BoardsSidebar` — sidebar with top Boards link + workspace list
- `WorkspaceItem` — collapsible workspace in sidebar
- `BoardsOverview` — main content showing all workspaces
- `WorkspaceBoardsView` — main content showing single workspace
- `WorkspaceSection` — workspace header + board grid (used in overview)
- `BoardCard` — individual board thumbnail (reused everywhere)
- `CreateWorkspaceModal` — modal dialog for workspace creation
- `EmptyBoardsState` — centered CTA for no-workspace users
- `UserDropdown` — avatar dropdown with menu

### Modified Components
- `DashboardLayout` — replace current sidebar with new `BoardsSidebar`

### Removed
- `/workspace` route and page → redirects to `/boards` for any existing links
- Current workspace actions file → logic absorbed into modal + new components

## Data Flow

1. Page loads → fetch user's workspace memberships
2. Determine view:
   - If query param `workspace` → workspace view
   - Else → overview
3. Fetch boards for relevant workspace(s)
4. Render sidebar + main content

## Scope

### Included (First Iteration)
- Sidebar with collapsible workspaces
- Top-level Boards link (overview)
- Per-workspace Boards link
- Board grid with cards
- Create Workspace modal
- Empty state CTA
- User dropdown menu
- Basic board cards (name, background color)

### Deferred
- Members link/page per workspace
- Settings link/page per workspace
- Billing link/page
- Recently viewed boards section
- Board templates
- Board starring/favorites
- Search
- Profile page (dropdown shows link, but page is out of scope)
- Create board functionality (UI placeholder only)

## Technical Notes

- Workspace data comes from Better Auth organization plugin (already configured)
- Board backgrounds: store color/gradient in Board model
- Sidebar expanded state: client state only, not persisted, resets on page refresh
- Selected workspace for main content: **query param only** (no client state for view selection)
- Workspace ordering: by creation date ascending (oldest first)
- Board ordering: by creation date ascending (position field to be added in future iteration)
- Profile link: navigates to `/profile` but page shows "Coming soon" placeholder
- Retry on fetch error: refetches data only (no full page reload), preserves URL (sidebar expanded state derives from URL)
- Overview mode with empty workspaces: show workspace section with "No boards yet" message (don't hide)
