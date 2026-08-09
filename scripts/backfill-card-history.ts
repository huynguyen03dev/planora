#!/usr/bin/env tsx
/**
 * Captures an existing workspace's launch boundary and creates the minimum
 * card history needed for post-launch analytics, without inventing
 * pre-launch movement/completion/reopen sequences.
 */

import type { Prisma } from "@/app/generated/prisma/client";
import { CardHistoryEventType } from "@/app/generated/prisma/client";
import db from "@/lib/prisma";

const prisma = db;

type CardSnapshot = {
  id: string;
  listId: string;
  list: {
    boardId: string;
  };
  estimateHours: number | null;
  dueDate: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  members: {
    userId: string;
  }[];
};

type BackfillPlan = {
  launchAt: Date;
  shouldSetLaunchAt: boolean;
  baselineEvents: Prisma.CardHistoryEventCreateManyInput[];
  createdEvents: Prisma.CardHistoryEventCreateManyInput[];
  totalCards: number;
  baselineEligibleCards: number;
};

type BackfillClient = Pick<
  typeof prisma,
  "workspace" | "card" | "cardHistoryEvent"
>;

function toIsoOrNull(date: Date | null): string | null {
  return date?.toISOString() ?? null;
}

function getSnapshotMetadata(card: CardSnapshot): Prisma.InputJsonObject {
  return {
    listId: card.listId,
    estimateHours: card.estimateHours,
    dueDate: toIsoOrNull(card.dueDate),
    memberIds: card.members.map((member) => member.userId),
    archivedAt: toIsoOrNull(card.archivedAt),
    deletedAt: toIsoOrNull(card.deletedAt),
    completedAt: toIsoOrNull(card.completedAt),
  };
}

async function buildBackfillPlan(
  client: BackfillClient,
  workspaceId: string,
): Promise<BackfillPlan> {
  console.log(`Processing workspace: ${workspaceId}`);

  const workspace = await client.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, analyticsLaunchAt: true },
  });

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  const launchAt = workspace.analyticsLaunchAt ?? new Date();

  const cards = await client.card.findMany({
    where: {
      list: {
        board: { workspaceId },
      },
    },
    select: {
      id: true,
      listId: true,
      list: {
        select: {
          boardId: true,
        },
      },
      estimateHours: true,
      dueDate: true,
      completedAt: true,
      archivedAt: true,
      deletedAt: true,
      createdAt: true,
      members: {
        select: { userId: true },
      },
    },
  });

  const cardIds = cards.map((card) => card.id);

  const existingEvents = cardIds.length > 0
    ? await client.cardHistoryEvent.findMany({
        where: {
          workspaceId,
          cardId: { in: cardIds },
          eventType: {
            in: [
              CardHistoryEventType.BASELINE_CAPTURED,
              CardHistoryEventType.CARD_CREATED,
            ],
          },
        },
        select: {
          cardId: true,
          eventType: true,
        },
      })
    : [];

  const existingBaselineCardIds = new Set(
    existingEvents
      .filter((event) => event.eventType === CardHistoryEventType.BASELINE_CAPTURED)
      .map((event) => event.cardId),
  );
  const existingCreatedCardIds = new Set(
    existingEvents
      .filter((event) => event.eventType === CardHistoryEventType.CARD_CREATED)
      .map((event) => event.cardId),
  );

  const baselineEligibleCards = cards.filter(
    (card) => card.createdAt.getTime() <= launchAt.getTime(),
  );

  const baselineEvents = baselineEligibleCards
    .filter((card) => !existingBaselineCardIds.has(card.id))
    .map((card) => ({
      workspaceId,
      boardId: card.list.boardId,
      cardId: card.id,
      actorId: null,
      eventType: CardHistoryEventType.BASELINE_CAPTURED,
      occurredAt: launchAt,
      metadata: getSnapshotMetadata(card),
    }));

  const createdEvents = cards
    .filter((card) => !existingCreatedCardIds.has(card.id))
    .map((card) => ({
      workspaceId,
      boardId: card.list.boardId,
      cardId: card.id,
      actorId: null,
      eventType: CardHistoryEventType.CARD_CREATED,
      occurredAt: card.createdAt,
      metadata: getSnapshotMetadata(card),
    }));

  return {
    launchAt,
    shouldSetLaunchAt: workspace.analyticsLaunchAt === null,
    baselineEvents,
    createdEvents,
    totalCards: cards.length,
    baselineEligibleCards: baselineEligibleCards.length,
  };
}

async function backfillWorkspace(workspaceId: string, dryRun = false) {
  const logPlan = (plan: BackfillPlan) => {
    console.log(
      [
        `Found ${plan.totalCards} cards`,
        `${plan.baselineEligibleCards} existed at launch boundary`,
        `${plan.baselineEvents.length} baseline events to create`,
        `${plan.createdEvents.length} created events to create`,
        plan.shouldSetLaunchAt
          ? `analyticsLaunchAt will be set to ${plan.launchAt.toISOString()}`
          : `analyticsLaunchAt already set to ${plan.launchAt.toISOString()}`,
      ].join(". "),
    );
  };

  if (dryRun) {
    const plan = await buildBackfillPlan(prisma, workspaceId);
    logPlan(plan);
    console.log("DRY RUN - no changes made");
    return;
  }

  const appliedPlan = await prisma.$transaction(async (tx) => {
    const plan = await buildBackfillPlan(tx, workspaceId);
    logPlan(plan);

    if (plan.baselineEvents.length > 0) {
      await tx.cardHistoryEvent.createMany({
        data: plan.baselineEvents,
      });
    }

    if (plan.createdEvents.length > 0) {
      await tx.cardHistoryEvent.createMany({
        data: plan.createdEvents,
      });
    }

    if (plan.shouldSetLaunchAt) {
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { analyticsLaunchAt: plan.launchAt },
      });
    }
    return plan;
  });

  console.log(
    `Backfill complete. Analytics launch boundary: ${appliedPlan.launchAt.toISOString()}.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const workspaceId = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");

  if (!workspaceId) {
    console.error("Usage: tsx scripts/backfill-card-history.ts <workspace-id> [--dry-run]");
    process.exit(1);
  }

  try {
    await backfillWorkspace(workspaceId, dryRun);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
