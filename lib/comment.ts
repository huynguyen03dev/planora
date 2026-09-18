import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

import db from "@/lib/prisma";

export type CommentRecord = {
  id: string;
  cardId: string;
  userId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string;
    image: string | null;
  };
};

/** Default page size for `getCommentsByCardId` when called with options. */
export const COMMENT_PAGE_SIZE = 50;

/**
 * Cursor for paged comments (createdAt-asc order): the row boundary is the
 * *last loaded* comment; the next page returns only comments strictly newer
 * than it. `id` tie-breaks comments that share a `createdAt`, so equal
 * timestamps can never shift rows between pages or drop one at a boundary.
 */
export type CommentCursor = {
  createdAt: Date | string;
  id: string;
};

export type GetCommentsByCardIdOptions = {
  /** Max comments per page. Defaults to `COMMENT_PAGE_SIZE` (50). */
  limit?: number;
  /** Fetch only comments strictly newer than this cursor (first page = none). */
  after?: CommentCursor;
};

export type CommentPage = {
  items: CommentRecord[];
  /** True when another page exists after the returned `items`. */
  hasMore: boolean;
};

const commentSelect = {
  id: true,
  cardId: true,
  userId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      image: true,
    },
  },
} satisfies Prisma.CommentSelect;

/**
 * Loads the comments for a card (oldest first).
 *
 * Backward-compatible: calling without `options` returns ALL comments (the
 * legacy behavior). With `options`, returns a capped page plus `hasMore`
 * (fetches `limit + 1` rows, so `hasMore` is exact without a second count
 * query). Pagination is cursor-based on the last loaded comment; the id
 * tie-breaker keeps pages deterministic when timestamps collide.
 */
export async function getCommentsByCardId(
  cardId: string,
): Promise<CommentRecord[]>;
export async function getCommentsByCardId(
  cardId: string,
  options: GetCommentsByCardIdOptions,
): Promise<CommentPage>;
export async function getCommentsByCardId(
  cardId: string,
  options?: GetCommentsByCardIdOptions,
): Promise<CommentRecord[] | CommentPage> {
  if (options === undefined) {
    // Legacy contract: no options → everything, in legacy (createdAt-asc) order.
    return db.comment.findMany({
      where: { cardId },
      orderBy: { createdAt: "asc" },
      select: commentSelect,
    });
  }

  const limit = options.limit ?? COMMENT_PAGE_SIZE;
  const after = options.after;

  const rows = await db.comment.findMany({
    where: {
      cardId,
      // Compound cursor: strictly newer than (after.createdAt, after.id).
      // `AND` wraps the OR so the cardId scope and the cursor compose.
      ...(after
        ? {
            AND: [
              {
                OR: [
                  { createdAt: { gt: after.createdAt } },
                  { createdAt: after.createdAt, id: { gt: after.id } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: commentSelect,
  });

  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit), hasMore };
}

export async function createComment(data: {
  cardId: string;
  userId: string;
  content: string;
}): Promise<CommentRecord> {
  return db.comment.create({
    data: {
      cardId: data.cardId,
      userId: data.userId,
      content: data.content,
    },
    select: commentSelect,
  });
}
