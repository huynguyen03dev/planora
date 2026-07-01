import "server-only";

import db from "@/lib/prisma";
import {
  CARD_POSITION_GAP,
  LIVE_CARD_SCOPE,
  PositionSpaceExhaustedError,
  normalizeCardPositions,
  resolveCardPosition,
} from "@/lib/ordering";

const MAX_REORDER_CARD_RETRIES = 3;

function isUniqueConstraintError(error: unknown): error is { code: string } {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const withCode = error as { code?: unknown };
  return withCode.code === "P2002";
}

export type CardRecord = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  position: number;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  dueDate: Date | null;
  estimateHours: number | null;
  completedAt: Date | null;
  deletedAt: Date | null;
  coverImage: string | null;
  archivedAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CardDetailRecord = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  estimateHours: number | null;
  dueDate: Date | null;
  completedAt: Date | null;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  coverImage: string | null;
  updatedAt: Date;
};

const CARD_DETAIL_SELECT = {
  id: true,
  listId: true,
  title: true,
  description: true,
  estimateHours: true,
  dueDate: true,
  completedAt: true,
  priority: true,
  coverImage: true,
  updatedAt: true,
} as const;

export type CardWithListBoardRecord = {
  card: CardRecord;
  list: {
    id: string;
    boardId: string;
  };
  board: {
    id: string;
    workspaceId: string;
    archivedAt: Date | null;
  };
};

