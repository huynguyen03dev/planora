import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

import db from "@/lib/prisma";

type ActivityAction = "CREATED" | "UPDATED" | "MOVED" | "ARCHIVED" | "RESTORED" | "DELETED" | "COMMENTED";
type ActivityEntityType = "BOARD" | "LIST" | "CARD" | "COMMENT" | "MEMBER" | "LABEL" | "CHECKLIST" | "ATTACHMENT";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonValue = any;

export type ActivityRecord = {
  id: string;
  workspaceId: string;
  boardId: string | null;
  cardId: string | null;
  userId: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  metadata: JsonValue | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    image: string | null;
  };
};

export async function getActivityByCardId(
  cardId: string,
): Promise<ActivityRecord[]> {
  return db.activity.findMany({
    where: {
      cardId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      workspaceId: true,
      boardId: true,
      cardId: true,
      userId: true,
      action: true,
      entityType: true,
      metadata: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });
}

export async function createActivityEntry(
  data: {
    workspaceId: string;
    boardId: string | null;
    cardId: string | null;
    userId: string;
    action: ActivityAction;
    entityType: ActivityEntityType;
    metadata?: JsonValue | null;
  },
  client?: Prisma.TransactionClient,
): Promise<ActivityRecord> {
  const c = client ?? db;
  return c.activity.create({
    data: {
      workspaceId: data.workspaceId,
      boardId: data.boardId,
      cardId: data.cardId,
      userId: data.userId,
      action: data.action,
      entityType: data.entityType,
      metadata: data.metadata ?? null,
    },
    select: {
      id: true,
      workspaceId: true,
      boardId: true,
      cardId: true,
      userId: true,
      action: true,
      entityType: true,
      metadata: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });
}