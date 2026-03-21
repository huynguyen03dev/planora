# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

### Essential Commands

```bash
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Production build
npm run start            # Start production server (requires npm run build)
npm run lint             # ESLint check
npx prisma migrate dev   # Create & apply migration
npx prisma studio       # Visual DB browser
```

---

## Architecture Overview

### Data Flow

Planora uses a **server-first architecture** with no separate backend:

1. **Client (Next.js)**: React 19 components (Server Components by default)
2. **Server Actions**: Form submissions → Server Actions in `app/**/actions.ts` (colocated with page logic, not in `api/` directory)
3. **Database**: Mutations go through **Prisma ORM** → **PostgreSQL** (via `@prisma/adapter-pg`)
4. **Real-time (planned)**: Socket.io will broadcast events only; Prisma remains source of truth

**Why this matters**: All data writes must go through Server Actions. Direct client API calls are not the pattern—use form actions or `useTransition` hooks for async mutations.

### Key Design Decisions

#### Prisma Setup
- **Client location**: Generated to `app/generated/prisma/client.ts` (auto-generated, never edit)
- **Singleton pattern**: `lib/prisma.ts` uses global singleton to avoid connection pool exhaustion
- **Adapter**: Using `@prisma/adapter-pg` for better PostgreSQL support (required for `nodePostgres` connection string parsing)
- **Database URL**: Must use `postgresql://` connection string with `?schema=public`

#### Better Auth + Organization Plugin
- **Role mapping**: Better Auth's `organization` plugin maps to:
  - `organization` → `workspace` (Prisma model)
  - `member` → `workspaceMember` (Prisma model)
- **Roles**: `admin` (full control), `editor` (content CRUD), `viewer` (comments only)
- **Auth flow**: All routes go through `app/api/auth/[...all]/route.ts` (Better Auth catch-all)
- **Session management**: Client uses `useSession()` hook from `lib/auth-client.ts`

#### Ordering Pattern (Important)
- Uses **float-based gap ordering** (Planka pattern): `position: Float`
- Allows drag-and-drop without renumbering all items
- When inserting between two items at positions 1.0 and 2.0, use position 1.5
- Not just sequence numbers like 1, 2, 3, 4

#### Soft Deletes
- Models use `archivedAt DateTime?` instead of hard deletes
- Queries should filter `where: { archivedAt: null }` unless explicitly restoring
- Enables undo functionality and audit trails

#### Cascade Deletes
- Workspace → Boards → Lists → Cards → (members, labels, checklists, comments, attachments)
- Define with `@relation(..., onDelete: Cascade)` in Prisma
- Always add `@@index` for foreign keys used in queries

#### Tailwind CSS v4
- No `tailwind.config.ts` file—configuration is CSS-based in `app/globals.css`
- Uses `@tailwindcss/postcss` plugin
- shadcn/ui theme uses **oklch** color space with CSS custom properties
- Dark mode via `@custom-variant dark (&:is(.dark *))`

---

## Environment Setup

### Required Environment Variables

```bash
# PostgreSQL connection (includes schema)
DATABASE_URL="postgresql://user:password@host:5432/dbname?schema=public"

# Better Auth (generate a secure random string)
BETTER_AUTH_SECRET="<generate-with: openssl rand -base64 32>"

# Better Auth knows where the app is running
BETTER_AUTH_URL="http://localhost:3000"
```

### Database Setup

