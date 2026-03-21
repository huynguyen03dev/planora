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

Follows existing Board CRUD patterns exactly.

### File Structure

```
lib/
├── list.ts              # Data access layer (Prisma queries + position logic)
└── schemas/
    └── list.ts          # Zod validation schemas

app/(authenticated)/(dashboard)/boards/[boardId]/
├── page.tsx             # Server Component (fetch board + lists)
├── actions.ts           # Server Actions (list CRUD) — add to existing or create
└── board-content.tsx    # Client Component (layout orchestration)

components/boards/
├── list-column.tsx      # Client Component (single list with inline edit + menu)
├── add-list-button.tsx  # Client Component (inline create form)
└── card-placeholder.tsx # Simple card for layout visualization
```

### Component Tree

```
BoardPage (Server Component)
│ ├── fetch board, verify membership
│ ├── fetch lists ordered by position
│ └── derive permission flags (canCreateList, canUpdateList, canDeleteList)
│
└── BoardContent (Client Component)
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
- Input for title
- Save + Cancel buttons
- Auto-focus on expand
- Enter submits, Escape cancels

### CardPlaceholder

Static cards for layout visualization.

**Content:** Title text only  
**Style:** shadcn Card, subtle styling  
**Data:** Hardcoded array per list (3-5 sample cards)

## Server Actions

### createList

```typescript
Input: { boardId: string, title: string }

Flow:
1. Parse with Zod (title: 1-100 chars, trimmed)
2. verifySession() → get userId
3. Load board from DB by boardId
4. hasWorkspacePermission(board.workspaceId, { list: ["create"] })
5. Calculate position via lib/list.ts (append logic)
6. Insert list
7. revalidatePath(`/boards/${boardId}`)

Return: { success: true, listId: string } | { success: false, error: string }
```

### updateList

```typescript
Input: { listId: string, title: string }

Flow:
1. Parse with Zod
2. verifySession()
3. Load list → board from DB
4. hasWorkspacePermission(board.workspaceId, { list: ["update"] })
5. Update list title
6. revalidatePath(`/boards/${list.boardId}`)

Return: { success: true } | { success: false, error: string }
```

### deleteList

```typescript
Input: { listId: string }

Flow:
1. Parse with Zod (listId: uuid)
2. verifySession()
3. Load list → board from DB
4. hasWorkspacePermission(board.workspaceId, { list: ["delete"] })
5. Delete list (cards cascade via Prisma onDelete)
6. revalidatePath(`/boards/${list.boardId}`)

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
  board: { id: string; workspaceId: string };
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

- **Validation errors**: Show first field error inline
- **Permission denied**: Generic "List not found" message
- **Server errors**: "Failed to [action]. Please try again."
- **No modals for errors** — inline feedback only

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
- Permission denied → actions fail gracefully
- Concurrent creates → stable sort prevents jitter

## Future Extensions

When adding these features, modify:

| Feature              | Changes Needed                                                            |
| -------------------- | ------------------------------------------------------------------------- |
| Drag-and-drop reorder | Add @dnd-kit, reorderList action, midpoint position calc in lib/list.ts |
| Card CRUD            | Add card components inside ListColumn, card actions                       |
| Vertical scroll      | Add `overflow-y-auto` to CardContent when cards overflow                  |
| Realtime sync        | Emit Socket.io events after successful mutations                          |
| List archive         | Add `archivedAt` to List model, change delete to soft delete             |
