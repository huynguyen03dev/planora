# List CRUD + Kanban UI Design

> **Date:** 2026-03-21  
> **Status:** Draft  
> **Effort Estimate:** 1-4 hours

## Overview

Implement List CRUD operations and initial Kanban board UI with simple card placeholders. This establishes the core board layout before adding drag-and-drop reordering and card CRUD.

## Scope

### In Scope
- **List CRUD**: Create, rename, delete lists within a board
- **Inline interactions**: Trello-style (click to edit, no modals for create/edit)
- **Kanban layout**: Horizontal scrolling list container, lists expand vertically
- **Card placeholders**: Simple title-only cards for layout visualization
- **Theme support**: shadcn/ui styling (light/dark ready)

### Out of Scope (Deferred)
- Drag-and-drop list reordering
- Card CRUD operations
- Realtime sync (Socket.io)
- Rich card metadata (labels, due dates, assignees, covers)
- Vertical scroll inside lists

## Architecture

Adapts existing Board CRUD patterns (Server Actions + Zod + auth checks) for list operations.

### File Structure

```
lib/
├── list.ts              # Data access layer (Prisma queries + position logic)
└── schemas/
    └── list.ts          # Zod validation schemas

app/(authenticated)/(dashboard)/boards/[boardId]/
├── page.tsx             # Server Component (existing — add list fetching)
├── actions.ts           # Server Actions (NEW — list CRUD actions)
└── board-content.tsx    # Client Component (NEW — kanban layout)

components/boards/
├── list-column.tsx      # Client Component (single list with inline edit + menu)
├── add-list-button.tsx  # Client Component (inline create form)
└── card-placeholder.tsx # Simple card for layout visualization
```

**Action location decision:** Create `app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts` for list-specific actions. This keeps list actions colocated with the board route that uses them, separate from workspace-level board actions in `boards/actions.ts`.

### Page Integration

The existing `boards/[boardId]/page.tsx` renders `BoardHeader` inside a themed shell. **BoardHeader stays unchanged.** The new `BoardContent` component replaces only the lower placeholder panel (currently showing "Kanban view").

```
BoardPage (Server Component) — EXISTING, MODIFIED
│ ├── fetch board (existing)
│ ├── verify membership (existing)
│ ├── fetch lists ordered by position (NEW)
│ └── derive permission flags (NEW)
│
├── BoardHeader (existing — unchanged)
│
└── BoardContent (Client Component — NEW, replaces placeholder)
    │ props: { board, lists, canCreateList, canUpdateList, canDeleteList }
    │
    └── ScrollArea (orientation="horizontal", className="flex-1")
        └── div (className="flex gap-4 p-4 h-full")
            │
            ├── ListColumn × N
            │   ├── CardHeader (inline editable title + DropdownMenu)
            │   ├── CardContent (CardPlaceholder × N)
            │   └── CardFooter (disabled "Add card" button)
            │
            └── AddListButton (w-72, inline form)
```

### Route-Level States

The existing route already has:
- `loading.tsx` — shows while board loads (now also covers list loading)
- `error.tsx` — error boundary for fetch failures
- `notFound()` — called when board doesn't exist or is archived

These continue to work. List fetching happens in the same server component as board fetching, so existing loading/error states apply.

## Data Model

### Existing Prisma Schema (List)

```prisma
model List {
  id        String   @id @default(uuid())
  boardId   String
  board     Board    @relation(fields: [boardId], references: [id], onDelete: Cascade)
  title     String
  position  Float    # Gap-based ordering (Planka pattern)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  cards Card[]

  @@index([boardId, position])
  @@map("list")
}
```

### Position Strategy

- **GAP = 16384**: Initial spacing between items
- **Append only** (for now): `newPosition = lastList.position + GAP` or `GAP` if first list
- **Sort order**: `position ASC, createdAt ASC` (secondary key for stability on concurrent creates)
- **Reorder logic**: Deferred — add midpoint positioning when drag-drop is implemented

## UI Components

### ListColumn

Single list container using shadcn Card.