1. **First time**: `npx prisma migrate dev` creates database and tables
2. **After schema changes**: `npx prisma migrate dev --name description` creates migration
3. **In production**: `npx prisma migrate deploy` applies pending migrations
4. **Prototyping only**: `npx prisma db push` (no migration file, don't use in production)

---

## Common Gotchas & Patterns

### 1. Prisma Client Import Path
Always import from `app/generated/prisma/client`, not `@prisma/client`:
```typescript
import { PrismaClient } from "@/app/generated/prisma/client";
```

This prevents conflicts with the PrismaPg adapter and ensures you're using the generated client.

### 2. Server Actions Must Return Serializable Data
Server Actions serialize results (JSON). Avoid returning:
- Prisma model instances with non-serializable fields
- Functions, Dates (they serialize, but deserialize as strings)
- Circular references

Solution: Transform Prisma results before returning:
```typescript
const board = await prisma.board.findUnique({ ... });
return { id: board.id, title: board.title }; // plain object
```

### 3. Workspace Isolation
Most queries need `where: { workspace_id: workspaceId }` to prevent data leaks. Always validate `workspaceId` matches the user's session first.

### 4. Type-Safe IDs with Prisma
All IDs are `String`, generated as `@default(uuid())`. Use UUID validation when reading from user input.

### 5. Query Optimization
Always use `select` or `include` to avoid fetching unnecessary relations:
```typescript
// ❌ Fetches everything
const board = await prisma.board.findUnique({ where: { id } });

// ✅ Only needed fields
const board = await prisma.board.findUnique({
  where: { id },
  include: { lists: { select: { id: true, title: true } } },
});
```

### 6. Better Auth Permissions
- Use `auth.api.hasPermission()` server-side for authorization
- Permissions are checked against session's workspace role
- Always validate before mutations

### 7. shadcn/ui Component Customization
- Components in `components/ui/` are auto-managed by shadcn CLI
- If you customize, add a comment: `// customized: [reason]`
- Avoid syncing updates with `npx shadcn@latest update <component>` after customization

---

## Development Workflows

### Adding a New Model

1. **Add to schema** (`prisma/schema.prisma`):
   - Set `@@map("camelCaseName")` for table
   - Add `@@index` for foreign key columns
   - Use UUID: `@default(uuid())` for IDs

2. **Create migration**:
   ```bash
   npx prisma migrate dev --name add_model_name
   ```

3. **Regenerate Prisma client**:
   ```bash
   npx prisma generate
   ```

4. **Create Server Action** (`app/**/actions.ts`):
   - Import from `@/app/generated/prisma/client`
   - Validate workspace isolation
   - Return serializable data

### Adding a New Feature (Board, List, Card)

1. **Define schema** and migrate
2. **Create Server Action** for mutations
3. **Add shadcn component** for UI (`npx shadcn@latest add <component>`)
4. **Create client component** with `"use client"` for interactivity
5. **Wire up in layout** (use server-side data fetching where possible)

### Debugging Prisma Queries

```bash
# Visual DB browser
npx prisma studio

# Inspect generated SQL
await prisma.$queryRaw`SELECT ...`

# Logging (set in .env or code)
const prisma = new PrismaClient({ log: ['query', 'error'] });
```

### Testing a Server Action

Server Actions are pure functions. Test them like:
```typescript
import { createBoard } from "@/app/actions";
const result = await createBoard(workspaceId, "New Board");
```

No test framework is configured yet. When adding tests, use Vitest + React Testing Library (Next.js standard).

---

## Notable File Locations

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout (fonts, global styles) |
| `app/globals.css` | Tailwind config, theme variables, shadcn styles |
| `app/api/auth/[...all]/route.ts` | Better Auth catch-all handler |
| `lib/auth.ts` | Better Auth server config (database, roles, plugins) |
| `lib/auth-client.ts` | Better Auth React client (useSession, signIn, etc.) |
| `lib/prisma.ts` | Prisma singleton (never import PrismaClient directly) |
| `lib/permissions.ts` | RBAC role definitions (admin, editor, viewer) |
| `prisma/schema.prisma` | Database schema (all models, enums, relations) |
| `app/generated/prisma/` | Auto-generated Prisma client (never edit) |
| `components/ui/` | shadcn/ui components (managed by CLI) |

---

## Performance & Best Practices

### Avoid N+1 Queries
```typescript
// ❌ N+1: fetches board, then N queries for lists
const boards = await prisma.board.findMany();
const listsPerBoard = await Promise.all(
  boards.map(b => prisma.list.findMany({ where: { boardId: b.id } }))
);

// ✅ Single query with include
const boards = await prisma.board.findMany({
  include: { lists: true }
});
```

### Use Database Indexes
Always add `@@index` for frequently queried foreign keys:
```prisma
model Card {
  id String @id @default(uuid())
  listId String
  list List @relation(fields: [listId], references: [id], onDelete: Cascade)

  @@index([listId])  // ← speeds up findMany(where: { listId })
}
```

### Pagination
For large lists, use cursor-based pagination with Prisma:
```typescript
const items = await prisma.item.findMany({
  take: 10,
  skip: 1, // skip the cursor itself
  cursor: { id: cursorId },
  orderBy: { createdAt: 'desc' }
});
```

---

## Stack Summary

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16 (App Router, React 19) |
| **Language** | TypeScript 5 (strict mode) |
| **Database** | PostgreSQL (via `@prisma/adapter-pg`) |
| **ORM** | Prisma 7 (auto-generated to `app/generated/`) |
| **Auth** | Better Auth (organization plugin) |
| **Styling** | Tailwind CSS 4 (@tailwindcss/postcss, no config file) |
| **Components** | shadcn/ui + radix-ui (oklch theme) |
| **Icons** | Hugeicons (@hugeicons/react) |
| **State** | Zustand (planned for client state) |
| **Real-time** | Socket.io (planned, broadcast only) |
| **Linting** | ESLint 9 + eslint-config-next |


<!-- br-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`/`bd`) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View ready issues (unblocked, not deferred)
br ready              # or: bd ready

# List and search
br list --status=open # All open issues
br show <id>          # Full issue details with dependencies
br search "keyword"   # Full-text search

# Create and update
br create --title="..." --description="..." --type=task --priority=2
br update <id> --status=in_progress
br close <id> --reason="Completed"
br close <id1> <id2>  # Close multiple issues at once

# Sync with git
br sync --flush-only  # Export DB to JSONL
br sync --status      # Check sync status
```

### Workflow Pattern

1. **Start**: Run `br ready` to find actionable work
2. **Claim**: Use `br update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `br close <id>`
5. **Sync**: Always run `br sync --flush-only` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `br ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers 0-4, not words)
- **Types**: task, bug, feature, epic, chore, docs, question
- **Blocking**: `br dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
br sync --flush-only    # Export beads changes to JSONL
git commit -m "..."     # Commit everything
git push                # Push to remote
```

### Best Practices

- Check `br ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `br create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always sync before ending session

<!-- end-br-agent-instructions -->
