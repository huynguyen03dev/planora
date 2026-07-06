# Architecture

Planora is a **Trello-like kanban project-management app**: multi-workspace, with
boards → lists → cards, real-time sync, role-based access, and a workspace
analytics dashboard.

This document describes the **actual** architecture as built, plus the boundary
rules new work must respect. Record any architecture-changing decision in
`docs/decisions/`.

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19), TypeScript 5 strict |
| Server | Custom Node HTTP server (`server.ts`, run via `tsx`) wrapping the Next.js handler + Socket.io |
| Mutations | Server Actions (`"use server"`), RPC-style — **no REST API for data** |
| ORM / DB | Prisma 7 (`@prisma/adapter-pg`) → PostgreSQL 16 |
| Auth | Better Auth 1.5 + organization plugin |
| Real-time | Socket.io 4.8 (broadcast + room subscriptions) |
| Client state | Zustand 5 (board store) |
| Drag-and-drop | `@hello-pangea/dnd` |
| Email | Resend + React Email (`emails/`) |
| File uploads | Cloudinary (`lib/cloudinary.ts`) |
| Styling | Tailwind CSS 4 (CSS-config, no config file) + shadcn/ui (oklch) |
| Tests | Vitest 2 (node env) |

## Surfaces

- **Browser** only. Two route groups under `app/`:
  - `(public)` — landing, `/sign-in`, `/sign-up`
  - `(authenticated)/(dashboard)` — `/boards`, `/boards/[boardId]`, `/workspace`,
    `/workspace/[slug]/dashboard`, `/notifications`, `/invitations`, `/profile`
- **API routes** exist only for: `app/api/auth/[...all]` (Better Auth catch-all)
  and `app/api/notifications` (GET-only fetch). Everything else is a Server Action.

## Core Domains

The product concepts that own stable names and contracts (see `docs/GLOSSARY.md`):

- **Workspace** — the organization unit (Better Auth org → `workspace`).
- **Board → List → Card** — the kanban hierarchy.
- **Card metadata** — members, labels, checklists, comments, attachments,
  priority, due date, estimate, completion.
- **Activity** — workspace-scoped audit log.
- **CardHistoryEvent** — append-only analytics event stream.
- **Notification** — per-user, in-app + email + socket delivery.

## Actual Layering

This is **not** a classic domain/application/infrastructure/interface layering.
It is a Next.js server-first app. The real layers:

```text
React Client Components (Zustand board store, DnD, socket listeners)
  -> Server Actions  (app/**/actions.ts: auth → permission → Zod → Prisma → emit)
      -> lib/*       (domain logic: card.ts, list.ts, board.ts, analytics/, realtime/)
          -> Prisma db singleton (lib/prisma.ts)
              -> PostgreSQL
  ~> Socket.io (server.ts + lib/realtime/*) broadcasts to rooms; never source of truth
```

### Where code lives

| Path | Responsibility |
| --- | --- |
| `app/(authenticated)/(dashboard)/**/actions.ts` | Server Actions (the mutation boundary) |
| `app/(authenticated)/(dashboard)/boards/[boardId]/board-store*.ts(x)` | Zustand board store + provider |
| `lib/board.ts` `lib/list.ts` `lib/card.ts` `lib/card-member.ts` `lib/comment.ts` `lib/attachment.ts` | Domain queries/mutations |
| `lib/card-history.ts` `lib/analytics/engine.ts` | Analytics event capture + computation |
| `lib/realtime/` | Socket server, client, room scheme, typed events, emitters |
| `lib/auth.ts` `lib/auth-client.ts` `lib/permissions.ts` `lib/authorization.ts` `lib/dal.ts` | Auth, RBAC, session verification |
| `lib/prisma.ts` | `db` singleton (PrismaPg adapter) |
| `lib/schemas/` | Zod validators for Server Action inputs |
| `app/generated/prisma/` | **Auto-generated Prisma client — never edit** |

