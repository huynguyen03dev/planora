import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

/**
 * Ephemeral sandbox runner. Connects to PostgreSQL, creates a unique schema,
 * executes test operations, performs best-effort ROLLBACK to clear any aborted
 * transaction block, and drops the sandbox schema.
 *
 * Fail-closed semantics: DROP SCHEMA errors are NOT caught or swallowed.
 * If schema cleanup fails, the error propagates and fails the test.
 * Connection closure (client.end) is guaranteed via a nested try/finally block.
 */
async function runWithSandbox<T>(
  connectionString: string,
  schemaNamePrefix: string,
  fn: (client: Client, schemaName: string) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  // Fail-closed: PostgreSQL connection failure must fail the test directly.
  await client.connect();

  const uniqueId = crypto.randomUUID().replace(/-/g, "_");
  const schemaName = `${schemaNamePrefix}_${Date.now()}_${uniqueId}`;
  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);
    return await fn(client, schemaName);
  } finally {
    try {
      // Best-effort ROLLBACK to exit any aborted transaction block (e.g. if explicit BEGIN...COMMIT failed midway)
      await client.query("ROLLBACK").catch(() => {});
      // Fail-closed: DROP SCHEMA error propagates directly to fail the test if cleanup fails
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      // Guarantee connection cleanup regardless of whether DROP SCHEMA succeeded or threw
      await client.end().catch(() => {});
    }
  }
}