export async function createCard(data: {
  listId: string;
  title: string;
  createdById: string;
}): Promise<CardRecord> {
  const lastCard = await db.card.findFirst({
    where: {
      listId: data.listId,
      ...LIVE_CARD_SCOPE,
    },
    orderBy: [{ position: "desc" }, { createdAt: "desc" }],
    select: { position: true },
  });

  const position = lastCard ? lastCard.position + CARD_POSITION_GAP : CARD_POSITION_GAP;

  return db.card.create({
    data: {
      listId: data.listId,
      title: data.title,
      createdById: data.createdById,
      position,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function archiveCard(cardId: string): Promise<void> {
  await db.card.update({
    where: {
      id: cardId,
      archivedAt: null,
    },
    data: {
      archivedAt: new Date(),
    },
  });
}

export async function reorderCardWithinListByNeighbors(data: {
  cardId: string;
  prevCardId?: string | null;
  nextCardId?: string | null;
}): Promise<CardRecord> {
  for (let attempt = 0; attempt < MAX_REORDER_CARD_RETRIES; attempt += 1) {
    // Retained across the catch so a collision can renumber the right list
    // before the next attempt; set once the card is read inside the tx.
    let listIdForRetry: string | null = null;

    try {
      return await db.$transaction(async (tx) => {
        const existingCard = await tx.card.findUnique({
          where: {
            id: data.cardId,
            ...LIVE_CARD_SCOPE,
          },
          select: {
            id: true,
            listId: true,
            position: true,
          },
        });

        if (!existingCard) {
          throw new Error("Card not found");
        }

        listIdForRetry = existingCard.listId;

        // Exclude the card being moved so the adjacency search bisects against
        // the real occupants, not the mover's own (stale) slot.
        const nextPosition = await resolveCardPosition(tx, {
          targetListId: existingCard.listId,
          prevCardId: data.prevCardId,
          nextCardId: data.nextCardId,
          excludeCardId: data.cardId,
        });

        return await tx.card.update({
          where: {
            id: data.cardId,
            ...LIVE_CARD_SCOPE,
          },
          data: {
            position: nextPosition,
          },
          select: {
            id: true,
            listId: true,
            title: true,
            description: true,
            position: true,
            priority: true,
            dueDate: true,
            estimateHours: true,
            completedAt: true,
            deletedAt: true,
            coverImage: true,
            archivedAt: true,
            createdById: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      });
    } catch (error) {
      // A P2002 (a rival grabbed the slot) or a PositionSpaceExhaustedError (no
      // gap left to bisect) both mean: renumber the list to restore full gaps,
      // then retry the reorder against the fresh layout.
      if (
        (isUniqueConstraintError(error) || error instanceof PositionSpaceExhaustedError) &&
        attempt < MAX_REORDER_CARD_RETRIES - 1 &&
        listIdForRetry
      ) {
        const listId = listIdForRetry;
        await db.$transaction((tx) => normalizeCardPositions(tx, listId));
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to reorder card after retries");
}

export async function getCardWithListAndBoard(
  cardId: string,
): Promise<CardWithListBoardRecord | null> {
  const card = await db.card.findUnique({
    where: {
      id: cardId,
      archivedAt: null,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      list: {
        select: {
          id: true,
          boardId: true,
          board: {
            select: {
              id: true,
              workspaceId: true,
              archivedAt: true,
            },
          },
        },
      },
    },
  });

  if (!card) {
    return null;
  }

  const { list, ...cardData } = card;
  return {
    card: cardData,
    list: {
      id: list.id,
      boardId: list.boardId,
    },
    board: list.board,
  };
}

export async function getCardDetailForBoard(
  boardId: string,
  cardId: string,
): Promise<CardDetailRecord | null> {
  const card = await db.card.findUnique({
    where: {
      id: cardId,
      archivedAt: null,
    },
    select: {
      ...CARD_DETAIL_SELECT,
      list: {
        select: {
          boardId: true,
        },
      },
    },
  });

  if (!card || card.list.boardId !== boardId) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { list: _list, ...cardData } = card;
  return cardData;
}

export async function updateCardDetails(
  cardId: string,
  data: { title: string; description: string | null },
): Promise<CardDetailRecord> {
  return db.card.update({
    where: {
      id: cardId,
      archivedAt: null,
    },
    data: {
      title: data.title,
      description: data.description,
    },
    select: CARD_DETAIL_SELECT,
  });
}

// ─── Analytics-related card operations ─────────────────────────────

export async function updateCardEstimate(
  cardId: string,
  estimateHours: number | null,
): Promise<CardRecord> {
  return db.card.update({
    where: {
      id: cardId,
      archivedAt: null,
    },
    data: {
      estimateHours,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateCardDueDate(
  cardId: string,
  dueDate: Date | null,
): Promise<CardRecord> {
  return db.card.update({
    where: {
      id: cardId,
      archivedAt: null,
    },
    data: {
      dueDate,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Mark a card as completed (first completion only).
 * Sets completedAt if not already set.
 */
export async function completeCard(cardId: string): Promise<CardRecord> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { completedAt: true },
  });

  // Only set completedAt if not already set (first completion only)
  const completedAt = card?.completedAt ?? new Date();

  return db.card.update({
    where: {
      id: cardId,
      archivedAt: null,
    },
    data: {
      completedAt,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Get card with list and members for history snapshot.
 * Used to capture metadata for analytics events.
 */
export async function getCardWithListAndMembers(cardId: string): Promise<{
  card: CardRecord;
  list: { id: string; boardId: string; isDone: boolean };
  board: { id: string; workspaceId: string };
  memberIds: string[];
} | null> {
  const card = await db.card.findUnique({
    where: {
      id: cardId,
      archivedAt: null,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      list: {
        select: {
          id: true,
          boardId: true,
          isDone: true,
          board: {
            select: {
              id: true,
              workspaceId: true,
            },
          },
        },
      },
      members: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!card) {
    return null;
  }

  const { list, members, ...cardData } = card;
  return {
    card: cardData,
    list: {
      id: list.id,
      boardId: list.boardId,
      isDone: list.isDone,
    },
    board: list.board,
    memberIds: members.map((m) => m.userId),
  };
}

/**
 * Soft delete a card (sets deletedAt).
 * Used for analytics tracking before hard delete.
 */
export async function softDeleteCard(cardId: string): Promise<CardRecord> {
  return db.card.update({
    where: {
      id: cardId,
    },
    data: {
      deletedAt: new Date(),
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * A board's archived card, summarized for the Archived-cards view.
 */
export type ArchivedCardRecord = {
  id: string;
  title: string;
  listId: string;
  listTitle: string;
  archivedAt: Date;
};

/**
 * List a board's archived cards (newest first) for the Archived-cards view.
 * Scoped through the owning list/board; the board itself must not be archived.
 */
export async function getArchivedCards(
  boardId: string,
): Promise<ArchivedCardRecord[]> {
  const cards = await db.card.findMany({
    where: {
      archivedAt: { not: null },
      list: {
        boardId,
        board: { archivedAt: null },
      },
    },
    orderBy: { archivedAt: "desc" },
    select: {
      id: true,
      title: true,
      listId: true,
      archivedAt: true,
      list: {
        select: { title: true },
      },
    },
  });

  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    listId: card.listId,
    listTitle: card.list.title,
    // archivedAt is non-null by the `where` filter above.
    archivedAt: card.archivedAt as Date,
  }));
}

/**
 * Resolve an *archived* card with its list + board scope envelope. Mirrors
 * `getCardWithListAndBoard` but requires `archivedAt: { not: null }` — the
 * archivedAt:null filter there means it could never find a card to restore.
 * Returns null for a non-archived, missing, or foreign card id.
 */
export async function getArchivedCardWithListAndBoard(
  cardId: string,
): Promise<CardWithListBoardRecord | null> {
  const card = await db.card.findFirst({
    where: {
      id: cardId,
      archivedAt: { not: null },
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      priority: true,
      dueDate: true,
      estimateHours: true,
      completedAt: true,
      deletedAt: true,
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      list: {
        select: {
          id: true,
          boardId: true,
          board: {
            select: {
              id: true,
              workspaceId: true,
              archivedAt: true,
            },
          },
        },
      },
    },
  });

  if (!card) {
    return null;
  }

  const { list, ...cardData } = card;
  return {
    card: cardData,
    list: {
      id: list.id,
      boardId: list.boardId,
    },
    board: list.board,
  };
}


export async function updateCardCover(
  cardId: string,
  coverImage: string | null,
): Promise<CardDetailRecord> {
  return db.card.update({
    where: { id: cardId, archivedAt: null },
    data: { coverImage },
    select: CARD_DETAIL_SELECT,
  });
}

export async function updateCardPriority(
  cardId: string,
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null,
): Promise<CardDetailRecord> {
  return db.card.update({
    where: { id: cardId, archivedAt: null },
    data: { priority },
    select: CARD_DETAIL_SELECT,
  });
}
