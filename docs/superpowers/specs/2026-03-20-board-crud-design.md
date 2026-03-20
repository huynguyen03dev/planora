# Board CRUD Design Spec

> Create, update, and delete boards within workspaces

---

## 1. Overview

This spec covers the full CRUD lifecycle for boards:

- **Create:** Modal dialog with title + color selection
- **Update:** Inline title editing + background color change via settings sidebar
- **Delete:** Hard delete with confirmation dialog (admin only)

Boards use the existing `Board` model. The `archivedAt` field remains in the schema but is unused — only cards support soft-delete.

---

## 2. Data Layer

### 2.1 Server Actions

Location: `app/(authenticated)/(dashboard)/boards/actions.ts`

| Action              | Signature                                                         | Authorization   | Returns                                  |
| ------------------- | ----------------------------------------------------------------- | --------------- | ---------------------------------------- |
| `createBoardAction` | `(formData: { workspaceId, title, backgroundColor }) => Result`   | admin only      | `{ success: true, boardId }` or error    |
| `updateBoardAction` | `(formData: { boardId, title?, backgroundColor? }) => Result`     | admin or editor | `{ success: true }` or error             |
| `deleteBoardAction` | `(boardId: string) => Result`                                     | admin only      | `{ success: true }` or error             |

All actions:
1. Call `verifySession()` to get userId
2. Fetch board to get `workspaceId`
3. Check authorization via `hasWorkspacePermission()`
4. If unauthorized: return `{ success: false, error: "Board not found" }` (do not reveal existence)
5. Perform Prisma operation
6. Call `revalidatePath("/boards")` for cache invalidation

### 2.2 Lib Functions

Location: `lib/board.ts`

```ts
// Fetch board with workspace info (for auth checks)
export async function getBoardById(boardId: string): Promise<Board | null>

// Create board in workspace
export async function createBoard(data: {
  workspaceId: string;
  title: string;
  backgroundColor: string;
  createdById: string;
}): Promise<Board>

// Update board fields
export async function updateBoard(
  boardId: string,
  data: { title?: string; backgroundColor?: string }
): Promise<Board>

// Delete board (cascades to lists, cards, etc.)
export async function deleteBoard(boardId: string): Promise<void>
```

### 2.3 Authorization Matrix

| Action | admin | editor | viewer |
| ------ | ----- | ------ | ------ |
| Create | ✅     | ❌      | ❌      |
| Update | ✅     | ✅      | ❌      |
| Delete | ✅     | ❌      | ❌      |

Authorization is checked by calling `hasWorkspacePermission()` with the board's `workspaceId`.

---

## 3. UI Components

### 3.1 Create Board Flow

**Trigger:** "Create board" button in `WorkspaceBoardsView`

**Component:** `CreateBoardModal`
- Location: `components/boards/create-board-modal.tsx`
- Props: `{ workspaceId: string, open: boolean, onClose: () => void }`

**Form fields:**
- Title input (required, 1-64 chars)
- Color palette (8 solid colors, one selected by default)

**Behavior:**
1. User clicks "Create board" → modal opens
2. User enters title, selects color
3. Submit calls `createBoardAction`
4. On success: close modal, redirect to `/boards/[newBoardId]`
5. On error: show inline error message

### 3.2 Board Page Header

**Location:** `app/(authenticated)/(dashboard)/boards/[boardId]/page.tsx`

**Component:** `BoardHeader`
- Location: `components/boards/board-header.tsx`
- Shows board title (inline editable for admin/editor, read-only for viewer)
- Shows 3-dot menu button on the right (hidden for viewer)

**Inline title edit:**
- Click title → becomes input field
- Press Enter or blur → saves via `updateBoardAction`
- Press Escape → cancels edit

### 3.3 Board Menu (Dropdown)

**Component:** `BoardMenu`
- Location: `components/boards/board-menu.tsx`
- Triggered by 3-dot button in header
- **Only visible to admin and editor roles** (viewers see no menu)

**Menu items:**
- "Change background" → opens `BoardSettingsSidebar` (admin and editor)
- "Delete board" → opens `DeleteBoardDialog` (admin only)

