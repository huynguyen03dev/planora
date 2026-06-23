# Planora

A Trello-like project management app — kanban boards, lists, and cards with
real-time collaboration, workspace-scoped access control, and an
event-sourced analytics dashboard.

## Features

- **Boards, lists, and cards** — drag-and-drop ordering (`@hello-pangea/dnd`,
  float-gap positions), labels, checklists, comments, attachments, due dates,
  and estimates.
- **Workspaces & access control** — organization-scoped membership with three
  roles: `admin` (full control), `editor` (content CRUD), `viewer` (comments
  only). Email invites work for users who haven't signed up yet.
- **Real-time sync** — Socket.io broadcasts mutations to other clients;
  Prisma/PostgreSQL stays the source of truth.
- **Analytics dashboard** — burndown, created-vs-completed flow, lead-time,
  overdue/late, reopen rate, and estimation-coverage metrics, reconstructed by
  replaying an append-only card-history event log. CSV export included.
- **Authentication** — email/password and sessions via Better Auth.

## Tech Stack

| Layer        | Choice                                                            |
| ------------ | ----------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router, React 19, Turbopack)                      |
| Language     | TypeScript 5 (strict)                                             |
| Database     | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)                    |
| Auth         | Better Auth (organization plugin)                                 |
| Realtime     | Socket.io (custom `server.ts`)                                    |
| Styling      | Tailwind CSS 4 + shadcn/ui (radix-vega), Hugeicons                |
| State        | Zustand                                                           |
| Email        | Resend + React Email                                              |
| Tests        | Vitest 2                                                          |

All data writes go through **Server Actions** (`app/**/actions.ts`) →
Prisma → DB. There is no separate backend.

## Getting Started

### Prerequisites

- Node.js 20+ (developed on 24)
- Docker (for local PostgreSQL) or an existing PostgreSQL 16 instance

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

```bash
docker compose up -d   # postgres:16-alpine on port 5432
```

### 3. Configure environment

Create a `.env` file in the project root:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/planora?schema=public"
BETTER_AUTH_SECRET="<generate with: openssl rand -base64 32>"
BETTER_AUTH_URL="http://localhost:3000"

# Optional — email invites log to console when unset
RESEND_API_KEY="re_..."
EMAIL_FROM="Planora <noreply@yourdomain.com>"
```

### 4. Run migrations

```bash
npx prisma migrate dev   # creates the database schema
```

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> The dev server runs through a custom `server.ts` (Next.js handler + Socket.io),
> not `next dev`. `npm run dev` already wires this up via `tsx`.

## Scripts

| Command                     | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `npm run dev`               | Start the dev server (Next.js + Socket.io)           |
| `npm run build`             | Production build (type-checks included)              |
| `npm run start`             | Start the production server                          |
| `npm run lint`              | ESLint (`eslint-config-next`)                        |
| `npm test`                  | Run the Vitest suite once                            |
| `npm run test:watch`        | Vitest in watch mode                                 |
| `npm run backfill:analytics`| Backfill card-history events for analytics           |

### Prisma

```bash
npx prisma generate          # regenerate client → app/generated/prisma/
npx prisma migrate dev       # create & apply a migration in dev
npx prisma migrate deploy    # apply pending migrations in production
npx prisma studio            # visual DB browser
```

## Project Structure

```
app/                # Next.js App Router pages, routes, and Server Actions
  api/auth/[...all] # Better Auth catch-all route handler
  generated/prisma/ # AUTO-GENERATED Prisma client — never edit
components/
  ui/               # shadcn/ui components (CLI-managed)
lib/
  auth.ts           # Better Auth server config
  prisma.ts         # `db` singleton (PrismaPg adapter)
  permissions.ts    # RBAC roles
  authorization.ts  # workspace permission checks
  realtime/         # Socket server/client, rooms, typed events, emitters
  analytics/        # event-sourced metric computation
  dnd/              # pure drag-drop position math
  schemas/          # Zod validators for Server Action inputs
prisma/
  schema.prisma     # database schema
  migrations/       # Prisma migrations
server.ts           # custom HTTP server (Next.js + Socket.io)
docs/               # architecture, product contracts, decisions, harness
```

## Documentation

- `docs/ARCHITECTURE.md` — stack, server setup, Server Action contract,
  float-gap ordering, soft-delete/cascade rules, realtime invariants.
- `docs/product/` — product contracts per domain (boards, workspaces,
  realtime, notifications, analytics).
- `docs/TEST_MATRIX.md` — what is proven vs. untested.
- `AGENTS.md` / `CLAUDE.md` — contributor and agent guidelines.

## Contributing

`main` is **PR-only** — direct pushes, force-pushes, and deletions are blocked
for everyone. Land every change via a pull request: branch → push →
`gh pr create` → `gh pr merge`.
