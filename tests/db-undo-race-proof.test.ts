import crypto from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

/**
 * US-083 W8 — real-PostgreSQL concurrency proof for the restore-vs-archive
 * invariant, in the repo's established ephemeral-sandbox style
 * (`tests/db-index-proof.test.ts`, decision 0026/0029 mechanism proofs).
 *
 * The invariant (locked): restoreCardAction must never COMMIT a live card
 * (card.archivedAt = NULL) into a parent list that is archived — the card
 * would be invisible on the board. The sequential pre-read
 * (`getArchivedCardWithListAndBoard`) passes BEFORE the transaction runs, so
 * a concurrent list archival between pre-read and transaction could slip a
 * restore through. The production fix re-checks the parent list INSIDE the
 * transaction under `SELECT ... FOR UPDATE` and aborts when it is archived —
 * the same lock/revalidation pattern as `permanentlyDeleteListAction` /
 * `uploadAttachmentAction` (US-074).
 *
 * This proof replicates the production transaction protocol at the SQL level
 * (the action's Prisma statements are pinned by the call-shape tests in
 * `tests/server-actions/undo-restore.test.ts`, whose race case goes red if
 * the in-transaction revalidation branch is removed). Determinism comes from
 * explicit BEGIN/COMMIT ordering and `lock_timeout` (db-index-proof style):
 *  - Test 1: the archiver commits first → the GUARDED restore transaction
 *    aborts; the card stays archived (the invariant holds).
 *  - Test 2 (control): the SAME interleaving without the guard COMMITS the
 *    invisible card — proving the harness detects the exact violation the
 *    guard prevents.
 *  - Test 3: with the restore transaction holding the FOR UPDATE lock, the
 *    archiver's UPDATE fails deterministically with lock_timeout (55P03) —
 *    the lock is real and blocks the archiver; after the restore commits the
 *    archiver proceeds (archive-after-restore is the legitimate path).
 *
 * Sabotage protocol (recorded in US-083 validation.md): flip WITH_GUARD to
 * false and re-run — Test 1 turns RED (the invariant breaks); restore the
 * flag and re-run — GREEN. That is the disconfirm evidence that removing the
 * in-transaction lock/revalidation makes this proof red.
 */

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/planora?schema=public";

/**
 * Ephemeral sandbox runner (db-index-proof pattern): creates a unique schema,
 * runs `fn` with the schema name + an extra connect helper, then drops the
 * schema fail-closed.
 */
async function runWithSandbox<T>(
  fn: (ctx: {
    admin: Client;
    schemaName: string;
    connect: () => Promise<Client>;
  }) => Promise<T>,
): Promise<T> {
  const admin = new Client({ connectionString: CONNECTION_STRING });
  await admin.connect();
  const schemaName = `sandbox_us083_w8_${Date.now()}_${crypto.randomUUID().replace(/-/g, "_")}`;
  try {
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
    await admin.query(`SET search_path TO "${schemaName}"`);
    const connect = async () => {
      const client = new Client({ connectionString: CONNECTION_STRING });
      await client.connect();
      await client.query(`SET search_path TO "${schemaName}"`);
      return client;
    };
    return await fn({ admin, schemaName, connect });
  } finally {
    try {
      await admin.query("ROLLBACK").catch(() => {});
      await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      await admin.end().catch(() => {});
    }
  }
}

