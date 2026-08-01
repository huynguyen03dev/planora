/**
 * Direct DB access for E2E arrange/teardown — NOT part of the system under test.
 *
 * The realtime *wire* is what slice 1 proves (card create by A → appears for B).
 * Getting user B into A's workspace is a precondition, so we establish it via
 * the fast path (a direct `workspaceMember` insert) rather than driving the full
 * invite→email→accept UI. That keeps the test focused and low-flake; exercising
 * the invite/accept UI is a separate candidate slice.
 *
 * Uses raw `pg` (a transitive dep of `@prisma/adapter-pg`) rather than the
 * generated Prisma client: the generated client is ESM (`import.meta`) and the
 * Playwright runner transforms test modules as CJS, so importing it fails. Three
 * small queries don't need an ORM. Table/column names mirror the `@@map` names
 * in prisma/schema.prisma ("user", "workspaceMember", "workspace").
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { Pool } from "pg";

// The pool is a lazily-(re)created module singleton shared across spec files. A
// spec's afterAll calls disconnect() → end(), but pg forbids reuse after end(),
// and the next spec file (same worker, same module) still needs DB access. So
// `pool()` re-opens a fresh pool whenever the previous one was ended — disconnect
// is then safe to call per file and at any point.
let poolRef: Pool | null = null;

function pool(): Pool {
  if (!poolRef) {
    poolRef = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return poolRef;
}

export async function getUserIdByEmail(email: string): Promise<string> {
  const { rows } = await pool().query<{ id: string }>(
    `SELECT id FROM "user" WHERE email = $1 LIMIT 1`,
    [email],
  );
  if (!rows[0]) throw new Error(`No user found for ${email}`);
  return rows[0].id;
}

/**
 * List ids for a board, keyed by title. The card-move tests scope DOM
 * assertions to a specific list's droppable (`[data-rfd-droppable-id="<id>"]`),
 * which needs the real list id — the UI only exposes titles.
 */
export async function getListIdsByTitle(boardId: string): Promise<Record<string, string>> {
  const { rows } = await pool().query<{ id: string; title: string }>(
    `SELECT id, title FROM "list" WHERE "boardId" = $1`,
    [boardId],
  );
  return Object.fromEntries(rows.map((row) => [row.title, row.id]));
}

/** Resolve a card's id from its title (drag-handle targeting needs the id). */
export async function getCardIdByTitle(boardId: string, title: string): Promise<string> {
  const { rows } = await pool().query<{ id: string }>(
    `SELECT c.id
       FROM "card" c
       JOIN "list" l ON c."listId" = l.id
      WHERE l."boardId" = $1 AND c.title = $2 AND c."archivedAt" IS NULL
      LIMIT 1`,
    [boardId, title],
  );
  if (!rows[0]) throw new Error(`No card titled "${title}" on board ${boardId}`);
  return rows[0].id;
}

/**
 * A card's current list id. Used to confirm a move has committed server-side
 * (and therefore its `card:moved` emit has fired) before the test triggers a
 * later event — socket.io delivers in order per connection, so this pins the
 * relative ordering the deferral proof depends on.
 */
export async function getCardListId(cardId: string): Promise<string | undefined> {
  const { rows } = await pool().query<{ listId: string }>(
    `SELECT "listId" FROM "card" WHERE id = $1`,
    [cardId],
  );
  return rows[0]?.listId;
}

/**
 * Seed a board label directly (arrange step, not under test) and return its id.
 * The label-CRUD *realtime* propagation is what the spec proves; getting a label
 * onto the board is a precondition, so we insert it rather than drive the create
 * UI. Mirrors the `label` @@map columns in prisma/schema.prisma.
 */
export async function addLabel(
  boardId: string,
  name: string,
  color: string,
): Promise<string> {
  const id = randomUUID();
  await pool().query(
    `INSERT INTO "label" (id, "boardId", name, color, "createdAt")
     VALUES ($1, $2, $3, $4, now())`,
    [id, boardId, name, color],
  );
  return id;
}

/** Attach a seeded label to a card directly (arrange step, not under test). */
export async function attachLabel(cardId: string, labelId: string): Promise<void> {
  await pool().query(
    `INSERT INTO "cardLabel" ("cardId", "labelId") VALUES ($1, $2)`,
    [cardId, labelId],
  );
}

/** Insert a workspace membership directly (arrange step, not under test). */
export async function addWorkspaceMember(
  organizationId: string,
  userId: string,
  role: "admin" | "editor" | "viewer" = "editor",
): Promise<void> {
  await pool().query(
    `INSERT INTO "workspaceMember" (id, "organizationId", "userId", role, "createdAt")
     VALUES ($1, $2, $3, $4, now())`,
    [randomUUID(), organizationId, userId, role],
  );
}

/**
 * A workspace's slug — the dashboard route is `/workspace/{slug}/dashboard`,
 * and the create-workspace UI only surfaces the id (createWorkspace returns
 * the id from the URL).
 */
export async function getWorkspaceSlug(workspaceId: string): Promise<string> {
  const { rows } = await pool().query<{ slug: string }>(
    `SELECT slug FROM "workspace" WHERE id = $1`,
    [workspaceId],
  );
  if (!rows[0]) throw new Error(`No workspace found for ${workspaceId}`);
  return rows[0].slug;
}

/** True when the user holds a membership row in the workspace (W2 accept proof — DB source of truth). */
export async function isWorkspaceMember(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await pool().query<{ id: string }>(
    `SELECT id FROM "workspaceMember" WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1`,
    [organizationId, userId],
  );
  return rows.length > 0;
}

/**
 * The stored email of a user. Records Better Auth's actual email-casing/
 * storage behavior for the W2 invitee-resolution contract (verified at
 * sign-up.mjs: BA lowercases user emails at sign-up, so the stored value is
 * always the lowercase form).
 */
export async function getStoredEmail(userId: string): Promise<string | null> {
  const { rows } = await pool().query<{ email: string }>(
    `SELECT email FROM "user" WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0]?.email ?? null;
}

/**
 * Best-effort teardown: delete the workspace (cascades members, boards, lists,
 * cards) and the listed users (cascades sessions/accounts). Swallows errors so a
 * cleanup hiccup never masks a real test result.
 */
export async function cleanup(opts: { workspaceId?: string; emails: string[] }): Promise<void> {
  try {
    if (opts.workspaceId) {
      await pool().query(`DELETE FROM "workspace" WHERE id = $1`, [opts.workspaceId]);
    }
    if (opts.emails.length) {
      await pool().query(`DELETE FROM "user" WHERE email = ANY($1)`, [opts.emails]);
    }
  } catch {
    // ignore — teardown must not fail the run
  }
}

/**
 * Close the pool so the test process can exit cleanly. Idempotent and safe to
 * call per spec file: it ends the current pool (if any) and clears the ref, so a
 * later query in another spec simply opens a fresh pool via `pool()`.
 */
export async function disconnect(): Promise<void> {
  if (!poolRef) return;
  const current = poolRef;
  poolRef = null;
  await current.end();
}
