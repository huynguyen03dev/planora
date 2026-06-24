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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getUserIdByEmail(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM "user" WHERE email = $1 LIMIT 1`,
    [email],
  );
  if (!rows[0]) throw new Error(`No user found for ${email}`);
  return rows[0].id;
}

/** Insert a workspace membership directly (arrange step, not under test). */
export async function addWorkspaceMember(
  organizationId: string,
  userId: string,
  role: "admin" | "editor" | "viewer" = "editor",
): Promise<void> {
  await pool.query(
    `INSERT INTO "workspaceMember" (id, "organizationId", "userId", role, "createdAt")
     VALUES ($1, $2, $3, $4, now())`,
    [randomUUID(), organizationId, userId, role],
  );
}

/**
 * Best-effort teardown: delete the workspace (cascades members, boards, lists,
 * cards) and the listed users (cascades sessions/accounts). Swallows errors so a
 * cleanup hiccup never masks a real test result.
 */
export async function cleanup(opts: { workspaceId?: string; emails: string[] }): Promise<void> {
  try {
    if (opts.workspaceId) {
      await pool.query(`DELETE FROM "workspace" WHERE id = $1`, [opts.workspaceId]);
    }
    if (opts.emails.length) {
      await pool.query(`DELETE FROM "user" WHERE email = ANY($1)`, [opts.emails]);
    }
  } catch {
    // ignore — teardown must not fail the run
  }
}

/** Close the pool so the test process can exit cleanly. */
export async function disconnect(): Promise<void> {
  await pool.end();
}