## The Server Action Contract (the most important boundary)

Every data mutation flows through a Server Action in this exact order:

1. **`verifySession()`** (`lib/dal.ts`) → `userId`. Never trust client identity.
2. **Permission check** — `hasWorkspacePermission(workspaceId, { board: ["update"], ... })`
   (`lib/authorization.ts`, backed by Better Auth roles in `lib/permissions.ts`).
3. **Workspace isolation** — every query is scoped to the caller's workspace.
   A missing scope is a data-leak bug, treat as high-risk.
4. **Zod validation** — parse untrusted input via `lib/schemas/` before touching the DB.
5. **Prisma mutation** — through the `db` singleton; use transactions for
   multi-row position changes.
6. **Real-time emit** — call the matching `lib/realtime/server.ts` emitter
   (`emitCardMoved`, `emitListCreated`, …) so other clients update.
7. **`revalidatePath()`** where server-rendered data must refresh.
8. **Return serializable data** — plain objects only (see CLAUDE.md gotcha #2).

## Parse-First Boundary Rule

Unknown data must be parsed before it enters domain code. Boundaries here:

- Server Action arguments → Zod schemas in `lib/schemas/`.
- Better Auth session/cookies → `verifySession()` / `lib/dal.ts`.
- Socket handshake → cookie-based auth in `server.ts` middleware, then
  per-room authorization (`canUserJoinBoard`, `canUserJoinWorkspace`).
- Environment variables → read once near setup, not deep in domain code.
- Cloudinary / Resend payloads → validate before persisting references.

Inner code should pass real product types (`workspaceId`, `boardId`, `Role`,
`Priority`) rather than re-validating raw strings.

## Ordering (Float Gap Positioning)

Lists, Cards, Checklists, and ChecklistItems order by `position Float`
(gap = `16384`). Insert between neighbours with the midpoint; renumber/normalize
only on overflow. This avoids rewriting every row on a drag. See
`lib/dnd/apply-drop.ts` (`translateCardDrop`, `translateListDrop`) for the
neighbour math, which is pure and unit-tested.

## Soft Deletes & Cascades

- **Soft delete** via `archivedAt DateTime?` on **Board** and **Card**. Queries
  filter `where: { archivedAt: null }` unless restoring.
- **Cascade** `onDelete: Cascade`: Workspace → Boards → Lists → Cards →
  (members, labels, checklists, comments, attachments). Always `@@index` FKs.
- **Activity** uses `onDelete: SetNull` for board/card refs (audit survives).
- **CardHistoryEvent** denormalizes `boardId`/`cardId` (not FKs) so the analytics
  trail survives entity deletion. It is **append-only** — never mutate or delete.

## Real-time: Drag-Aware Deferral (critical invariant)

Socket.io broadcasts events; Prisma stays the source of truth. The client
defers **structural** remote events while a drag is in progress to avoid
`@hello-pangea/dnd` array corruption:

```text
remote event arrives
  -> isDragging?  yes -> markResyncPending()         (defer)
                  no  -> applyRemote<Thing>(payload)  (apply to Zustand store)
drop completes -> consumeResync() -> router.refresh() if a resync was pending
```

- **Deferred (structural):** card/list moved, created, deleted, archived.
- **Applied live (in-place):** comments, title edits, card completion flips
  (`card:completion-updated`), label/member changes.

When changing board mutations or socket events, preserve this rule — it is the
fix behind commit `7706b6d` and is covered by `tests/board-store.test.ts`.

## Observability

There is no canonical request-log contract yet. Operational truth today:
the **Activity** log (product record of who did what) and **CardHistoryEvent**
(analytics stream). Do not conflate them with application/debug logging.

## Command/Query Separation

Reads live in `lib/*` query functions and server components; writes live in
Server Actions and emit side effects (realtime, notifications, history events).
Keep shared rules in `lib/*`, not in components.
