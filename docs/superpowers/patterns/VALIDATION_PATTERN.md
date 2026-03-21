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
  (data) => data.field !== undefined, // at least one update field
  { message: "At least one field must be updated" }
);

export type Update<Domain>Input = z.infer<typeof update<Domain>Schema>;

// Schema for delete operations
export const delete<Domain>Schema = z.object({
  id: z.string().uuid(),
});
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

## Benefits

- **Type Safety**: `z.infer` automatically generates correct TypeScript types
- **Reusability**: Schemas can be used in multiple places (validation, API docs, etc.)
- **Consistency**: Same pattern across all domains
- **Error Messages**: User-friendly error messages defined in schema
- **Maintainability**: Validation rules live in one place, not scattered

## Examples

See `lib/schemas/board.ts` for a complete example with multiple operations.
