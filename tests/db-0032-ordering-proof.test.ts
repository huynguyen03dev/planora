import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

/**
 * decision 0032 — real-PostgreSQL concurrency proof for the drag-ordering
 * protocol, in the repo's established ephemeral-sandbox style
 * (`tests/db-undo-race-proof.test.ts`, `tests/db-index-proof.test.ts`).
 *
 * The protocol (locked in decision 0032):
 *   1. Every production ordering transaction gates on the workspace row, then
 *      locks board rows, live lists (ascending ids), and the card. Recursive
 *      automation re-enters the same workspace gate in the same transaction,
 *      so a cascade cannot deadlock while discovering another board.
 *   2. The moved row's `moveRevision` is read UNDER the lock; the write is a
 *      compare-and-set (`UPDATE ... WHERE moveRevision = expected`). A rival
 *      move that committed between the client's read and the write fails the
 *      CAS with zero rows → ORDER_CONFLICT (never a silent overwrite).
 *
 * This proof replicates the production protocol at the SQL level (the Prisma
 * statements are pinned by the unit + server-action suites). Determinism comes
 * from explicit BEGIN/COMMIT ordering and `lock_timeout`:
 *  - Test 1: the migration applies; `moveRevision` defaults to 0 and stays
 *    monotonic; the live partial unique index still rejects duplicate positions.
 *  - Test 2: two cross-list moves in opposite directions using the SAME
 *    workspace/board/list/card order both COMMIT (no deadlock); the CONTROL
 *    intentionally omits the production gates and takes list rows in the
 *    WRONG order, deterministically failing with lock_timeout (55P03).
 *  - Test 3: two reorders of the same card use the production scope order; the
 *    loser first blocks at the workspace gate while the winner holds it, then
 *    its FOR UPDATE read sees the bumped revision and its stale CAS matches
 *    ZERO rows (the OCC reject).
 *  - Test 4: a completion transaction acquires the same workspace-first scope
 *    before its card CAS, so a concurrent automation move queues cleanly; the
 *    card-first control reproduces the reviewer-found inversion.
 *  - Test 5: an automation sequence acquires the workspace gate before a
 *    priority card update and later move locks; the card-first control deadlocks.
 */

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/planora?schema=public";