**Layout:**
- `w-72 shrink-0 flex flex-col max-h-[calc(100vh-12rem)]`
- Fixed width, doesn't compress, expands down to viewport limit

**Behavior:**
- Click title → inline Input → Enter saves, Escape cancels, blur saves (guarded)
- DropdownMenu with "Delete list" option
- Delete shows AlertDialog confirmation (cascades to cards)

**State:**
- `isEditing: boolean`
- `isPending: boolean` (useTransition)
- `skipBlurSaveRef: boolean` (guard blur when opening menu)

### AddListButton

Inline form for creating new lists.

**Collapsed state:**
- Ghost button with dashed border: "+ Add list"
- `w-72 shrink-0` to match ListColumn width

**Expanded state:**
- Input for title (auto-focused)
- Save + Cancel buttons
- Enter submits, Escape cancels

**Pending state:**
- Input and buttons disabled during submission
- Show loading indicator on Save button

**Error state:**
- Form stays open on validation/server error
- Error message shown below input (inline, red text)
- Input remains focused for correction

### CardPlaceholder

Static cards for layout visualization.

**Content:** Title text only  
**Style:** shadcn Card, subtle styling  
**Data:** Deterministic hardcoded array per list (not random — avoids hydration mismatch)

## Server Actions

All actions are in `app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts`.

### createListAction

```typescript
"use server"

Input: FormData { boardId: string, title: string }

Flow:
1. Parse with Zod (title: 1-100 chars, trimmed)
2. verifySession() → get userId
3. Load board from DB by boardId
4. If board not found or archived → return { success: false, error: "Board not found" }
5. hasWorkspacePermission(board.workspaceId, { list: ["create"] })
6. If no permission → return { success: false, error: "Board not found" }
7. Calculate position via lib/list.ts (append logic)
8. Insert list
9. revalidatePath(`/boards/${boardId}`)

Return: { success: true, listId: string } | { success: false, error: string }
```

### updateListAction

```typescript
"use server"

Input: FormData { listId: string, title: string }

Flow:
1. Parse with Zod
2. verifySession()
3. Load list → board from DB
4. If list/board not found → return { success: false, error: "List not found" }
5. hasWorkspacePermission(board.workspaceId, { list: ["update"] })
6. If no permission → return { success: false, error: "List not found" }
7. Update list title
8. revalidatePath(`/boards/${list.boardId}`)

Return: { success: true } | { success: false, error: string }
```

### deleteListAction

```typescript
"use server"

Input: FormData { listId: string }

Flow:
1. Parse with Zod (listId: uuid)
2. verifySession()
3. Load list → board from DB
4. If list/board not found → return { success: false, error: "List not found" }
5. hasWorkspacePermission(board.workspaceId, { list: ["delete"] })
6. If no permission → return { success: false, error: "List not found" }
7. Delete list (cards cascade via Prisma onDelete)
8. revalidatePath(`/boards/${list.boardId}`)

Return: { success: true } | { success: false, error: string }
```

## Data Access Layer (lib/list.ts)

```typescript
import "server-only";
import db from "@/lib/prisma";

const LIST_POSITION_GAP = 16384;

export type ListRecord = {
  id: string;
  boardId: string;
  title: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

// Fetch all lists for a board, ordered
export async function getListsByBoardId(boardId: string): Promise<ListRecord[]>

// Create list with auto-calculated position (append)
export async function createList(data: {
  boardId: string;
  title: string;
}): Promise<ListRecord>

// Update list title
export async function updateListTitle(listId: string, title: string): Promise<ListRecord>

// Delete list (cards cascade)
export async function deleteList(listId: string): Promise<void>

// Get list with board (for auth checks in actions)
export async function getListWithBoard(listId: string): Promise<{
  list: ListRecord;
  board: { id: string; workspaceId: string; archivedAt: Date | null };
} | null>
```

Position calculation is encapsulated here — actions don't need to know about gaps.

## Validation Schemas (lib/schemas/list.ts)