describe("US-074 DB Index Execution Proof (Ephemeral PostgreSQL Sandbox)", () => {
  it("safely executes migration and verifies live position uniqueness and archived position sharing", async () => {
    const connectionString =
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/planora?schema=public";

    await runWithSandbox(connectionString, "sandbox_us074_proof", async (client) => {
      // 1. Create base board and list tables matching pre-migration schema
      await client.query(`
        CREATE TABLE "board" (
          "id" TEXT PRIMARY KEY,
          "workspaceId" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "createdById" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE "list" (
          "id" TEXT PRIMARY KEY,
          "boardId" TEXT NOT NULL REFERENCES "board"("id") ON DELETE CASCADE,
          "title" TEXT NOT NULL,
          "position" DOUBLE PRECISION NOT NULL,
          "isDone" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE UNIQUE INDEX "list_boardId_position_key" ON "list"("boardId", "position");
      `);

      // 2. Execute actual migration SQL file (containing explicit BEGIN ... COMMIT)
      const migrationPath = path.join(
        process.cwd(),
        "prisma/migrations/20260728034230_add_list_archived_at/migration.sql",
      );
      const migrationSql = fs.readFileSync(migrationPath, "utf8");
      await client.query(migrationSql);

      // 3. Seed parent board
      await client.query(
        `INSERT INTO "board" (id, "workspaceId", title, "createdById") VALUES ($1, $2, $3, $4)`,
        ["b-1", "ws-1", "Board 1", "u-1"],
      );

      // 4. Test active list position insertion
      await client.query(
        `INSERT INTO "list" (id, "boardId", title, position) VALUES ($1, $2, $3, $4)`,
        ["l-1", "b-1", "Live List 1", 1000],
      );

      // 5. Prove duplicate active position is REJECTED by partial unique index
      let duplicateRejected = false;
      try {
        await client.query(
          `INSERT INTO "list" (id, "boardId", title, position) VALUES ($1, $2, $3, $4)`,
          ["l-2", "b-1", "Live List 2", 1000],
        );
      } catch (err: unknown) {
        if (err && typeof err === "object" && "code" in err && err.code === "23505") {
          duplicateRejected = true;
        } else {
          throw err;
        }
      }
      expect(duplicateRejected).toBe(true);

      // 6. Prove archived list CAN share position 1000 with active list l-1
      let archivedAllowed = false;
      await client.query(
        `INSERT INTO "list" (id, "boardId", title, position, "archivedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        ["l-3", "b-1", "Archived List", 1000],
      );
      archivedAllowed = true;
      expect(archivedAllowed).toBe(true);

      // 7. Archive live list l-1, then insert a new live list l-4 at position 1000 -> SUCCEEDS
      await client.query(`UPDATE "list" SET "archivedAt" = CURRENT_TIMESTAMP WHERE id = $1`, ["l-1"]);
      await client.query(
        `INSERT INTO "list" (id, "boardId", title, position) VALUES ($1, $2, $3, $4)`,
        ["l-4", "b-1", "New Live List", 1000],
      );

      // 8. Attempting to unarchive l-1 back to active while l-4 is active at position 1000 -> REJECTED
      let unarchiveRejected = false;
      try {
        await client.query(`UPDATE "list" SET "archivedAt" = NULL WHERE id = $1`, ["l-1"]);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "code" in err && err.code === "23505") {
          unarchiveRejected = true;
        } else {
          throw err;
        }
      }
      expect(unarchiveRejected).toBe(true);
    });
  });

  it("proves concurrent restore beats purge: conditional deleteMany with count check prevents data loss", async () => {
    const connectionString =
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/planora?schema=public";

    const schemaName = `sandbox_us074_concurrent_${Date.now()}_${crypto.randomUUID().replace(/-/g, "_")}`;
    const adminClient = new Client({ connectionString });
    const restoreClient = new Client({ connectionString });

    await adminClient.connect();
    await restoreClient.connect();

    try {
      // Create shared sandbox schema and set search_path on both connections
      await adminClient.query(`CREATE SCHEMA "${schemaName}"`);
      const useSchema = `SET search_path TO "${schemaName}"`;
      await adminClient.query(useSchema);
      await restoreClient.query(useSchema);

      await adminClient.query(`
        CREATE TABLE "board" (
          "id" TEXT PRIMARY KEY,
          "workspaceId" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "createdById" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "archivedAt" TIMESTAMP(3)
        );
        CREATE TABLE "list" (
          "id" TEXT PRIMARY KEY,
          "boardId" TEXT NOT NULL REFERENCES "board"("id") ON DELETE CASCADE,
          "title" TEXT NOT NULL,
          "position" DOUBLE PRECISION NOT NULL,
          "archivedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE "card" (
          "id" TEXT PRIMARY KEY,
          "listId" TEXT NOT NULL REFERENCES "list"("id") ON DELETE CASCADE,
          "title" TEXT NOT NULL,
          "position" DOUBLE PRECISION NOT NULL,
          "archivedAt" TIMESTAMP(3),
          "deletedAt" TIMESTAMP(3),
          "createdById" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Seed board, archived list, and a card
      await adminClient.query(
        `INSERT INTO "board" (id, "workspaceId", title, "createdById") VALUES ($1, $2, $3, $4)`,
        ["b-1", "ws-1", "Board 1", "u-1"],
      );
      await adminClient.query(
        `INSERT INTO "list" (id, "boardId", title, position, "archivedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        ["l-1", "b-1", "Purge Target", 1000],
      );
      await adminClient.query(
        `INSERT INTO "card" (id, "listId", title, position, "createdById") VALUES ($1, $2, $3, $4, $5)`,
        ["c-1", "l-1", "Card 1", 16384, "u-1"],
      );

      // Scenario A: concurrent restore wins — A's conditional DELETE matches
      // nothing (B cleared archivedAt), A rolls back, list survives.
      await adminClient.query("BEGIN");
      const preCheck = await adminClient.query(
        `SELECT id FROM "list" WHERE id = $1 AND "archivedAt" IS NOT NULL`,
        ["l-1"],
      );
      expect(preCheck.rows.length).toBe(1);

      await restoreClient.query("BEGIN");
      await restoreClient.query(
        `UPDATE "list" SET "archivedAt" = NULL WHERE id = $1`,
        ["l-1"],
      );
      await restoreClient.query("COMMIT");

      // Conditional DELETE matches nothing: B's committed restore cleared archivedAt
      const deleteResult = await adminClient.query(
        `DELETE FROM "list" WHERE id = $1 AND "archivedAt" IS NOT NULL`,
        ["l-1"],
      );
      expect(deleteResult.rowCount).toBe(0);

      await adminClient.query("ROLLBACK");

      const listCheck = await adminClient.query(
        `SELECT id, "archivedAt" FROM "list" WHERE id = $1`,
        ["l-1"],
      );
      expect(listCheck.rows.length).toBe(1);
      expect(listCheck.rows[0].archivedAt).toBeNull();

      // Card survives: CASCADE never fired because the list wasn't deleted
      const cardCheck = await adminClient.query(
        `SELECT id FROM "card" WHERE id = $1`,
        ["c-1"],
      );
      expect(cardCheck.rows.length).toBe(1);

      // Scenario B: purge wins — no concurrent restore, list removed.

      await adminClient.query(
        `UPDATE "list" SET "archivedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
        ["l-1"],
      );
      const reArchived = await adminClient.query(
        `SELECT id FROM "list" WHERE id = $1 AND "archivedAt" IS NOT NULL`,
        ["l-1"],
      );
      expect(reArchived.rows.length).toBe(1);

      // Purge succeeds (no concurrent restore this time)
      const purgeResult = await adminClient.query(
        `DELETE FROM "list" WHERE id = $1 AND "archivedAt" IS NOT NULL`,
        ["l-1"],
      );
      expect(purgeResult.rowCount).toBe(1);

      const gone = await adminClient.query(
        `SELECT id FROM "list" WHERE id = $1`,
        ["l-1"],
      );
      expect(gone.rows.length).toBe(0);

      const cardGone = await adminClient.query(
        `SELECT id FROM "card" WHERE id = $1`,
        ["c-1"],
      );
      expect(cardGone.rows.length).toBe(0);
    } finally {
      try {
        await adminClient.query("ROLLBACK").catch(() => {});
        await restoreClient.query("ROLLBACK").catch(() => {});
        await adminClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } finally {
        await adminClient.end().catch(() => {});
        await restoreClient.end().catch(() => {});
      }
    }
  });

  it("PG interleaving: producer FOR UPDATE lock prevents concurrent archive — archiver blocks until producer commits, then revalidation sees archivedAt", async () => {
    const connectionString =
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/planora?schema=public";

    const schemaName = `sandbox_attach_lock_${Date.now()}_${crypto.randomUUID().replace(/-/g, "_")}`;
    const producer = new Client({ connectionString });
    const archiver = new Client({ connectionString });

    await producer.connect();
    await archiver.connect();

    try {
      await producer.query(`CREATE SCHEMA "${schemaName}"`);
      const useSchema = `SET search_path TO "${schemaName}"`;
      await producer.query(useSchema);
      await archiver.query(useSchema);

      await producer.query(`
        CREATE TABLE "board" ("id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "title" TEXT NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE "list" ("id" TEXT PRIMARY KEY, "boardId" TEXT NOT NULL REFERENCES "board"("id") ON DELETE CASCADE, "title" TEXT NOT NULL, "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE "card" ("id" TEXT PRIMARY KEY, "listId" TEXT NOT NULL REFERENCES "list"("id") ON DELETE CASCADE, "title" TEXT NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      `);

      await producer.query(`INSERT INTO "board" (id, "workspaceId", title, "createdById") VALUES ($1, $2, $3, $4)`, ["b-1", "ws-1", "B", "u-1"]);
      await producer.query(`INSERT INTO "list" (id, "boardId", title) VALUES ($1, $2, $3)`, ["l-1", "b-1", "Active List"]);
      await producer.query(`INSERT INTO "card" (id, "listId", title, "createdById") VALUES ($1, $2, $3, $4)`, ["c-1", "l-1", "Card", "u-1"]);

      // Scenario: producer's FOR UPDATE blocks the archiver; lock_timeout
      // proves the block deterministically.

      // With lock_timeout=500ms, a blocked archiver UPDATE fails deterministically.
      await archiver.query("SET lock_timeout TO '500'");

      await producer.query("BEGIN");

      // Acquire the FOR UPDATE lock
      await producer.query(`SELECT id, "archivedAt" FROM "list" WHERE id = $1 FOR UPDATE`, ["l-1"]);

      // Inverted proof: the archiver must time out precisely because it IS blocked.
      await expect(
        archiver.query(`UPDATE "list" SET "archivedAt" = CURRENT_TIMESTAMP WHERE id = $1 AND "archivedAt" IS NULL`, ["l-1"]),
      ).rejects.toThrow(/lock timeout/);

      await producer.query("COMMIT");

      // Lock released: archiving succeeds.
      await archiver.query("SET lock_timeout TO DEFAULT");
      await archiver.query(`UPDATE "list" SET "archivedAt" = CURRENT_TIMESTAMP WHERE id = $1 AND "archivedAt" IS NULL`, ["l-1"]);

      const check = await producer.query(`SELECT "archivedAt" FROM "list" WHERE id = $1`, ["l-1"]);
      expect(check.rows[0].archivedAt).not.toBeNull();
    } finally {
      try {
        await producer.query("ROLLBACK").catch(() => {});
        await archiver.query("ROLLBACK").catch(() => {});
        await producer.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } finally {
        await producer.end().catch(() => {});
        await archiver.end().catch(() => {});
      }
    }
  });

  it("PG interleaving: purge FOR UPDATE lock freezes attachment producer who then sees list is gone (zero rows)", async () => {
    const connectionString =
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/planora?schema=public";

    const schemaName = `sandbox_purge_attach_${Date.now()}_${crypto.randomUUID().replace(/-/g, "_")}`;
    const purge = new Client({ connectionString });
    const attachmentProducer = new Client({ connectionString });

    await purge.connect();
    await attachmentProducer.connect();

    try {
      await purge.query(`CREATE SCHEMA "${schemaName}"`);
      const useSchema = `SET search_path TO "${schemaName}"`;
      await purge.query(useSchema);
      await attachmentProducer.query(useSchema);

      await purge.query(`
        CREATE TABLE "board" ("id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "title" TEXT NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE "list" ("id" TEXT PRIMARY KEY, "boardId" TEXT NOT NULL REFERENCES "board"("id") ON DELETE CASCADE, "title" TEXT NOT NULL, "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE "attachment" ("id" TEXT PRIMARY KEY, "cardId" TEXT, "cloudinaryPublicId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      `);

      await purge.query(`INSERT INTO "board" (id, "workspaceId", title, "createdById") VALUES ($1, $2, $3, $4)`, ["b-1", "ws-1", "B", "u-1"]);
      await purge.query(`INSERT INTO "list" (id, "boardId", title, "archivedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`, ["l-1", "b-1", "Archived List"]);

      // Scenario: purge's FOR UPDATE blocks the attachment producer until
      // commit, after which the producer sees zero rows (list deleted).

      await attachmentProducer.query("SET lock_timeout TO '500'");

      await purge.query("BEGIN");

      const lockResult = await purge.query(
        `SELECT id, "archivedAt" FROM "list" WHERE id = $1 FOR UPDATE`,
        ["l-1"],
      );
      expect(lockResult.rows.length).toBe(1);
      expect(lockResult.rows[0].archivedAt).not.toBeNull();

      // Producer's FOR UPDATE must time out while purge holds the lock
      await expect(
        attachmentProducer.query(`SELECT id, "archivedAt" FROM "list" WHERE id = $1 FOR UPDATE`, ["l-1"]),
      ).rejects.toThrow(/lock timeout/);

      // Simulated Cloudinary attachment check keeps the lock held during the wait
      await purge.query(`SELECT id FROM "attachment" WHERE "cloudinaryPublicId" IS NOT NULL`);

      await purge.query(`DELETE FROM "list" WHERE id = $1 AND "archivedAt" IS NOT NULL`, ["l-1"]);
      await purge.query("COMMIT");

      await attachmentProducer.query("SET lock_timeout TO DEFAULT");
      const producerResult = await attachmentProducer.query(
        `SELECT id, "archivedAt" FROM "list" WHERE id = $1 FOR UPDATE`,
        ["l-1"],
      );
      expect(producerResult.rows.length).toBe(0);
    } finally {
      try {
        await purge.query("ROLLBACK").catch(() => {});
        await attachmentProducer.query("ROLLBACK").catch(() => {});
        await purge.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } finally {
        await purge.end().catch(() => {});
        await attachmentProducer.end().catch(() => {});
      }
    }
  });

  it("PG interleaving: producer FOR UPDATE lock forces concurrent archive to wait then proceed (lock_timeout deterministic)", async () => {
    const connectionString =
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/planora?schema=public";

    const schemaName = `sandbox_producer_lock_${Date.now()}_${crypto.randomUUID().replace(/-/g, "_")}`;
    const producer = new Client({ connectionString });
    const archiver = new Client({ connectionString });

    await producer.connect();
    await archiver.connect();

    try {
      await producer.query(`CREATE SCHEMA "${schemaName}"`);
      const useSchema = `SET search_path TO "${schemaName}"`;
      await producer.query(useSchema);
      await archiver.query(useSchema);

      await producer.query(`
        CREATE TABLE "board" ("id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "title" TEXT NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE "list" ("id" TEXT PRIMARY KEY, "boardId" TEXT NOT NULL REFERENCES "board"("id") ON DELETE CASCADE, "title" TEXT NOT NULL, "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      `);

      await producer.query(`INSERT INTO "board" (id, "workspaceId", title, "createdById") VALUES ($1, $2, $3, $4)`, ["b-1", "ws-1", "B", "u-1"]);
      await producer.query(`INSERT INTO "list" (id, "boardId", title) VALUES ($1, $2, $3)`, ["l-1", "b-1", "Active List"]);

      // Scenario: archiver's UPDATE blocks on producer's FOR UPDATE until
      // producer commits, then proceeds.

      // lock_timeout proves blocking deterministically
      await archiver.query("SET lock_timeout TO '500'");

      await producer.query("BEGIN");

      await producer.query(`SELECT id FROM "list" WHERE id = $1 FOR UPDATE`, ["l-1"]);

      // Archiver must time out — proof that the producer's lock held it blocked
      await expect(
        archiver.query(
          `UPDATE "list" SET "archivedAt" = CURRENT_TIMESTAMP WHERE id = $1 AND "archivedAt" IS NULL`,
          ["l-1"],
        ),
      ).rejects.toThrow(/lock timeout/);

      await producer.query("COMMIT");

      // After commit, archiver proceeds
      await archiver.query("SET lock_timeout TO DEFAULT");
      await archiver.query(
        `UPDATE "list" SET "archivedAt" = CURRENT_TIMESTAMP WHERE id = $1 AND "archivedAt" IS NULL`,
        ["l-1"],
      );

      const check = await producer.query(`SELECT "archivedAt" FROM "list" WHERE id = $1`, ["l-1"]);
      expect(check.rows[0].archivedAt).not.toBeNull();
    } finally {
      try {
        await producer.query("ROLLBACK").catch(() => {});
        await archiver.query("ROLLBACK").catch(() => {});
        await producer.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } finally {
        await producer.end().catch(() => {});
        await archiver.end().catch(() => {});
      }
    }
  });

  it("cleans up ephemeral sandbox schema even when explicit BEGIN transaction fails mid-migration", async () => {
    const connectionString =
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/planora?schema=public";

    let targetSchemaName = "";
    await runWithSandbox(connectionString, "sandbox_us074_fail", async (client, schemaName) => {
      targetSchemaName = schemaName;

      // Deliberately failing migration: invalid SQL inside BEGIN...COMMIT
      const failingMigrationSql = `
        BEGIN;
        ALTER TABLE "non_existent_table" ADD COLUMN "foo" TEXT;
        COMMIT;
      `;
      await expect(client.query(failingMigrationSql)).rejects.toThrow();
    });

    // Verify the schema was dropped via a fresh out-of-band connection
    const verifyClient = new Client({ connectionString });
    await verifyClient.connect();
    try {
      const res = await verifyClient.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [targetSchemaName],
      );
      expect(res.rows.length).toBe(0);
    } finally {
      await verifyClient.end().catch(() => {});
    }
  });
});