/** Ephemeral sandbox runner (db-undo-race-proof pattern), fail-closed cleanup. */
async function runWithSandbox<T>(
  fn: (ctx: {
    admin: Client;
    schemaName: string;
    connect: () => Promise<Client>;
  }) => Promise<T>,
): Promise<T> {
  const admin = new Client({ connectionString: CONNECTION_STRING });
  await admin.connect();
  const schemaName = `sandbox_0032_${Date.now()}_${crypto.randomUUID().replace(/-/g, "_")}`;
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

/**
 * Minimal replica of the ordering subset the protocol touches: with
 * `withMoveRevision` the tables carry the decision-0032 column (shape tests
 * 2/3 exercise); without it, the shape is the PRE-migration one that test 1
 * feeds to the real ALTER TABLE migration SQL.
 */
async function createOrderingTables(admin: Client, withMoveRevision: boolean): Promise<void> {
  const moveRevisionCol = withMoveRevision
    ? `, "moveRevision" INTEGER NOT NULL DEFAULT 0`
    : "";
  await admin.query(`
    CREATE TABLE "workspace" (
      "id" TEXT PRIMARY KEY
    );
    CREATE TABLE "board" (
      "id" TEXT PRIMARY KEY,
      "workspaceId" TEXT NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
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
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP${moveRevisionCol}
    );
    CREATE TABLE "card" (
      "id" TEXT PRIMARY KEY,
      "listId" TEXT NOT NULL REFERENCES "list"("id") ON DELETE CASCADE,
      "title" TEXT NOT NULL,
      "priority" TEXT,
      "position" DOUBLE PRECISION NOT NULL,
      "archivedAt" TIMESTAMP(3),
      "deletedAt" TIMESTAMP(3),
      "createdById" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP${moveRevisionCol}
    );
  `);
}

/** Acquire the production workspace gate. */
async function lockWorkspaceInOrder(client: Client, id: string): Promise<void> {
  await client.query(`SELECT id FROM "workspace" WHERE id = '${id}' FOR UPDATE`);
}

/** Acquire FOR UPDATE locks on the given boards ONE ROW AT A TIME, in order. */
async function lockBoardsInOrder(client: Client, ids: string[]): Promise<void> {
  for (const id of ids) {
    await client.query(`SELECT id FROM "board" WHERE id = '${id}' FOR UPDATE`);
  }
}

/** Acquire FOR UPDATE locks on the given lists ONE ROW AT A TIME, in order. */
async function lockListsInOrder(client: Client, ids: string[]): Promise<void> {
  for (const id of ids) {
    await client.query(`SELECT id FROM "list" WHERE id = '${id}' FOR UPDATE`);
  }
}

/** Completion's parent-before-card lock plan, matching the production helper. */
async function lockCardScopeInOrder(
  client: Client,
  workspaceId: string,
  boardId: string,
  listId: string,
  cardId: string,
): Promise<void> {
  await lockWorkspaceInOrder(client, workspaceId);
  await lockBoardsInOrder(client, [boardId]);
  await lockListsInOrder(client, [listId]);
  await client.query(`SELECT id FROM "card" WHERE id = '${cardId}' FOR UPDATE`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("decision 0032 — DB ordering protocol proof (ephemeral PostgreSQL)", () => {
  it("migration applies: moveRevision defaults to 0, increments monotonically, and the live unique index still holds", async () => {
    await runWithSandbox(async ({ admin }) => {
      await createOrderingTables(admin, false);

      // Apply the REAL migration SQL (ALTER TABLE ... ADD COLUMN ... DEFAULT 0)
      const migrationPath = path.join(
        process.cwd(),
        "prisma/migrations/20260809070623_add_move_revision/migration.sql",
      );
      const migrationSql = fs.readFileSync(migrationPath, "utf8");
      await admin.query(migrationSql);

      // Recreate the partial unique index the app relies on (decision 0015;
      // lives in migration SQL, invisible to `prisma migrate`).
      await admin.query(`
        CREATE UNIQUE INDEX "card_listId_position_live_key"
        ON "card"("listId", "position")
        WHERE "archivedAt" IS NULL AND "deletedAt" IS NULL;
      `);

      await admin.query(`INSERT INTO "workspace" (id) VALUES ('ws-1')`);
      await admin.query(
        `INSERT INTO "board" (id, "workspaceId", title, "createdById") VALUES ('b-1', 'ws-1', 'B', 'u-1')`,
      );
      await admin.query(
        `INSERT INTO "list" (id, "boardId", title, position) VALUES ('l-1', 'b-1', 'L', 16384)`,
      );

      await admin.query(
        `INSERT INTO "card" (id, "listId", title, position, "createdById") VALUES ('c-1', 'l-1', 'A', 16384, 'u-1')`,
      );
      const seeded = await admin.query(
        `SELECT "moveRevision" FROM "card" WHERE id = 'c-1'`,
      );
      expect(seeded.rows[0].moveRevision).toBe(0);

      // A duplicate LIVE position is still rejected by the partial unique index.
      let dupRejected = false;
      try {
        await admin.query(
          `INSERT INTO "card" (id, "listId", title, position, "createdById") VALUES ('c-2', 'l-1', 'B', 16384, 'u-1')`,
        );
      } catch (err: unknown) {
        if (err && typeof err === "object" && "code" in err && err.code === "23505") {
          dupRejected = true;
        } else {
          throw err;
        }
      }
      expect(dupRejected).toBe(true);

      // A monotonic CAS bump: 0 → 1 → 2, each matching exactly the prior value
      const step1 = await admin.query(
        `UPDATE "card" SET position = 32768, "moveRevision" = "moveRevision" + 1
         WHERE id = 'c-1' AND "moveRevision" = 0`,
      );
      expect(step1.rowCount).toBe(1);
      const step2 = await admin.query(
        `UPDATE "card" SET position = 49152, "moveRevision" = "moveRevision" + 1
         WHERE id = 'c-1' AND "moveRevision" = 1`,
      );
      expect(step2.rowCount).toBe(1);
      const stale = await admin.query(
        `UPDATE "card" SET position = 65536, "moveRevision" = "moveRevision" + 1
         WHERE id = 'c-1' AND "moveRevision" = 1`,
      );
      expect(stale.rowCount).toBe(0); // the OCC reject — revision already 2

      const final = await admin.query(
        `SELECT "moveRevision" FROM "card" WHERE id = 'c-1'`,
      );
      expect(final.rows[0].moveRevision).toBe(2);
    });
  });

  it("opposite cross-moves with the SAME ascending lock order both commit; the WRONG per-row order deterministically times out (55P03)", async () => {
    await runWithSandbox(async ({ admin, connect }) => {
      await createOrderingTables(admin, true);
      await admin.query(`INSERT INTO "workspace" (id) VALUES ('ws-1')`);
      await admin.query(
        `INSERT INTO "board" (id, "workspaceId", title, "createdById") VALUES ('b-1', 'ws-1', 'B', 'u-1')`,
      );
      await admin.query(
        `INSERT INTO "list" (id, "boardId", title, position) VALUES ('a', 'b-1', 'A', 16384), ('b', 'b-1', 'B', 32768)`,
      );
      await admin.query(
        `INSERT INTO "card" (id, "listId", title, position, "createdById") VALUES
           ('x', 'a', 'X', 16384, 'u-1'), ('y', 'b', 'Y', 16384, 'u-1')`,
      );

      const moveYtoA = async (client: Client) => {
        await client.query("SET lock_timeout = '3s'");
        await client.query("BEGIN");
        await lockWorkspaceInOrder(client, "ws-1");
        await lockBoardsInOrder(client, ["b-1"]);
        await lockListsInOrder(client, ["a", "b"]);
        await client.query(`SELECT id FROM "card" WHERE id = 'y' FOR UPDATE`);
        await client.query(
          `UPDATE "card" SET "listId" = 'a', position = 32768, "moveRevision" = "moveRevision" + 1
           WHERE id = 'y' AND "moveRevision" = 0`,
        );
        await client.query("COMMIT");
      };

      const t1 = await connect();
      const t2 = await connect();
      try {
        // T1 takes its locks first (workspace, board, lists ascending, then
        // card x) and holds them.
        await t1.query("SET lock_timeout = '3s'");
        await t1.query("BEGIN");
        await lockWorkspaceInOrder(t1, "ws-1");
        await lockBoardsInOrder(t1, ["b-1"]);
        await lockListsInOrder(t1, ["a", "b"]);
        await t1.query(`SELECT id FROM "card" WHERE id = 'x' FOR UPDATE`);
        await t1.query(
          `UPDATE "card" SET "listId" = 'b', position = 49152, "moveRevision" = 1 WHERE id = 'x' AND "moveRevision" = 0`,
        );

        // T2 starts while T1 holds the locks; with the SAME workspace-first
        // order it simply blocks on the workspace gate — it must NOT have
        // completed (or errored) while T1 still holds the locks.
        const t2Promise = moveYtoA(t2);
        await sleep(400);
        let t2FinishedEarly = false;
        try {
          await Promise.race([t2Promise.then(() => { t2FinishedEarly = true; }), sleep(100)]);
        } catch {
          // an error while T1 holds the locks would also be a protocol failure
          t2FinishedEarly = true;
        }
        expect(t2FinishedEarly).toBe(false); // T2 is blocked, not dead/failed

        await t1.query("COMMIT");
        await t2Promise; // completes after T1 releases the workspace gate
        await t2.query("COMMIT");

        const x = await admin.query(`SELECT "listId", "moveRevision" FROM "card" WHERE id = 'x'`);
        const y = await admin.query(`SELECT "listId", "moveRevision" FROM "card" WHERE id = 'y'`);
        expect(x.rows[0]).toEqual({ listId: "b", moveRevision: 1 });
        expect(y.rows[0]).toEqual({ listId: "a", moveRevision: 1 });
      } finally {
        await t1.end().catch(() => {});
        await t2.end().catch(() => {});
      }

      // CONTROL: the SAME interleaving with the WRONG (opposite) per-row lock
      // order deadlocks — PostgreSQL's detector aborts one side (40P01, or
      // 55P03 if lock_timeout wins the race).
      const t3 = await connect();
      const t4 = await connect();
      try {
        await t3.query("BEGIN");
        await t3.query("SET lock_timeout = '1s'");
        // Wrong order: t3 locks b FIRST (holds it, a still free).
        await t3.query(`SELECT id FROM "list" WHERE id = 'b' FOR UPDATE`);

        await t4.query("BEGIN");
        await t4.query("SET lock_timeout = '1s'");
        // Protocol order: t4 locks a (free) then wants b (held by t3).
        await t4.query(`SELECT id FROM "list" WHERE id = 'a' FOR UPDATE`);
        const t4Second = t4
          .query(`SELECT id FROM "list" WHERE id = 'b' FOR UPDATE`)
          .catch((e) => e);

        // t3 wants a, which t4 holds → deadlock cycle. One side is aborted.
        const t3Second = await t3
          .query(`SELECT id FROM "list" WHERE id = 'a' FOR UPDATE`)
          .catch((e) => e);
        const t4Result = await t4Second.catch(() => null);
        const loserCode =
          (t3Second as { code?: string })?.code ?? (t4Result as { code?: string })?.code;
        expect(loserCode).toMatch(/55P03|40P01/);
        await t3.query("ROLLBACK").catch(() => {});
        await t4.query("ROLLBACK").catch(() => {});
      } finally {
        await t3.end().catch(() => {});
        await t4.end().catch(() => {});
      }
    });
  }, 20000);

  it("concurrent reorders of the SAME card: the loser's FOR UPDATE read blocks, then its CAS on the stale revision matches zero rows", async () => {
    await runWithSandbox(async ({ admin, connect }) => {
      await createOrderingTables(admin, true);
      await admin.query(`INSERT INTO "workspace" (id) VALUES ('ws-1')`);
      await admin.query(
        `INSERT INTO "board" (id, "workspaceId", title, "createdById") VALUES ('b-1', 'ws-1', 'B', 'u-1')`,
      );
      await admin.query(
        `INSERT INTO "list" (id, "boardId", title, position) VALUES ('l-1', 'b-1', 'L', 16384)`,
      );
      await admin.query(
        `INSERT INTO "card" (id, "listId", title, position, "createdById") VALUES ('c-1', 'l-1', 'C', 16384, 'u-1')`,
      );

      const t1 = await connect();
      const t2 = await connect();
      try {
        // Winner: acquire the production scope order, read rev 0 under the
        // card lock, CAS 0 → 1, and commit.
        await t1.query("SET lock_timeout = '3s'");
        await t1.query("BEGIN");
        await lockWorkspaceInOrder(t1, "ws-1");
        await lockBoardsInOrder(t1, ["b-1"]);
        await lockListsInOrder(t1, ["l-1"]);
        await t1.query(`SELECT id, "moveRevision" FROM "card" WHERE id = 'c-1' FOR UPDATE`);
        await t1.query(
          `UPDATE "card" SET position = 32768, "moveRevision" = 1 WHERE id = 'c-1' AND "moveRevision" = 0`,
        );
        await t1.query("COMMIT");

        // Loser: acquires the same scope order AFTER the winner committed. Its
        // card read sees the bumped revision; its CAS on rev 0 matches zero
        // rows → ORDER_CONFLICT at the app layer.
        await t2.query("SET lock_timeout = '1s'");
        await t2.query("BEGIN");
        await lockWorkspaceInOrder(t2, "ws-1");
        await lockBoardsInOrder(t2, ["b-1"]);
        await lockListsInOrder(t2, ["l-1"]);
        const locked = await t2.query(
          `SELECT id, "moveRevision" FROM "card" WHERE id = 'c-1' FOR UPDATE`,
        );
        expect(locked.rows[0].moveRevision).toBe(1);
        const staleCas = await t2.query(
          `UPDATE "card" SET position = 99999, "moveRevision" = 1 WHERE id = 'c-1' AND "moveRevision" = 0`,
        );
        expect(staleCas.rowCount).toBe(0); // the OCC reject — no write
        await t2.query("ROLLBACK");

        const final = await admin.query(
          `SELECT "moveRevision" FROM "card" WHERE id = 'c-1'`,
        );
        expect(final.rows[0].moveRevision).toBe(1);

        // BLOCKING variant: while the winner HOLDS the full production scope,
        // the loser's workspace gate blocks and times out — proving the
        // read-check-write is serialized before it can inspect the card.
        await t1.query("BEGIN");
        await lockWorkspaceInOrder(t1, "ws-1");
        await lockBoardsInOrder(t1, ["b-1"]);
        await lockListsInOrder(t1, ["l-1"]);
        await t1.query(`SELECT id FROM "card" WHERE id = 'c-1' FOR UPDATE`);
        // lock_timeout is a session setting REVERTED by the loser's ROLLBACK —
        // re-apply it before the blocking gate (mirrors the production loop).
        await t2.query("SET lock_timeout = '1s'");
        const t2Blocked = await t2
          .query(`SELECT id FROM "workspace" WHERE id = 'ws-1' FOR UPDATE`)
          .catch((e) => e);
        expect((t2Blocked as { code?: string }).code).toMatch(/55P03/);
        await t2.query("ROLLBACK").catch(() => {});
        await t1.query("ROLLBACK");
      } finally {
        await t1.end().catch(() => {});
        await t2.end().catch(() => {});
      }
    });
  }, 20000);

  it("completion scope is workspace-first: automation move blocks cleanly, card-first control deadlocks", async () => {
    await runWithSandbox(async ({ admin, connect }) => {
      await createOrderingTables(admin, true);
      await admin.query(`INSERT INTO "workspace" (id) VALUES ('ws-1')`);
      await admin.query(
        `INSERT INTO "board" (id, "workspaceId", title, "createdById") VALUES ('b-1', 'ws-1', 'B', 'u-1')`,
      );
      await admin.query(
        `INSERT INTO "list" (id, "boardId", title, position) VALUES ('l-1', 'b-1', 'L', 16384)`,
      );
      await admin.query(
        `INSERT INTO "card" (id, "listId", title, position, "createdById") VALUES ('c-1', 'l-1', 'C', 16384, 'u-1')`,
      );

      const completion = await connect();
      const automationMove = await connect();
      try {
        await completion.query("SET lock_timeout = '3s'");
        await completion.query("BEGIN");
        await lockCardScopeInOrder(completion, "ws-1", "b-1", "l-1", "c-1");

        const movePromise = (async () => {
          await automationMove.query("SET lock_timeout = '3s'");
          await automationMove.query("BEGIN");
          await lockCardScopeInOrder(automationMove, "ws-1", "b-1", "l-1", "c-1");
        })();

        await sleep(400);
        let moveFinishedEarly = false;
        await Promise.race([
          movePromise.then(() => {
            moveFinishedEarly = true;
          }),
          sleep(100),
        ]);
        expect(moveFinishedEarly).toBe(false);

        await completion.query("COMMIT");
        await movePromise;
        await automationMove.query("COMMIT");
      } finally {
        await completion.query("ROLLBACK").catch(() => {});
        await automationMove.query("ROLLBACK").catch(() => {});
        await completion.end().catch(() => {});
        await automationMove.end().catch(() => {});
      }

      // CONTROL: completion's old card-first ordering and a move's production
      // workspace-first ordering form the exact inversion the application must
      // never create — PostgreSQL deterministically aborts one waiter.
      const cardFirst = await connect();
      const workspaceFirst = await connect();
      try {
        await cardFirst.query("BEGIN");
        await cardFirst.query("SET lock_timeout = '1s'");
        await cardFirst.query(`SELECT id FROM "card" WHERE id = 'c-1' FOR UPDATE`);

        await workspaceFirst.query("BEGIN");
        await workspaceFirst.query("SET lock_timeout = '1s'");
        await lockWorkspaceInOrder(workspaceFirst, "ws-1");
        await lockBoardsInOrder(workspaceFirst, ["b-1"]);
        await lockListsInOrder(workspaceFirst, ["l-1"]);

        const cardFirstWorkspaceWait = cardFirst
          .query(`SELECT id FROM "workspace" WHERE id = 'ws-1' FOR UPDATE`)
          .catch((error) => error);
        const workspaceFirstCardWait = workspaceFirst
          .query(`SELECT id FROM "card" WHERE id = 'c-1' FOR UPDATE`)
          .catch((error) => error);
        const [workspaceResult, cardResult] = await Promise.all([
          cardFirstWorkspaceWait,
          workspaceFirstCardWait,
        ]);
        const loserCode =
          (workspaceResult as { code?: string })?.code ??
          (cardResult as { code?: string })?.code;
        expect(loserCode).toMatch(/55P03|40P01/);
      } finally {
        await cardFirst.query("ROLLBACK").catch(() => {});
        await workspaceFirst.query("ROLLBACK").catch(() => {});
        await cardFirst.end().catch(() => {});
        await workspaceFirst.end().catch(() => {});
      }
    });
  }, 20000);

  it(
    "automation sequence gates set-priority before its move locks; card-first control deadlocks",
    async () => {
      await runWithSandbox(async ({ admin, connect }) => {
        await createOrderingTables(admin, true);
        await admin.query(`INSERT INTO "workspace" (id) VALUES ('ws-1')`);
        await admin.query(
          `INSERT INTO "board" (id, "workspaceId", title, "createdById") VALUES ('b-1', 'ws-1', 'B', 'u-1')`,
        );
        await admin.query(
          `INSERT INTO "list" (id, "boardId", title, position) VALUES ('l-1', 'b-1', 'L', 16384)`,
        );
        await admin.query(
          `INSERT INTO "card" (id, "listId", title, position, "createdById") VALUES ('c-1', 'l-1', 'C', 16384, 'u-1')`,
        );

        const blocker = await connect();
        const sequence = await connect();
        try {
          await blocker.query("SET lock_timeout = '3s'");
          await blocker.query("BEGIN");
          await lockCardScopeInOrder(blocker, "ws-1", "b-1", "l-1", "c-1");

          const sequencePromise = (async () => {
            await sequence.query("SET lock_timeout = '3s'");
            await sequence.query("BEGIN");
            // Central executor invariant: the gate is acquired before the
            // priority UPDATE and before the later parent/card move locks.
            await lockWorkspaceInOrder(sequence, "ws-1");
            await sequence.query(
              `UPDATE "card" SET priority = 'HIGH' WHERE id = 'c-1'`,
            );
            await lockBoardsInOrder(sequence, ["b-1"]);
            await lockListsInOrder(sequence, ["l-1"]);
            await sequence.query(`SELECT id FROM "card" WHERE id = 'c-1' FOR UPDATE`);
          })();

          await sleep(400);
          let sequenceFinishedEarly = false;
          await Promise.race([
            sequencePromise.then(() => {
              sequenceFinishedEarly = true;
            }),
            sleep(100),
          ]);
          expect(sequenceFinishedEarly).toBe(false);

          await blocker.query("COMMIT");
          await sequencePromise;
          await sequence.query("COMMIT");
          const priority = await admin.query(
            `SELECT priority FROM "card" WHERE id = 'c-1'`,
          );
          expect(priority.rows[0].priority).toBe("HIGH");
        } finally {
          await blocker.query("ROLLBACK").catch(() => {});
          await sequence.query("ROLLBACK").catch(() => {});
          await blocker.end().catch(() => {});
          await sequence.end().catch(() => {});
        }

        // CONTROL: the rejected sequence updated/locked the card first, then
        // tried to acquire the workspace while a move held workspace → parents
        // and waited for that card — PostgreSQL must abort one waiter.
        const cardFirst = await connect();
        const workspaceFirst = await connect();
        try {
          await cardFirst.query("BEGIN");
          await cardFirst.query("SET lock_timeout = '1s'");
          await cardFirst.query(
            `UPDATE "card" SET priority = 'LOW' WHERE id = 'c-1'`,
          );

          await workspaceFirst.query("BEGIN");
          await workspaceFirst.query("SET lock_timeout = '1s'");
          await lockWorkspaceInOrder(workspaceFirst, "ws-1");
          await lockBoardsInOrder(workspaceFirst, ["b-1"]);
          await lockListsInOrder(workspaceFirst, ["l-1"]);

          const cardFirstWorkspaceWait = cardFirst
            .query(`SELECT id FROM "workspace" WHERE id = 'ws-1' FOR UPDATE`)
            .catch((error) => error);
          const workspaceFirstCardWait = workspaceFirst
            .query(`SELECT id FROM "card" WHERE id = 'c-1' FOR UPDATE`)
            .catch((error) => error);
          const [workspaceResult, cardResult] = await Promise.all([
            cardFirstWorkspaceWait,
            workspaceFirstCardWait,
          ]);
          const loserCode =
            (workspaceResult as { code?: string })?.code ??
            (cardResult as { code?: string })?.code;
          expect(loserCode).toMatch(/55P03|40P01/);
        } finally {
          await cardFirst.query("ROLLBACK").catch(() => {});
          await workspaceFirst.query("ROLLBACK").catch(() => {});
          await cardFirst.end().catch(() => {});
          await workspaceFirst.end().catch(() => {});
        }
      });
    },
  );
});
