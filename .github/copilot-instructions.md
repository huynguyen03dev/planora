# Copilot Instructions for Planora

## Build, test, lint, and local DB commands

```bash
# App lifecycle
npm run dev
npm run build
npm run start
npm run lint

# Local PostgreSQL (from README)
docker compose up -d

# Prisma
npx prisma generate
npx prisma migrate dev
npx prisma migrate deploy
npx prisma db push
npx prisma studio
```

Test runner is not wired into `package.json` yet. Current project guidance uses Vitest commands:

```bash
# Single test file
npx vitest run path/to/file.test.ts

# Single test by name
npx vitest run -t "test name"
```

## High-level architecture

- Planora is a **server-first Next.js App Router** app. Mutations run through **Server Actions** (e.g., `app/(authenticated)/(dashboard)/boards/**/actions.ts`) rather than a separate API backend.
- Request flow for write operations is consistently:
  1. `verifySession()` (`lib/dal.ts`) for auth/session gating
  2. Zod validation from `lib/schemas/*`
  3. Workspace permission check via `hasWorkspacePermission()` (`lib/authorization.ts`) / Better Auth org roles
  4. Domain/data function in `lib/*.ts`
  5. `revalidatePath()`/`refresh()` for UI cache updates
- Auth is centralized in Better Auth:
  - Route handler: `app/api/auth/[...all]/route.ts`
  - Config: `lib/auth.ts`
  - Organization plugin maps Better Auth entities to Prisma models: `organization -> workspace`, `member -> workspaceMember`
- Database access is centralized through `lib/prisma.ts` (`db` singleton), using `@prisma/adapter-pg` and the generated Prisma client in `app/generated/prisma/`.

## Key conventions for this repository

- **Do not edit generated/UI-managed code directly**:
  - `app/generated/prisma/` is generated output.
  - `components/ui/` is shadcn-managed (customize only when necessary).
- Server-side data modules (`lib/board.ts`, `lib/list.ts`, `lib/card.ts`, etc.) use `import "server-only"` and return typed, selected shapes.
- Board/list/card actions return explicit success/error unions (`{ success: true, ... } | { success: false, error: string }`) rather than throwing user-facing errors.
- Authorization pattern intentionally avoids leaking existence details: unauthorized operations usually return the same not-found style message as missing resources.
- Data modeling patterns to preserve:
  - `archivedAt` soft-delete checks are part of normal query filters for archived entities.
  - Ordering for lists/cards uses **float gap positioning** (`position`) with neighbor-based reordering APIs (`prev*Id`/`next*Id`) rather than integer reindexing.
- ID validation differs by entity:
  - Workspace IDs are Better Auth IDs (32-char alphanumeric in schema validation).
  - Board/list/card IDs are UUIDs (validated via Zod `.uuid()`).
- Styling/theme conventions:
  - Tailwind CSS v4 config is CSS-based in `app/globals.css` (no `tailwind.config.*`).
  - Theme tokens use CSS variables and oklch values.
- Formatting convention in existing docs/code:
  - shadcn UI files typically omit semicolons.
  - app/lib code uses semicolons.

## Existing assistant config sources already reflected here

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
