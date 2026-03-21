# Zod Validation Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual validation functions with centralized Zod schemas, establishing a reusable pattern for all Server Action validation across the app.

**Architecture:** Create a `lib/schemas/` directory organized by domain (board, list, card, etc). Each domain file exports validation schemas that are imported into Server Actions. Schemas define structure, validation rules, and automatically generate TypeScript types. This replaces the current manual validation in `lib/board-validation.ts`.

**Tech Stack:** Zod 3.x (already installed), TypeScript 5, Next.js Server Actions

---

## File Structure

### New Files to Create

```
lib/schemas/
├── board.ts          # Board create/update schemas
├── list.ts           # List create/update schemas (future)
├── card.ts           # Card create/update schemas (future)
└── index.ts          # Export all schemas for easy importing
```

### Files to Modify

```
app/(authenticated)/(dashboard)/boards/actions.ts
  - Replace manual validation with Zod schemas
  - Simplify server action code
  - Keep same API (return types unchanged)

lib/board-validation.ts
  - DELETE (no longer needed, replaced by Zod)
```

---

## Task 1: Create Board Zod Schemas

**Files:**
- Create: `lib/schemas/board.ts`

**Purpose:** Define all validation rules for board operations in one place using Zod.

- [ ] **Step 1: Create the board schemas file**

```typescript
// lib/schemas/board.ts
import { z } from "zod";
import { BOARD_COLORS, DEFAULT_BOARD_COLOR, MAX_BOARD_TITLE_LENGTH, MIN_BOARD_TITLE_LENGTH } from "@/lib/constants";

// Helper: validate board colors exist
const boardColorSet = new Set<string>(BOARD_COLORS.map((color) => color.value));

// Schema for creating a workspace
export const createWorkspaceSchema = z.object({
  workspaceName: z
    .string({ message: "Workspace name is required" })
    .trim()
    .min(2, "Workspace name must be at least 2 characters")
    .max(64, "Workspace name must be 64 characters or less"),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

// Schema for creating a board
export const createBoardSchema = z.object({
  workspaceId: z.string({ message: "Workspace is required" }).uuid("Invalid workspace ID"),
  title: z
    .string({ message: "Board title is required" })
    .trim()
    .min(MIN_BOARD_TITLE_LENGTH, "Board title is required")
    .max(MAX_BOARD_TITLE_LENGTH, `Board title must be ${MAX_BOARD_TITLE_LENGTH} characters or less`),
  backgroundColor: z
    .string({ message: "Invalid board color" })
    .refine(
      (color) => boardColorSet.has(color),
      "Invalid board color"
    )
    .optional()
    .default(DEFAULT_BOARD_COLOR),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;

// Schema for updating a board
export const updateBoardSchema = z.object({
  boardId: z.string({ message: "Board not found" }).uuid("Invalid board ID"),
  title: z
    .string()
    .trim()
    .min(MIN_BOARD_TITLE_LENGTH, "Board title is required")
    .max(MAX_BOARD_TITLE_LENGTH, `Board title must be ${MAX_BOARD_TITLE_LENGTH} characters or less`)
    .optional(),
  backgroundColor: z
    .string()
    .refine(
      (color) => boardColorSet.has(color),
      "Invalid board color"
    )
    .optional(),
}).refine(
  (data) => data.title !== undefined || data.backgroundColor !== undefined,
  { message: "No board updates provided", path: ["title"] }
);

export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;

// Schema for deleting a board (only needs ID)
export const deleteBoardSchema = z.object({
  boardId: z.string({ message: "Board not found" }).uuid("Invalid board ID"),
});

export type DeleteBoardInput = z.infer<typeof deleteBoardSchema>;
```

- [ ] **Step 2: Verify Zod is installed**

Run: `npm ls zod`

Expected: See `zod@5.x.x` (or similar) in output, not "not installed"

- [ ] **Step 3: Commit**

```bash
git add lib/schemas/board.ts
git commit -m "feat(validation): add Zod schemas for board operations"
```

---

## Task 2: Create Schemas Index Export

**Files:**
- Create: `lib/schemas/index.ts`

**Purpose:** Centralize all schema exports for easy importing from `@/lib/schemas` instead of individual files.

- [ ] **Step 1: Create the index file**

```typescript
// lib/schemas/index.ts
export {
  createWorkspaceSchema,
  createBoardSchema,
  updateBoardSchema,
  deleteBoardSchema,
  type CreateWorkspaceInput,
  type CreateBoardInput,
  type UpdateBoardInput,
  type DeleteBoardInput,
} from "./board";
```

- [ ] **Step 2: Commit**

```bash
git add lib/schemas/index.ts
git commit -m "feat(validation): add schemas index for centralized exports"
```

---

## Task 3: Refactor Board Actions to Use Zod

**Files:**
- Modify: `app/(authenticated)/(dashboard)/boards/actions.ts`

**Purpose:** Replace manual FormData parsing and validation with Zod schema validation. Keep the same function signatures and return types.

- [ ] **Step 1: Update imports and remove old validation**

