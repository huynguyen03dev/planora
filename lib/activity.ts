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

/** Default page size for `getActivityByCardId` when called with options. */
export const ACTIVITY_PAGE_SIZE = 50;

/**
 * Cursor for paged activity (createdAt-desc order): the row boundary is the
 * *last loaded* entry; the next page returns only entries strictly older than
 * it. `id` tie-breaks entries that share a `createdAt`, so equal timestamps
 * can never shift rows between pages or drop one at a page boundary.
 */
export type ActivityCursor = {
  createdAt: Date | string;
  id: string;
};

export type GetActivityByCardIdOptions = {
  /** Max entries per page. Defaults to `ACTIVITY_PAGE_SIZE` (50). */
  limit?: number;
  /** Fetch only entries strictly older than this cursor (first page = none). */
  before?: ActivityCursor;
};

export type ActivityPage = {
  items: ActivityRecord[];
  /** True when another page exists behind the returned `items`. */
  hasMore: boolean;
};

const activitySelect = {
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
} satisfies Prisma.ActivitySelect;

/**
 * Loads the activity feed for a card (newest first).
 *
 * Backward-compatible: calling without `options` returns ALL entries (the
 * legacy behavior). With `options`, returns a capped page plus `hasMore`
 * (fetches `limit + 1` rows, so `hasMore` is exact without a second count
 * query). Pagination is cursor-based on the last loaded entry; the id
 * tie-breaker keeps pages deterministic when timestamps collide.
 */
export async function getActivityByCardId(
  cardId: string,
): Promise<ActivityRecord[]>;
export async function getActivityByCardId(
  cardId: string,
  options: GetActivityByCardIdOptions,
): Promise<ActivityPage>;
export async function getActivityByCardId(
  cardId: string,
  options?: GetActivityByCardIdOptions,
): Promise<ActivityRecord[] | ActivityPage> {
  if (options === undefined) {
    // Legacy contract: no options → everything, in legacy (createdAt-desc) order.
    return db.activity.findMany({
      where: { cardId },
      orderBy: { createdAt: "desc" },
      select: activitySelect,
    });
  }

  const limit = options.limit ?? ACTIVITY_PAGE_SIZE;
  const before = options.before;

  const rows = await db.activity.findMany({
    where: {
      cardId,
      // Compound cursor: strictly older than (before.createdAt, before.id).
      // `AND` wraps the OR so the cardId scope and the cursor compose.
      ...(before
        ? {
            AND: [
              {
                OR: [
                  { createdAt: { lt: before.createdAt } },
                  { createdAt: before.createdAt, id: { lt: before.id } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: activitySelect,
  });

  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit), hasMore };
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
    select: activitySelect,
  });
}
