# AGENTS.md — Planora

## Project Overview

Planora is a Trello-like project management app (kanban boards, lists, cards).

**Stack:** Next.js 16 (App Router, React 19), TypeScript 5, Prisma 7 (PostgreSQL
via `@prisma/adapter-pg`), Better Auth (organization plugin), Tailwind CSS 4,
shadcn/ui (radix-vega style), Hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`).

**Architecture:** All mutations go through Server Actions → Prisma → DB. No
separate backend. Socket.io planned for realtime broadcast only (not source of
truth). Client state via Zustand (planned).

---

## Build / Dev / Lint Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build (type-checks included)
npm run start        # Start production server
npm run lint         # ESLint (eslint-config-next: core-web-vitals + typescript)
```

### Prisma

```bash
npx prisma generate              # Regenerate Prisma client (output: app/generated/prisma/)
npx prisma migrate dev            # Create & apply migration in dev
npx prisma migrate deploy         # Apply pending migrations in production
npx prisma db push                # Push schema without migration (prototyping)
npx prisma studio                 # Visual DB browser
```

Config: `prisma.config.ts` (schema at `prisma/schema.prisma`, migrations at
`prisma/migrations/`). The Prisma client is generated to `app/generated/prisma/`.

### Tests

No test framework is configured yet. When adding tests, use the conventions from
the Next.js ecosystem (Vitest or Jest + React Testing Library). Run a single
test with:

```bash
npx vitest run path/to/file.test.ts          # single file
npx vitest run -t "test name"                # single test by name
```

---

## Project Structure

```
app/                    # Next.js App Router pages and routes
  api/auth/[...all]/    # Better Auth catch-all route handler
  generated/prisma/     # AUTO-GENERATED — never edit manually
  layout.tsx            # Root layout (Inter font, Geist Mono)
  page.tsx              # Landing page
  globals.css           # Tailwind + shadcn theme variables (oklch)
components/
  ui/                   # shadcn/ui components (button.tsx, etc.)
lib/
  auth.ts               # Better Auth server config (prismaAdapter, organization plugin)
  auth-client.ts        # Better Auth React client (signIn, signUp, useSession, etc.)
  permissions.ts        # RBAC: admin/editor/viewer roles via better-auth access control
  prisma.ts             # Singleton PrismaClient with PrismaPg adapter
  utils.ts              # cn() helper (clsx + tailwind-merge)
prisma/
  schema.prisma         # Database schema (all models)
  migrations/           # Prisma migrations
docs/plans/             # Design documents
```

---

## Code Style Guidelines

### TypeScript

- **Strict mode** is enabled (`"strict": true` in tsconfig).
- Target: ES2017. Module: ESNext with bundler resolution.
- Path alias: `@/*` maps to project root (e.g., `@/lib/utils`, `@/components/ui`).
- Prefer `type` imports when importing only types: `import type { Metadata } from "next"`.
- Use explicit return types on exported functions when not obvious from context.

### Imports

Order imports in this sequence (with blank line separators):
1. External packages (`react`, `next`, `better-auth`, etc.)
2. Internal absolute imports (`@/lib/...`, `@/components/...`)
3. Relative imports (`./`, `../`)

```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import prisma from "./prisma";
import { ac, admin, editor, viewer } from "./permissions";
```

### Formatting

- **No semicolons** in shadcn/ui component files (follows shadcn convention).
- **Semicolons** in lib/ and other application code.
- Double quotes for strings.
- Trailing commas in multi-line structures.
- 2-space indentation.

### Naming Conventions

| Entity              | Convention             | Example                        |
| ------------------- | ---------------------- | ------------------------------ |
| React components    | PascalCase             | `RootLayout`, `Button`         |
| Component files     | kebab-case `.tsx`      | `button.tsx`                   |
| Utility files       | kebab-case `.ts`       | `auth-client.ts`               |
| Functions/variables | camelCase              | `buttonVariants`, `signIn`     |
| Types/interfaces    | PascalCase             | `Session`, `ClassValue`        |
| Constants           | camelCase or UPPER     | `ac`, `admin`, `URGENT`        |
| Prisma models       | PascalCase             | `Board`, `CardMember`          |
| Prisma enums        | PascalCase + UPPER val | `Priority.URGENT`              |
| DB table names      | camelCase (`@@map`)    | `boardStar`, `workspaceMember` |
| CSS variables       | kebab-case             | `--font-sans`, `--color-primary` |

### React / Next.js Patterns

- Use **React Server Components** by default (no `"use client"` unless needed).
- Use `React.ComponentProps<"element">` for extending HTML element props.
- Use the `cn()` utility from `@/lib/utils` for conditional class merging.
- Prefer function declarations for components: `function Button({ ... }) { }`.
- Destructure props in function signature with default values inline.
- Use `Readonly<{ children: React.ReactNode }>` for layout props.

### Styling

- **Tailwind CSS 4** with `@tailwindcss/postcss`. No `tailwind.config` file — use
  CSS-based config in `app/globals.css`.
- shadcn/ui theme uses **oklch** color values with CSS custom properties.
- Design tokens defined as CSS variables in `:root` and `.dark`.
- Use shadcn component variants (via `class-variance-authority`).
- Dark mode: `@custom-variant dark (&:is(.dark *))`.

### Database / Prisma

- All models use `@@map("camelCase")` to map to camelCase table names.
- IDs: Better Auth models use `String @id` (BA generates IDs). App models use
  `String @id @default(uuid())`.
- Ordering uses `Float` position fields (gap-based, Planka pattern).
- Soft delete via `archivedAt DateTime?` (not hard delete).
- Cascade deletes: workspace → boards → lists → cards → (members, labels,
  checklists, comments, attachments).
- Always add `@@index` for foreign keys used in queries.

### Auth / Permissions

- Better Auth handles all auth via catch-all route at `app/api/auth/[...all]/`.
- Three roles: `admin` (full control), `editor` (content CRUD), `viewer` (comments only).
- Organization plugin maps: organization → `workspace`, member → `workspaceMember`.
- Use `auth.api.hasPermission()` server-side for authorization checks.

### Error Handling

- Let Prisma throw on constraint violations; handle in Server Actions.
- Use Next.js error boundaries (`error.tsx`) for page-level errors.
- Validate inputs at the Server Action boundary before DB operations.

### Do NOT Edit

- `app/generated/prisma/` — auto-generated by `npx prisma generate`.
- `components/ui/` — managed by shadcn CLI (`npx shadcn add <component>`).
  Customize only if necessary, and note deviations.