Replace the imports section with:

```typescript
// app/(authenticated)/(dashboard)/boards/actions.ts
"use server";

import { refresh, revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { getBoardById, createBoard, updateBoard, deleteBoard } from "@/lib/board";
import { hasWorkspacePermission } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import { createWorkspaceForCurrentUser } from "@/lib/workspace";
import {
  createWorkspaceSchema,
  createBoardSchema,
  updateBoardSchema,
  deleteBoardSchema,
  type CreateBoardInput,
  type UpdateBoardInput,
} from "@/lib/schemas";

// ... keep all existing result types (CreateWorkspaceResult, CreateBoardResult, etc.)
```

Remove the old imports:
- `normalizeBoardColor, normalizeBoardTitle, validateBoardColor, validateBoardTitle` from `@/lib/board-validation`

- [ ] **Step 2: Refactor createWorkspaceAction**

```typescript
export async function createWorkspaceAction(
  formData: FormData,
): Promise<CreateWorkspaceResult> {
  await verifySession();

  // Parse and validate using Zod schema
  const rawData = Object.fromEntries(formData);
  const parsed = createWorkspaceSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Workspace name is required" };
  }

  try {
    const workspace = await createWorkspaceForCurrentUser(parsed.data.workspaceName);
    revalidatePath("/boards");

    return { success: true, workspaceId: workspace.id };
  } catch {
    return {
      success: false,
      error: "Failed to create workspace. Please try again.",
    };
  }
}
```

- [ ] **Step 3: Refactor createBoardAction**

```typescript
export async function createBoardAction(
  formData: FormData,
): Promise<CreateBoardResult> {
  const { userId } = await verifySession();

  // Parse and validate using Zod schema
  const rawData = Object.fromEntries(formData);
  const parsed = createBoardSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { workspaceId, title, backgroundColor } = parsed.data;

  const canCreateBoard = await hasWorkspacePermission(workspaceId, {
    board: ["create"],
  });

  if (!canCreateBoard) {
    return { success: false, error: "Board not found" };
  }

  try {
    const board = await createBoard({
      workspaceId,
      title,
      backgroundColor,
      createdById: userId,
    });

    revalidatePath("/boards");

    return {
      success: true,
      boardId: board.id,
    };
  } catch {
    return {
      success: false,
      error: "Failed to create board. Please try again.",
    };
  }
}
```

- [ ] **Step 4: Refactor updateBoardAction**

```typescript
export async function updateBoardAction(
  formData: FormData,
): Promise<UpdateBoardResult> {
  await verifySession();

  // Parse and validate using Zod schema
  const rawData = Object.fromEntries(formData);
  const parsed = updateBoardSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { boardId, title, backgroundColor } = parsed.data;

  const board = await getBoardById(boardId);
  if (!board) {
    return { success: false, error: "Board not found" };
  }

  const canUpdateBoard = await hasWorkspacePermission(board.workspaceId, {
    board: ["update"],
  });

  if (!canUpdateBoard) {
    return { success: false, error: "Board not found" };
  }

  const data: { title?: string; backgroundColor?: string } = {};
  if (title !== undefined) {
    data.title = title;
  }
  if (backgroundColor !== undefined) {
    data.backgroundColor = backgroundColor;
  }

  try {
    await updateBoard(boardId, data);
    revalidatePath("/boards");
    revalidatePath(`/boards/${boardId}`);
    refresh();
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Failed to update board. Please try again.",
    };
  }
}
```

- [ ] **Step 5: Refactor deleteBoardAction**

```typescript
export async function deleteBoardAction(boardId: string): Promise<DeleteBoardResult> {
  await verifySession();

  // Validate using Zod schema
  const parsed = deleteBoardSchema.safeParse({ boardId });

  if (!parsed.success) {
    return { success: false, error: "Board not found" };
  }

  const board = await getBoardById(boardId);
  if (!board) {
    return { success: false, error: "Board not found" };
  }

  const canDeleteBoard = await hasWorkspacePermission(board.workspaceId, {
    board: ["delete"],
  });

  if (!canDeleteBoard) {
    return { success: false, error: "Board not found" };
  }

  try {
    await deleteBoard(boardId);
    revalidatePath("/boards");
    revalidatePath(`/boards/${boardId}`);
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Failed to delete board. Please try again.",
    };
  }
}
```

- [ ] **Step 6: Verify the complete refactored file**

Check that:
- No manual `typeof value === "string"` checks remain
- All Zod imports are at the top
- Return types are unchanged
- All validation errors are caught and returned properly

- [ ] **Step 7: Commit**

```bash
git add app/(authenticated)/(dashboard)/boards/actions.ts
git commit -m "refactor: use Zod schemas for board action validation"
```

---

## Task 4: Delete Old Validation File

**Files:**
- Delete: `lib/board-validation.ts`

**Purpose:** Remove the old manual validation file since Zod schemas now handle all board validation.

- [ ] **Step 1: Delete the file**

```bash
rm lib/board-validation.ts
```

