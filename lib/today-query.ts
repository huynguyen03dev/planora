import "server-only";

import type { TodayCard } from "@/lib/today";
import db from "@/lib/prisma";

export type TodayReadModel = {
  workspaceCount: number;
  cards: TodayCard[];
};

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
 */
export async function getPersonalWorkCards(
  userId: string,
): Promise<TodayReadModel> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    select: { organizationId: true },
  });

  if (memberships.length === 0) {
    return { workspaceCount: 0, cards: [] };
  }

  const workspaceIds = memberships.map((membership) => membership.organizationId);

  const cards = await db.card.findMany({
    where: {
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
    },
    select: {
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
    },
    orderBy: [{ dueDate: "asc" }, { title: "asc" }],
  });

  return {
    workspaceCount: workspaceIds.length,
    cards: cards.map((card) => ({
      id: card.id,
      title: card.title,
      dueDate: card.dueDate ? card.dueDate.toISOString() : null,
      completedAt: card.completedAt ? card.completedAt.toISOString() : null,
      priority: card.priority,
      board: card.list.board,
      list: { id: card.list.id, title: card.list.title },
    })),
  };
}