### 3.4 Board Settings Sidebar

**Component:** `BoardSettingsSidebar`
- Location: `components/boards/board-settings-sidebar.tsx`
- Slide-out panel from the right (like Trello)
- Props: `{ board: Board, open: boolean, onClose: () => void }`
- **Only accessible by admin and editor** (button hidden for viewers)

**Contents:**
- Header: "Settings" with close button
- Section: "Background" with color palette grid
- Clicking a color immediately updates via `updateBoardAction`

### 3.5 Delete Board Dialog

**Component:** `DeleteBoardDialog`
- Location: `components/boards/delete-board-dialog.tsx`
- Confirmation dialog using shadcn AlertDialog

**Copy:**
> Delete "[Board Title]"?
>
> This will permanently delete all lists, cards, and comments. This action cannot be undone.

**Buttons:** "Cancel" | "Delete" (destructive)

**Behavior:**
1. User confirms → calls `deleteBoardAction`
2. On success: redirect to `/boards`
3. On error: show toast notification

---

## 4. Color Palette

```ts
// lib/constants.ts
export const BOARD_COLORS = [
  { name: "Blue", value: "#0079BF" },
  { name: "Green", value: "#519839" },
  { name: "Orange", value: "#D29034" },
  { name: "Red", value: "#B04632" },
  { name: "Purple", value: "#89609E" },
  { name: "Pink", value: "#CD5A91" },
  { name: "Gray", value: "#838C91" },
  { name: "Teal", value: "#00AECC" },
] as const;

export const DEFAULT_BOARD_COLOR = BOARD_COLORS[0].value; // Blue
```

**UI:** 8 color swatches in a 4x2 grid. Selected color has a checkmark overlay.

---

## 5. Routes

| Route               | Purpose                              | Components                          |
| ------------------- | ------------------------------------ | ----------------------------------- |
| `/boards`           | Board list (existing)                | Add CreateBoardModal trigger        |
| `/boards/[boardId]` | Board view (kanban)                  | Add BoardHeader, BoardMenu, Sidebar |

---

## 6. Validation Rules

### Board Title
- Required
- Min length: 1 character
- Max length: 64 characters
- Trimmed before save

### Background Color
- Required on create
- Must be one of the predefined `BOARD_COLORS` values (no custom hex input)
- Defaults to blue (`#0079BF`) if not provided

---

## 7. Error Handling

| Scenario                    | Handling                                      |
| --------------------------- | --------------------------------------------- |
| Board not found             | 404 page via `notFound()`                     |
| No permission to view       | 404 page via `notFound()` (same as not found) |
| No permission to edit       | Hide edit controls, show read-only view       |
| No permission to delete     | Hide delete option in menu                    |
| Create/update fails         | Inline error in modal/form                    |
| Delete fails                | Toast notification                            |
| Network error               | Generic error message with retry option       |

---

## 8. File Structure

```
app/(authenticated)/(dashboard)/boards/
├── actions.ts              # Add createBoardAction, updateBoardAction, deleteBoardAction
├── [boardId]/
│   └── page.tsx            # Board view page (kanban)

components/boards/
├── create-board-modal.tsx    # New
├── board-header.tsx          # New
├── board-menu.tsx            # New
├── board-settings-sidebar.tsx # New
├── delete-board-dialog.tsx   # New
├── color-palette.tsx         # New: reusable color picker
└── ... (existing)

lib/
├── board.ts                  # New: board data functions
└── constants.ts              # New: BOARD_COLORS, etc.
```

---

## 9. Dependencies

**shadcn/ui components needed:**
- `DropdownMenu` (for BoardMenu)
- `Sheet` (for BoardSettingsSidebar)
- `AlertDialog` (for DeleteBoardDialog)
- `Dialog` (already have, for CreateBoardModal)

---

## 10. Out of Scope

- Board starring (Week 2 stretch or later)
- Board activity log display (Week 3)
- Board member management (separate from workspace members)
- Board templates
- Board duplication