- [ ] **Step 2: Verify no other files import from it**

Run: `grep -r "board-validation" app lib`

Expected: No matches

If matches exist, update those files to import from `@/lib/schemas` instead.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove board-validation.ts, replaced by Zod schemas"
```

---

## Task 5: Create Validation Pattern Documentation

**Files:**
- Create: `docs/superpowers/patterns/VALIDATION_PATTERN.md`

**Purpose:** Document the established Zod validation pattern so future developers (including agents) follow the same structure when adding List, Card, Comment validations.

- [ ] **Step 1: Create pattern documentation**

```markdown
# Zod Validation Pattern

## Overview

All Server Action validation uses Zod schemas organized in `lib/schemas/` by domain.

## Pattern

### 1. Create Domain Schema File

Create `lib/schemas/<domain>.ts`:

\`\`\`typescript
import { z } from "zod";

// Schema for create operations
export const create<Domain>Schema = z.object({
  field: z.string().min(1).max(128),
  optionalField: z.string().optional(),
});

export type Create<Domain>Input = z.infer<typeof create<Domain>Schema>;

// Schema for update operations (fields optional)
export const update<Domain>Schema = z.object({
  id: z.string().uuid(),
  field: z.string().min(1).max(128).optional(),
}).refine(
  (data) => data.field !== undefined, // at least one update field
  { message: "At least one field must be updated" }
);

export type Update<Domain>Input = z.infer<typeof update<Domain>Schema>;

// Schema for delete operations
export const delete<Domain>Schema = z.object({
  id: z.string().uuid(),
});
\`\`\`

### 2. Export from Index

Add to `lib/schemas/index.ts`:

\`\`\`typescript
export {
  create<Domain>Schema,
  update<Domain>Schema,
  delete<Domain>Schema,
  type Create<Domain>Input,
  type Update<Domain>Input,
  type Delete<Domain>Input,
} from "./<domain>";
\`\`\`

### 3. Use in Server Action

\`\`\`typescript
export async function create<Domain>Action(formData: FormData) {
  const rawData = Object.fromEntries(formData);
  const parsed = create<Domain>Schema.safeParse(rawData);

  if (!parsed.success) {
    const error = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: error || "Validation failed" };
  }

  // Now parsed.data is fully typed and validated
  const { field } = parsed.data;

  // ... rest of action logic
}
\`\`\`

## Benefits

- **Type Safety**: `z.infer` automatically generates correct TypeScript types
- **Reusability**: Schemas can be used in multiple places (validation, API docs, etc.)
- **Consistency**: Same pattern across all domains
- **Error Messages**: User-friendly error messages defined in schema
- **Maintainability**: Validation rules live in one place, not scattered

## Examples

See `lib/schemas/board.ts` for a complete example with multiple operations.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/patterns/VALIDATION_PATTERN.md
git commit -m "docs: add Zod validation pattern guide"
```

---

## Task 6: Verify No Breaking Changes

**Files:**
- Test: `app/(authenticated)/(dashboard)/boards/actions.ts`

**Purpose:** Ensure the refactored actions still work correctly and maintain the same API contract.

- [ ] **Step 1: Check function signatures haven't changed**

Verify these remain the same:
- `createWorkspaceAction(formData: FormData) → Promise<CreateWorkspaceResult>`
- `createBoardAction(formData: FormData) → Promise<CreateBoardResult>`
- `updateBoardAction(formData: FormData) → Promise<UpdateBoardResult>`
- `deleteBoardAction(boardId: string) → Promise<DeleteBoardResult>`

All return types and parameters should be identical.

- [ ] **Step 2: Run linter to catch any TS errors**

Run: `npm run lint`

Expected: No errors related to the refactored board actions

- [ ] **Step 3: Check for syntax errors**

Run: `npm run build`

Expected: Build succeeds (watch for TS errors in the board actions)

If build fails, fix the TypeScript errors before proceeding.

- [ ] **Step 4: Commit verification success**

```bash
git add -A
git commit -m "chore: verify Zod validation integration - no breaking changes"
```

---

## Future Tasks (Not in This Plan)

These are documented here for reference but will be separate plans:

1. **Add List validation schemas** - `lib/schemas/list.ts` when implementing List CRUD
2. **Add Card validation schemas** - `lib/schemas/card.ts` when implementing Card CRUD
3. **Add Comment validation schemas** - `lib/schemas/comment.ts` when implementing comments
4. **Type all form inputs** - Update UI components to use Zod input types
5. **Add client-side pre-validation** - Use schemas on client for instant feedback (optional: Zod works in browser)

---

## Summary

✅ **Task 1**: Create board Zod schemas
✅ **Task 2**: Create schemas index export
✅ **Task 3**: Refactor board actions to use Zod
✅ **Task 4**: Delete old validation file
✅ **Task 5**: Document the validation pattern
✅ **Task 6**: Verify no breaking changes

**Total estimated effort**: 30-45 minutes
**Commits**: 6 focused commits
**Impact**: Cleaner code, better maintainability, established pattern for future domains