/** Minimal replica of the schema subset the restore protocol touches. */
async function seedBoard(
  admin: Client,
): Promise<{ boardId: string; listId: string; cardId: string }> {
  const boardId = "b-1";
  const listId = "l-1";
  const cardId = "c-1";
  await admin.query(
    `CREATE TABLE "board" (
      "id" TEXT PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "createdById" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "archivedAt" TIMESTAMP(3)
    )`,
  );
  await admin.query(
    `CREATE TABLE "list" (
      "id" TEXT PRIMARY KEY,
      "boardId" TEXT NOT NULL REFERENCES "board"("id") ON DELETE CASCADE,
      "title" TEXT NOT NULL,
      "position" DOUBLE PRECISION NOT NULL,
      "archivedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  );
  await admin.query(
    `CREATE TABLE "card" (
      "id" TEXT PRIMARY KEY,
      "listId" TEXT NOT NULL REFERENCES "list"("id") ON DELETE CASCADE,
      "title" TEXT NOT NULL,
      "position" DOUBLE PRECISION NOT NULL,
      "archivedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  );
  await admin.query(
    `INSERT INTO "board" (id, "workspaceId", title, "createdById") VALUES ($1, $2, $3, $4)`,
    [boardId, "ws-1", "Board", "u-1"],
  );
  await admin.query(
    `INSERT INTO "list" (id, "boardId", title, position) VALUES ($1, $2, $3, $4)`,
    [listId, boardId, "List", 16384],
  );
  // The card is ARCHIVED (restore's precondition).
  await admin.query(
    `INSERT INTO "card" (id, "listId", title, position, "archivedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
    [cardId, listId, "Card", 16384],
  );
  return { boardId, listId, cardId };
}

async function cardArchivedAt(client: Client, cardId: string): Promise<Date | null> {
  const { rows } = await client.query<{ archivedAt: Date | null }>(
    `SELECT "archivedAt" FROM "card" WHERE id = $1`,
    [cardId],
  );
  return rows[0]?.archivedAt ?? null;
}

async function listArchivedAt(client: Client, listId: string): Promise<Date | null> {
  const { rows } = await client.query<{ archivedAt: Date | null }>(
    `SELECT "archivedAt" FROM "list" WHERE id = $1`,
    [listId],
  );
  return rows[0]?.archivedAt ?? null;
}

/**
 * The production restore transaction protocol (verbatim statements, minus the
 * history insert that is irrelevant to the concurrency invariant):
 *   BEGIN
 *   SELECT id, "archivedAt" FROM "list" WHERE id = $1 FOR UPDATE   [guard]
 *   revalidate: 0 rows OR archivedAt IS NOT NULL → abort            [guard]
 *   UPDATE "card" SET "archivedAt" = NULL WHERE id = $2 AND "archivedAt" IS NOT NULL
 *   COMMIT
 */
async function runRestoreTransaction(
  client: Client,
  listId: string,
  cardId: string,
  withGuard: boolean,
): Promise<{ committed: boolean }> {
  await client.query("BEGIN");
  try {
    if (withGuard) {
      const { rows } = await client.query<{ id: string; archivedAt: Date | null }>(
        `SELECT id, "archivedAt" FROM "list" WHERE id = $1 FOR UPDATE`,
        [listId],
      );
      if (rows.length === 0 || rows[0].archivedAt !== null) {
        throw new Error("PARENT_LIST_ARCHIVED_OR_GONE");
      }
    }
    await client.query(
      `UPDATE "card" SET "archivedAt" = NULL WHERE id = $1 AND "archivedAt" IS NOT NULL`,
      [cardId],
    );
    await client.query("COMMIT");
    return { committed: true };
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return { committed: false };
  }
}

/**
 * The guard switch this proof is run against. The committed value is `true`
 * (the production guard). The recorded sabotage runs flip it to `false`,
 * observe Test 1 go red, and restore it — see the file header + validation.md.
 */
const WITH_GUARD = true;

describe("US-083 W8 — restore-vs-archive interleaving proof (real Postgres)", () => {
  it("guarded protocol: an archiver committing between the pre-read and the restore transaction aborts the restore — the card stays archived", async () => {
    await runWithSandbox(async ({ admin, connect }) => {
      const { listId, cardId } = await seedBoard(admin);

      // The restore pre-read (getArchivedCardWithListAndBoard) passes here —
      // the list is still active at that moment. The ARCHIVER then wins the
      // race and commits the list archival before the restore transaction.
      await admin.query("BEGIN");
      await admin.query(`UPDATE "list" SET "archivedAt" = CURRENT_TIMESTAMP WHERE id = $1`, [listId]);
      await admin.query("COMMIT");

      const restore = await connect();
      try {
        const outcome = await runRestoreTransaction(restore, listId, cardId, WITH_GUARD);

        // Guarded: the restore must NOT commit — the card stays archived (no
        // invisible live card under an archived list).
        expect(outcome.committed).toBe(false);
        expect(await cardArchivedAt(restore, cardId)).not.toBeNull();
      } finally {
        await restore.end();
      }

      expect(await listArchivedAt(admin, listId)).not.toBeNull();
    });
  });

  it("control: the same interleaving WITHOUT the guard commits the invisible card — the harness detects the exact violation", async () => {
    await runWithSandbox(async ({ admin, connect }) => {
      const { listId, cardId } = await seedBoard(admin);

      await admin.query("BEGIN");
      await admin.query(`UPDATE "list" SET "archivedAt" = CURRENT_TIMESTAMP WHERE id = $1`, [listId]);
      await admin.query("COMMIT");

      const restore = await connect();
      try {
        const outcome = await runRestoreTransaction(restore, listId, cardId, false);

        // Unguarded: the restore commits a LIVE card into the ARCHIVED list —
        // exactly the invisible state the in-transaction guard must prevent.
        expect(outcome.committed).toBe(true);
        expect(await cardArchivedAt(restore, cardId)).toBeNull();
        expect(await listArchivedAt(restore, listId)).not.toBeNull();
      } finally {
        await restore.end();
      }
    });
  });

  it("the FOR UPDATE lock is real: while the restore transaction holds it, the archiver's UPDATE fails with lock_timeout, then succeeds after the restore commits", async () => {
    await runWithSandbox(async ({ admin, connect }) => {
      const { listId, cardId } = await seedBoard(admin);

      const restore = await connect();
      const archiver = await connect();
      try {
        // With the guard ON, acquire the FOR UPDATE lock and hold it (the
        // guard-off sabotage removes this acquisition, so the archiver's
        // UPDATE succeeds immediately and the lock_timeout assertion fails —
        // this test turns RED like test 1).
        await restore.query("BEGIN");
        if (WITH_GUARD) {
          const { rows } = await restore.query<{ id: string; archivedAt: Date | null }>(
            `SELECT id, "archivedAt" FROM "list" WHERE id = $1 FOR UPDATE`,
            [listId],
          );
          expect(rows[0].archivedAt).toBeNull(); // revalidation passes under the lock
        }

        // Archiver attempts the list archival while the lock is held:
        // deterministic lock_timeout (55P03) proves the lock blocks it.
        await archiver.query(`SET lock_timeout = '300ms'`);
        await archiver.query("BEGIN");
        let lockTimeoutSeen = false;
        try {
          await archiver.query(
            `UPDATE "list" SET "archivedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
            [listId],
          );
        } catch (err: unknown) {
          const code = (err as { code?: string }).code;
          expect(code).toBe("55P03");
          lockTimeoutSeen = true;
        }
        // Guard ON: the lock blocked the archiver. Guard OFF: no lock exists,
        // the UPDATE succeeds, and this assertion fails — lock presence is
        // proven behaviorally, not by call-shape.
        expect(lockTimeoutSeen).toBe(true);
        await archiver.query("ROLLBACK").catch(() => {});

        // The restore proceeds (the list was still active under the lock) and
        // commits the card restore.
        await restore.query(
          `UPDATE "card" SET "archivedAt" = NULL WHERE id = $1 AND "archivedAt" IS NOT NULL`,
          [cardId],
        );
        await restore.query("COMMIT");
        expect(await cardArchivedAt(restore, cardId)).toBeNull();

        // With the lock released, the archiver's final archive attempt
        // succeeds — archive-after-restore is created by the ARCHIVE, the
        // legitimate path (US-074 Slice A keeps cards live under an archived
        // list; the restore transaction never created that state).
        await archiver.query(`SET lock_timeout = 0`);
        await archiver.query("BEGIN");
        await archiver.query(
          `UPDATE "list" SET "archivedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
          [listId],
        );
        await archiver.query("COMMIT");
        expect(await listArchivedAt(archiver, listId)).not.toBeNull();
      } finally {
        await restore.end();
        await archiver.end();
      }
    });
  });
});
