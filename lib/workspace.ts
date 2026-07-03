import "server-only";

import { headers } from "next/headers";

import { Prisma } from "@/app/generated/prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
};

export type WorkspaceBoardMember = {
  id: string;
  name: string;
  image: string | null;
};

export type WorkspaceBoard = {
  id: string;
  title: string;
  backgroundColor: string | null;
  workspaceId: string;
  listCount: number;
  cardCount: number;
  /**
   * The most recent of the board's own `updatedAt` and the `updatedAt` of any
   * of its lists/cards — i.e. the last time anything on the board changed, not
   * just the board record. Computed bounded by list count (no per-card fetch).
   */
  lastActivityAt: Date;
  /** Distinct card assignees, capped for the avatar stack (see `memberCount`). */
  members: WorkspaceBoardMember[];
  /** Total distinct card assignees on the board (drives the `+N` overflow). */
  memberCount: number;
};

/** How many assignee avatars to surface on a board tile before the `+N`. */
const BOARD_TILE_MEMBER_CAP = 3;

function toSlugSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalized.length > 0) {
    return normalized.slice(0, 40);
  }

  return "workspace";
}

/**
 * Resolve a workspace slug to its id. Returns null when no workspace matches.
 * Promoted out of the dashboard page (US-063) so the `[slug]` shell, members,
 * and settings routes share one query.
 */
export async function getWorkspaceIdBySlug(
  slug: string,
): Promise<{ id: string } | null> {
  return db.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });
}

export async function listWorkspaceMembershipsByUserId(
  userId: string,
): Promise<WorkspaceMembership[]> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
        },
      },
    },
  });

  memberships.sort(
    (a, b) =>
      a.workspace.createdAt.getTime() - b.workspace.createdAt.getTime(),
  );

  return memberships.map((membership) => ({
    workspaceId: membership.organizationId,
    role: membership.role,
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
    },
  }));
}

export async function createWorkspaceForCurrentUser(
  rawName: string,
): Promise<{ id: string; name: string; slug: string }> {
  const name = rawName.trim();
  if (name.length === 0) {
    throw new Error("Workspace name is required.");
  }

  const slugBase = toSlugSegment(name);
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;

  const workspace = await auth.api.createOrganization({
    body: {
      name,
      slug,
    },
    headers: await headers(),
  });

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
  };
}

export async function setActiveWorkspaceForCurrentUser(
  organizationId: string,
): Promise<void> {
  await auth.api.setActiveOrganization({
    body: { organizationId },
    headers: await headers(),
  });
}

export async function listBoardsByWorkspaceIds(
  workspaceIds: string[],
): Promise<WorkspaceBoard[]> {
  if (workspaceIds.length === 0) {
    return [];
  }

  // One bounded query: per-board list/card counts and freshness. The nested
  // selects return a row per *list* (not per card) — `_count.cards` is a count
  // subquery and the `cards` include is a single most-recent row — so the cost
  // scales with list count, never card count.
  const boards = await db.board.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      archivedAt: null,
    },
    select: {
      id: true,
      title: true,
      backgroundColor: true,
      workspaceId: true,
      updatedAt: true,
      lists: {
        select: {
          updatedAt: true,
          _count: { select: { cards: { where: { archivedAt: null } } } },
          cards: {
            where: { archivedAt: null },
            select: { updatedAt: true },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const boardIds = boards.map((board) => board.id);
  const membersByBoard = await getDistinctBoardMembers(boardIds);

  return boards.map((board) => {
    let lastActivityAt = board.updatedAt;
    let cardCount = 0;
    for (const list of board.lists) {
      if (list.updatedAt > lastActivityAt) {
        lastActivityAt = list.updatedAt;
      }
      const latestCard = list.cards[0];
      if (latestCard && latestCard.updatedAt > lastActivityAt) {
        lastActivityAt = latestCard.updatedAt;
      }
      cardCount += list._count.cards;
    }

    const members = membersByBoard.get(board.id) ?? [];
    return {
      id: board.id,
      title: board.title,
      backgroundColor: board.backgroundColor,
      workspaceId: board.workspaceId,
      listCount: board.lists.length,
      cardCount,
      lastActivityAt,
      members: members.slice(0, BOARD_TILE_MEMBER_CAP),
      memberCount: members.length,
    };
  });
}

/**
 * Distinct card assignees per board, bounded by the number of distinct
 * (board, user) pairs rather than by card count. Cards carry no `boardId`, so
 * we join `cardMember -> card -> list` once (all FK-indexed) instead of
 * fetching every card's member list. Scoped to the already-authorized
 * `boardIds`, so it carries no isolation risk of its own.
 */
async function getDistinctBoardMembers(
  boardIds: string[],
): Promise<Map<string, WorkspaceBoardMember[]>> {
  const byBoard = new Map<string, WorkspaceBoardMember[]>();
  if (boardIds.length === 0) {
    return byBoard;
  }

  const pairs = await db.$queryRaw<{ boardId: string; userId: string }[]>`
    SELECT DISTINCT l."boardId" AS "boardId", cm."userId" AS "userId"
    FROM "cardMember" cm
    JOIN "card" c ON c."id" = cm."cardId"
    JOIN "list" l ON l."id" = c."listId"
    WHERE l."boardId" IN (${Prisma.join(boardIds)})
      AND c."archivedAt" IS NULL
    ORDER BY l."boardId", cm."userId"
  `;

  if (pairs.length === 0) {
    return byBoard;
  }

  const userIds = Array.from(new Set(pairs.map((pair) => pair.userId)));
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, image: true },
  });
  const usersById = new Map(users.map((user) => [user.id, user]));

  for (const pair of pairs) {
    const user = usersById.get(pair.userId);
    if (!user) {
      continue;
    }
    const list = byBoard.get(pair.boardId) ?? [];
    list.push({ id: user.id, name: user.name, image: user.image });
    byBoard.set(pair.boardId, list);
  }

  return byBoard;
}
