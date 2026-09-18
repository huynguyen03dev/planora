import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

import { TODAY_PAGE_SIZE, type TodayCard } from "@/lib/today";
import db from "@/lib/prisma";

export type TodayReadModel = {
  workspaceCount: number;
  cards: TodayCard[];
};

/**
 * Pagination options for the `/today` personal read model (US-083 follow-up:
 * explicit pagination — no silent cap). `limit` is the page size; `cursor` is
 * the (dueDate, id) of the last loaded card in the server's
 * (dueDate asc nulls-last, id asc) order — a null dueDate is a real cursor
 * position (the no-due "Later" group sorts last). Fetching limit+1 rows makes
 * `hasMore` exact without a second count query.
 */
export type TodayPaginationOptions = {
  limit?: number;
  cursor?: { dueDate: Date | null; id: string };
};

export type TodayPageResult = {
  workspaceCount: number;
  items: TodayCard[];
  hasMore: boolean;
};

// One bounded payload for both paths — the same select the /today tiles need.
const CARD_SELECT = {
  id: true,
  title: true,
  dueDate: true,
  completedAt: true,
  priority: true,
  list: {
    select: {
      id: true,
      title: true,
      board: {
        select: {
          id: true,
          title: true,
          workspaceId: true,
          workspace: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.CardSelect;

type TodayCardRow = Prisma.CardGetPayload<{ select: typeof CARD_SELECT }>;

/** Maps a query row to the serializable client shape (ISO date strings). */
function toTodayCard(card: TodayCardRow): TodayCard {
  return {
    id: card.id,
    title: card.title,
    dueDate: card.dueDate ? card.dueDate.toISOString() : null,
    completedAt: card.completedAt ? card.completedAt.toISOString() : null,
    priority: card.priority,
    board: card.list.board,
    list: { id: card.list.id, title: card.list.title },
  };
}

async function getMembershipWorkspaceIds(userId: string): Promise<string[]> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    select: { organizationId: true },
  });
  return memberships.map((membership) => membership.organizationId);
}

/** The locked live-card contract: assigned to the caller, nothing archived or
 * completed at any level, board workspace inside the caller's memberships. */
function baseCardWhere(
  userId: string,
  workspaceIds: string[],
): Prisma.CardWhereInput {
  return {
    archivedAt: null,
    deletedAt: null,
    completedAt: null,
    members: { some: { userId } },
    list: {
      archivedAt: null,
      board: {
        archivedAt: null,
        workspaceId: { in: workspaceIds },
      },
    },
  };
}

/**
 * Keyset predicate for "rows strictly after the cursor" in the
 * (dueDate asc, id asc) order with nulls last:
 *   dated rows before the cursor date, the cursor's own date with a later id,
 *   dated rows after the cursor date, and the whole no-due (null) tail —
 *   or, for a null cursor (inside the no-due tail), the same-date id window.
 * Both halves of the cursor are used, so equal due dates can never skip or
 * duplicate rows across pages.
 */
function cursorAfterWhere(cursor: {
  dueDate: Date | null;
  id: string;
}): Prisma.CardWhereInput[] {
  if (cursor.dueDate === null) {
    return [{ dueDate: null, id: { gt: cursor.id } }];
  }
  return [
    { dueDate: { not: null, lt: cursor.dueDate } },
    { dueDate: cursor.dueDate, id: { gt: cursor.id } },
    { dueDate: { not: null, gt: cursor.dueDate } },
    { dueDate: null },
  ];
}

/**
 * US-083 W6 — the `/today` personal read model.
 *
 * Cross-workspace by design: workspace scope is derived server-side from the
 * session user's memberships (never accepted from the client — a caller
 * supplied workspace id could widen the read past their memberships). One
 * membership query + one bounded card query, no N+1.
 *
 * Live-card contract (locked): the card's own archivedAt/deletedAt/
 * completedAt are null, its containing list's archivedAt is null, its board's
 * archivedAt is null, and the board's workspace is in the caller's
 * memberships. Only cards assigned to the caller (`members: { some }`) are
 * returned. Returns a plain serializable model (ISO date strings) ready for
 * the client boundary.
 *
 * Pagination (US-083 follow-up): explicit, never a silent cap. Calling with
 * `options` fetches the first `limit` cards (limit+1 probe → exact `hasMore`)
 * and returns `{ workspaceCount, items, hasMore }`; the client keeps
 * "Load more" visible until `hasMore` is false, so the whole personal read
 * model stays reachable. Calling WITHOUT options keeps the legacy behavior:
 * the full unbounded model `{ workspaceCount, cards }`.
 */
export async function getPersonalWorkCards(
  userId: string,
): Promise<TodayReadModel>;
export async function getPersonalWorkCards(
  userId: string,
  options: TodayPaginationOptions,
): Promise<TodayPageResult>;
export async function getPersonalWorkCards(
  userId: string,
  options?: TodayPaginationOptions,
): Promise<TodayReadModel | TodayPageResult> {
  const workspaceIds = await getMembershipWorkspaceIds(userId);

  if (workspaceIds.length === 0) {
    return options
      ? { workspaceCount: 0, items: [], hasMore: false }
      : { workspaceCount: 0, cards: [] };
  }

  const paginated = options !== undefined;
  const limit = options?.limit ?? TODAY_PAGE_SIZE;
  const cursor = options?.cursor;

  const rows = await db.card.findMany({
    where: cursor
      ? { ...baseCardWhere(userId, workspaceIds), OR: cursorAfterWhere(cursor) }
      : baseCardWhere(userId, workspaceIds),
    select: CARD_SELECT,
    // The legacy path keeps its exact orderBy (dueDate, title). The paginated
    // path uses (dueDate, id): the id tiebreak makes the order total so the
    // (dueDate, id) cursor is exact (no skip/no duplicate across pages). The
    // displayed order is unaffected — groupTodayCards re-sorts each section by
    // (dueDate, title) client-side.
    orderBy: paginated
      ? [{ dueDate: "asc" }, { id: "asc" }]
      : [{ dueDate: "asc" }, { title: "asc" }],
    ...(paginated ? { take: limit + 1 } : {}),
  });

  if (!paginated) {
    return {
      workspaceCount: workspaceIds.length,
      cards: rows.map(toTodayCard),
    };
  }

  // The limit+1 probe makes hasMore exact: a full extra row means another
  // page exists — no second count query, and no silent cap (the client keeps
  // "Load more" until this is false).
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    workspaceCount: workspaceIds.length,
    items: pageRows.map(toTodayCard),
    hasMore,
  };
}
