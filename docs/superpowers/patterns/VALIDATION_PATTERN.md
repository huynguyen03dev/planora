# Zod Validation Pattern

## Overview

All Server Action validation uses Zod schemas organized in `lib/schemas/` by domain.

## Pattern

### 1. Create Domain Schema File

Create `lib/schemas/<domain>.ts`:

```typescript
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
  (data) => Object.values(data).some(v => v !== undefined),
  { message: "At least one field must be updated" }
);

export type Update<Domain>Input = z.infer<typeof update<Domain>Schema>;

// Schema for delete operations
export const delete<Domain>Schema = z.object({
  id: z.string().uuid(),
});

export type Delete<Domain>Input = z.infer<typeof delete<Domain>Schema>;
```

### 2. Export from Index

Add to `lib/schemas/index.ts`:

```typescript
export {
  create<Domain>Schema,
  update<Domain>Schema,
  delete<Domain>Schema,
  type Create<Domain>Input,
  type Update<Domain>Input,
  type Delete<Domain>Input,
} from "./<domain>";
```

### 3. Use in Server Action

```typescript
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
```

## Production Patterns

Real-world implementations should include:

### Custom Error Messages

Instead of generic errors, provide context:

```typescript
export const updateListSchema = z.object({
  id: z.string().uuid("Invalid list ID"),
  title: z
    .string({ message: "List title is required" })
    .trim()
    .min(1, "List title too short")
    .max(255, "List title too long")
    .optional(),
});
```

### Field Validation with Enum/Set

For fields with constrained values (colors, statuses, etc.):

```typescript
const VALID_COLORS = new Set(["red", "blue", "green", "yellow"]);

export const updateCardSchema = z.object({
  id: z.string().uuid("Invalid card ID"),
  color: z
    .string()
    .refine((c) => VALID_COLORS.has(c), "Invalid color")
    .optional(),
});
```

### Workspace Isolation (Security)

Always validate workspace membership in the Server Action to prevent data leaks:

```typescript
export const createListSchema = z.object({
  boardId: z.string().uuid("Invalid board ID"),
  title: z.string({ message: "Title required" }).trim().min(1).max(255),
});

// In Server Action, validate authorization:
export async function createListAction(workspaceId: string, formData: FormData) {
  const parsed = createListSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: "Validation failed" };
  }

  // Verify user has access to workspace + board belongs to workspace
  const session = await auth.api.getSession();
  if (!session || !hasPermission(session, workspaceId)) {
    return { success: false, error: "Unauthorized" };
  }

  // ... proceed with mutation
}
```

### String Normalization

Always trim user input and set min/max constraints:

```typescript
export const createBoardSchema = z.object({
  title: z
    .string({ message: "Title required" })
    .trim()
    .min(1, "Title too short")
    .max(255, "Title too long"),
  description: z.string().trim().max(500).optional(),
});
```

## Benefits

- **Type Safety**: `z.infer` automatically generates correct TypeScript types
- **Reusability**: Schemas can be used in multiple places (validation, API docs, etc.)
- **Consistency**: Same pattern across all domains
- **Error Messages**: User-friendly error messages defined in schema
- **Maintainability**: Validation rules live in one place, not scattered

## Examples

See `lib/schemas/board.ts` for a complete example with multiple operations.
