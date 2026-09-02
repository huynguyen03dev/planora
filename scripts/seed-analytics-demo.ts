#!/usr/bin/env tsx
/**
 * Analytics demo seeder (local QA only — NOT a migration).
 *
 * Builds a workspace whose event stream exercises every US-001 behavior:
 * late/on-time/no-due-date completions, >100 current-period completions
 * (truncation notice), rising overdue & completed-late counts, a zero->nonzero
 * reopen rate, and an empty board (no-data state).
 *
 * Usage: npx tsx --env-file=.env scripts/seed-analytics-demo.ts --email <user-email> [--slug analytics-demo]
 * Idempotent: re-running deletes and recreates the workspace with the given slug.
 */

import { randomUUID } from "node:crypto";

import type { Prisma } from "@/app/generated/prisma/client";
import { CardHistoryEventType } from "@/app/generated/prisma/client";
import db from "@/lib/prisma";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const now = new Date();

function daysAgo(days: number, hour = 12): Date {
  const d = new Date(now.getTime() - days * MS_PER_DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

// Deterministic-ish small RNG so reruns look similar without importing a dep.
let seed = 1337;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function randInt(min: number, max: number): number {
  return Math.floor(min + rand() * (max - min + 1));
}
function pick<T>(items: T[]): T {
  return items[randInt(0, items.length - 1)];
}

const TITLE_VERBS = ["Implement", "Fix", "Refactor", "Design", "Investigate", "Document", "Optimize", "Add", "Remove", "Migrate"];
const TITLE_NOUNS = ["OAuth login", "board drag-drop", "card filters", "realtime sync", "notification center", "label editor", "search index", "export pipeline", "due-date reminders", "member invites", "checklist UI", "activity feed", "dark mode", "rate limiter", "audit log"];

function makeTitle(i: number): string {
  return `${pick(TITLE_VERBS)} ${pick(TITLE_NOUNS)} (#${i})`;
}

type Lists = { backlogId: string; progressId: string; doneId: string };

type CardScenario = {
  title: string;
  createdDaysAgo: number;
  estimateHours: number | null;
  completedDaysAgo: number | null; // null = still active
  dueDaysAgo: number | null; // due date relative to now; null = no due date
  reopenedDaysAgo: number | null; // null = not reopened
};

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => a.startsWith("--email="))?.split("=")[1];
  const slug = args.find((a) => a.startsWith("--slug="))?.split("=")[1] ?? "analytics-demo";

  if (!email) {
    console.error("Usage: npx tsx --env-file=.env scripts/seed-analytics-demo.ts --email=<user-email> [--slug=analytics-demo]");
    process.exit(1);
  }

  const user = await db.user.findFirst({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email}. Sign up first, then rerun.`);
    process.exit(1);
  }
  console.log(`Seeding for user ${user.email} (${user.id}), slug "${slug}"`);

  // Idempotent: drop any prior workspace with this slug (cascades to boards/events).
  const existing = await db.workspace.findUnique({ where: { slug } });
  if (existing) {
    await db.workspace.delete({ where: { id: existing.id } });
    console.log("Removed existing demo workspace.");
  }

  const workspaceId = randUuidOrgId();
  await db.workspace.create({
    data: {
      id: workspaceId,
      name: "Analytics Demo",
      slug,
      timezone: "UTC",
      // Both the 30d range and its prior comparison period start well after this,
      // so metrics read as high-confidence (no launch-boundary banner).
      analyticsLaunchAt: daysAgo(120),
      createdAt: daysAgo(120),
      workspacemembers: {
        create: {
          id: randomUUID(),
          userId: user.id,
          role: "admin",
          createdAt: daysAgo(120),
        },
      },
    },
  });

  // Primary board with the lifecycle lists, plus an empty board for the no-data demo.
  const board = await db.board.create({
    data: {
      id: randomUUID(),
      workspaceId,
      title: "Product Delivery",
      createdById: user.id,
      createdAt: daysAgo(120),
      updatedAt: now,
      lists: {
        create: [
          { id: randomUUID(), title: "Backlog", position: 0, createdAt: daysAgo(120), updatedAt: now },
          { id: randomUUID(), title: "In Progress", position: 1, createdAt: daysAgo(120), updatedAt: now },
          { id: randomUUID(), title: "Done", position: 2, createdAt: daysAgo(120), updatedAt: now },
        ],
      },
    },
    include: { lists: true },
  });

  await db.board.create({
    data: {
      id: randomUUID(),
      workspaceId,
      title: "Empty Board (no data)",
      createdById: user.id,
      createdAt: daysAgo(120),
      updatedAt: now,
      lists: {
        create: [
          { id: randomUUID(), title: "Backlog", position: 0, createdAt: daysAgo(120), updatedAt: now },
          { id: randomUUID(), title: "Done", position: 1, createdAt: daysAgo(120), updatedAt: now },
        ],
      },
    },
  });

  const lists: Lists = {
    backlogId: board.lists.find((l) => l.title === "Backlog")!.id,
    progressId: board.lists.find((l) => l.title === "In Progress")!.id,
    doneId: board.lists.find((l) => l.title === "Done")!.id,
  };

  const scenarios: CardScenario[] = [];
  let counter = 0;

  // dueKind: "late" => completed after due; "ontime" => completed before due; "none" => no due date
  function completedScenario(completedDaysAgo: number, dueKind: "late" | "ontime" | "none", reopen = false) {
    counter += 1;
    const lead = randInt(1, 18);
    const dueDaysAgo =
      dueKind === "none"
        ? null
        : dueKind === "late"
        ? completedDaysAgo + randInt(1, 4) // due before completion
        : completedDaysAgo - randInt(1, 3); // due after completion
    scenarios.push({
      title: makeTitle(counter),
      createdDaysAgo: completedDaysAgo + lead,
      estimateHours: rand() < 0.85 ? randInt(2, 16) : null,
      completedDaysAgo,
      dueDaysAgo,
      reopenedDaysAgo: reopen ? Math.max(0, completedDaysAgo - 1) : null,
    });
  }

  // --- Previous period (30..58 days ago): ~90 completed, fewer late, NO reopens ---
  for (let i = 0; i < 90; i++) {
    const completedDaysAgo = randInt(31, 57);
    // ~13% late in the prior period
    const kind = rand() < 0.13 ? "late" : rand() < 0.6 ? "ontime" : "none";
    completedScenario(completedDaysAgo, kind, false);
  }

  // --- Current period (0..29 days ago): 115 completed (>100 => truncation) ---
  //     more late completions (regression), and some reopens (0 -> N => "New").
  for (let i = 0; i < 115; i++) {
    const completedDaysAgo = randInt(0, 29);
    // ~22% late now (up from 13% => Completed Late trend is a regression/red)
    const kind = rand() < 0.22 ? "late" : rand() < 0.6 ? "ontime" : "none";
    const reopen = rand() < 0.06; // ~7 reopened => reopen rate "New" vs prior 0
    completedScenario(completedDaysAgo, kind, reopen);
  }

  // --- Active cards (drive Remaining Hours, Overdue, Coverage) ---
  //     Created within the current range; several overdue now. A few unestimated
  //     so coverage < 100%.
  for (let i = 0; i < 16; i++) {
    counter += 1;
    const overdue = i < 9; // 9 overdue active cards now
    scenarios.push({
      title: makeTitle(counter),
      createdDaysAgo: randInt(2, 25),
      estimateHours: i < 13 ? randInt(3, 12) : null, // 3 unestimated => coverage ~81%
      completedDaysAgo: null,
      dueDaysAgo: overdue ? randInt(1, 6) : null,
      reopenedDaysAgo: null,
    });
  }

  // Build Card rows + events.
  const cardRows: Prisma.CardCreateManyInput[] = [];
  const events: Prisma.CardHistoryEventCreateManyInput[] = [];
  let position = 1;

  for (const s of scenarios) {
    const cardId = randomUUID();
    const createdAt = daysAgo(s.createdDaysAgo, randInt(8, 18));
    const dueDate = s.dueDaysAgo === null ? null : daysAgo(s.dueDaysAgo, 17);
    const completedAt = s.completedDaysAgo === null ? null : daysAgo(s.completedDaysAgo, randInt(9, 19));
    const reopenedAt = s.reopenedDaysAgo === null ? null : daysAgo(s.reopenedDaysAgo, 20);
    const isReopened = reopenedAt !== null;
    const memberIds = [user.id];

    // Card row: reflects latest state (reopened => back in progress, not completed).
    const finalListId = isReopened ? lists.progressId : completedAt ? lists.doneId : s.dueDaysAgo !== null ? lists.progressId : lists.backlogId;
    cardRows.push({
      id: cardId,
      listId: finalListId,
      title: s.title,
      position: position++,
      dueDate,
      estimateHours: s.estimateHours,
      completedAt: isReopened ? null : completedAt,
      createdById: user.id,
      createdAt,
      updatedAt: now,
    });

    events.push({
      id: randomUUID(),
      workspaceId,
      boardId: board.id,
      cardId,
      actorId: user.id,
      eventType: CardHistoryEventType.CARD_CREATED,
      occurredAt: createdAt,
      metadata: {
        listId: lists.backlogId,
        estimateHours: s.estimateHours,
        dueDate: isoOrNull(dueDate),
        memberIds,
        archivedAt: null,
        deletedAt: null,
      },
    });

    if (completedAt) {
      events.push({
        id: randomUUID(),
        workspaceId,
        boardId: board.id,
        cardId,
        actorId: user.id,
        eventType: CardHistoryEventType.CARD_COMPLETED,
        occurredAt: completedAt,
        metadata: {
          listId: lists.doneId,
          estimateHours: s.estimateHours,
          dueDate: isoOrNull(dueDate),
          memberIds,
          firstCompletion: true,
        },
      });
    }

    if (reopenedAt) {
      events.push({
        id: randomUUID(),
        workspaceId,
        boardId: board.id,
        cardId,
        actorId: user.id,
        eventType: CardHistoryEventType.CARD_REOPENED,
        occurredAt: reopenedAt,
        metadata: {
          listId: lists.progressId,
          dueDate: isoOrNull(dueDate),
          memberIds,
        },
      });
    }
  }

  // Insert in chronological order so autoincrement sequence aligns with occurredAt.
  events.sort((a, b) => (a.occurredAt as Date).getTime() - (b.occurredAt as Date).getTime());

  await db.card.createMany({ data: cardRows });
  await db.cardHistoryEvent.createMany({ data: events });

  const completedCount = scenarios.filter((s) => s.completedDaysAgo !== null).length;
  const currentCompleted = scenarios.filter((s) => s.completedDaysAgo !== null && s.completedDaysAgo <= 29).length;
  console.log(
    [
      `Seeded ${cardRows.length} cards, ${events.length} history events.`,
      `${completedCount} completed (${currentCompleted} in current 30d range).`,
      `Dashboard: /workspace/${slug}/dashboard`,
    ].join("\n"),
  );
}

// Better Auth organization IDs are opaque strings; a uuid works for our seed.
function randUuidOrgId(): string {
  return randomUUID();
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await db.$disconnect();
    process.exit(1);
  });
