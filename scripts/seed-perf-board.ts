#!/usr/bin/env tsx
/**
 * Perf-board seeder (local profiling only — NOT a migration, NOT a fixture).
 *
 * Builds one workspace + board with a controlled list/card count for the DnD
 * INP-vs-board-size curve (US-027). Card shape mirrors the real cheap case
 * (title only) unless --rich, so DOM weight stays conservative.
 *
 * Usage: npx tsx --env-file=.env scripts/seed-perf-board.ts --email <user> --cards 90 [--lists 5] [--slug perf-90]
 * Idempotent per slug: re-running deletes and recreates the workspace.
 */
import { randomUUID } from "node:crypto";

import db from "@/lib/prisma";

const GAP = 16384;

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required --${name}`);
}

async function main() {
  const email = arg("email");
  const totalCards = parseInt(arg("cards"), 10);
  const listCount = parseInt(arg("lists", "5"), 10);
  const slug = arg("slug", `perf-${totalCards}`);
  // --rich: each card gets 2 labels + a priority chip, matching a realistic
  // (heavier-DOM) Trello-style card rather than a title-only minimum.
  const rich = process.argv.includes("--rich");
  const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;

  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user for ${email} — sign up via the UI first.`);

  // Idempotent: wipe a prior run with this slug (cascade clears boards/lists/cards).
  const existing = await db.workspace.findUnique({ where: { slug } });
  if (existing) {
    await db.workspace.delete({ where: { id: existing.id } });
  }

  const workspace = await db.workspace.create({
    data: {
      id: randomUUID(),
      name: `Perf ${totalCards}`,
      slug,
      createdAt: new Date(),
      workspacemembers: {
        create: {
          id: randomUUID(),
          userId: user.id,
          role: "admin",
          createdAt: new Date(),
        },
      },
    },
  });

  const board = await db.board.create({
    data: {
      workspaceId: workspace.id,
      title: `Perf board (${totalCards} cards, ${listCount} lists)`,
      createdById: user.id,
    },
  });

  // Realistic boards have a handful of labels in play; create them once.
  const labelIds: string[] = [];
  if (rich) {
    const palette = [
      { name: "Bug", color: "#ef4444" },
      { name: "Feature", color: "#3b82f6" },
      { name: "Chore", color: "#a855f7" },
      { name: "Backend", color: "#22c55e" },
      { name: "Design", color: "#f59e0b" },
    ];
    for (const l of palette) {
      const label = await db.label.create({
        data: { boardId: board.id, name: l.name, color: l.color },
      });
      labelIds.push(label.id);
    }
  }

  // Distribute cards as evenly as possible across the lists.
  const base = Math.floor(totalCards / listCount);
  const remainder = totalCards % listCount;
  let seq = 0;

  for (let li = 0; li < listCount; li++) {
    const list = await db.list.create({
      data: {
        boardId: board.id,
        title: `List ${li + 1}`,
        position: (li + 1) * GAP,
      },
    });

    const cardsInList = base + (li < remainder ? 1 : 0);
    for (let ci = 0; ci < cardsInList; ci++) {
      const card = await db.card.create({
        data: {
          listId: list.id,
          title: `Card ${li + 1}-${ci + 1} — a realistic-length task title`,
          position: (ci + 1) * GAP,
          createdById: user.id,
          ...(rich ? { priority: PRIORITIES[seq % PRIORITIES.length] } : {}),
        },
      });
      if (rich) {
        // 2 labels per card (rotating through the palette).
        await db.cardLabel.createMany({
          data: [
            { cardId: card.id, labelId: labelIds[seq % labelIds.length] },
            { cardId: card.id, labelId: labelIds[(seq + 1) % labelIds.length] },
          ],
        });
      }
      seq++;
    }
  }

  console.log(`Seeded ${totalCards} cards / ${listCount} lists${rich ? " (rich)" : ""}`);
  console.log(`BOARD_URL=/boards/${board.id}`);
  console.log(`BOARD_ID=${board.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