```typescript
import { z } from "zod";

export const createListSchema = z.object({
  boardId: z.string().uuid({ message: "Invalid board ID" }),
  title: z
    .string()
    .trim()
    .min(1, { message: "Title is required" })
    .max(100, { message: "Title must be 100 characters or less" }),
});

export const updateListSchema = z.object({
  listId: z.string().uuid({ message: "Invalid list ID" }),
  title: z
    .string()
    .trim()
    .min(1, { message: "Title is required" })
    .max(100, { message: "Title must be 100 characters or less" }),
});

export const deleteListSchema = z.object({
  listId: z.string().uuid({ message: "Invalid list ID" }),
});
```

## Layout Behavior

### Horizontal Scrolling
- `ScrollArea` (shadcn) wraps the list container
- `orientation="horizontal"` for horizontal scrollbar
- Lists don't compress — they scroll off-screen

### Vertical Expansion
- Each ListColumn expands down as cards are added
- `max-h-[calc(100vh-12rem)]` stops at viewport bottom
- Internal vertical scroll deferred (add `overflow-y-auto` to CardContent later)

### Tailwind Classes Summary

```
ScrollArea:     flex-1
Container:      flex gap-4 p-4 h-full
ListColumn:     w-72 shrink-0 flex flex-col max-h-[calc(100vh-12rem)]
CardContent:    flex-1 flex flex-col gap-2 p-2
AddListButton:  w-72 shrink-0 border-dashed
```

## shadcn Components Used

| Component      | Usage                              |
| -------------- | ---------------------------------- |
| ScrollArea     | Horizontal scroll for list container |
| Card           | List columns + card placeholders   |
| Input          | Inline title editing               |
| Button         | Add list, save, cancel             |
| DropdownMenu   | List actions (delete)              |
| AlertDialog    | Delete confirmation                |

## Inline Edit Pattern

Reuse pattern from `BoardHeader`:

1. **Click title** → show Input, auto-focus
2. **Enter** → save if valid, keep open if invalid with error
3. **Escape** → cancel, revert to original
4. **Blur** → save if changed and valid (guarded)

**Blur guard (`skipBlurSaveRef`):**
- Set to `true` when opening DropdownMenu
- Check in blur handler — if true, don't save
- Reset after menu closes

**Edge cases:**
- Empty/whitespace-only title → show inline error, keep input open
- Unchanged title → no-op, just close input
- Concurrent saves → useTransition handles pending state

## Error Handling

Error messages by scenario:

| Scenario | Error Message |
| --- | --- |
| Validation failed (empty title) | "Title is required" |
| Validation failed (too long) | "Title must be 100 characters or less" |
| Board not found | "Board not found" |
| Board archived | "Board not found" |
| List not found | "List not found" |
| Permission denied | "List not found" (generic for security) |
| Server error | "Failed to [create/update/delete] list. Please try again." |

**Display:**
- Inline feedback only — no modals for errors
- Error text below input in AddListButton
- Toast/inline message for ListColumn rename errors

## Delete Behavior

- **Hard delete** (not soft delete like Board)
- Cascades to all cards in the list (Prisma onDelete: Cascade)
- Requires AlertDialog confirmation before delete
- Future: Add `archivedAt` to List model if undo/restore needed

## Testing Considerations

- Create list → appears at end
- Rename list → inline edit, saves on enter/blur
- Delete list → confirmation, removes list and cards
- Empty board → only "Add list" button visible
- Permission denied → actions fail gracefully with generic error
- Concurrent creates → stable sort prevents jitter
- Board archived → page shows notFound()

## Future Extensions

When adding these features, modify:

| Feature              | Changes Needed                                                            |
| -------------------- | ------------------------------------------------------------------------- |
| Drag-and-drop reorder | Add @dnd-kit, reorderListAction, midpoint position calc in lib/list.ts |
| Card CRUD            | Add card components inside ListColumn, card actions                       |
| Vertical scroll      | Add `overflow-y-auto` to CardContent when cards overflow                  |
| Realtime sync        | Emit Socket.io events after successful mutations                          |
| List archive         | Add `archivedAt` to List model, change delete to soft delete             |
