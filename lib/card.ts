import "server-only";

import db from "@/lib/prisma";

const CARD_POSITION_GAP = 16384;

export type CardRecord = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  position: number;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  dueDate: Date | null;
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
  updatedAt: Date;
};

const CARD_DETAIL_SELECT = {
  id: true,
  listId: true,
  title: true,
  description: true,
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
      archivedAt: null,
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
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateCardTitle(
  cardId: string,
  title: string,
): Promise<CardRecord> {
  return db.card.update({
    where: {
      id: cardId,
      archivedAt: null,
    },
    data: {
      title,
    },
    select: {
      id: true,
      listId: true,
      title: true,
      description: true,
      position: true,
      priority: true,
      dueDate: true,
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

async function resolveCardPosition(data: {
  targetListId: string;
  prevCardId?: string | null;
  nextCardId?: string | null;
}): Promise<number> {
  const [prevCard, nextCard] = await Promise.all([
    data.prevCardId
      ? db.card.findUnique({
          where: { id: data.prevCardId, archivedAt: null },
          select: { id: true, listId: true, position: true },
        })
      : null,
    data.nextCardId
      ? db.card.findUnique({
          where: { id: data.nextCardId, archivedAt: null },
          select: { id: true, listId: true, position: true },
        })
      : null,
  ]);

  if (data.prevCardId && (!prevCard || prevCard.listId !== data.targetListId)) {
    throw new Error("Invalid prevCardId");
  }

  if (data.nextCardId && (!nextCard || nextCard.listId !== data.targetListId)) {
    throw new Error("Invalid nextCardId");
  }

  if (prevCard && nextCard) {
    const lower = Math.min(prevCard.position, nextCard.position);
    const upper = Math.max(prevCard.position, nextCard.position);
    return (lower + upper) / 2;
  }

  if (prevCard) {
    return prevCard.position + CARD_POSITION_GAP;
  }

  if (nextCard) {
    return nextCard.position - CARD_POSITION_GAP;
  }

  const lastCard = await db.card.findFirst({
    where: {
      listId: data.targetListId,
      archivedAt: null,
    },
    orderBy: [{ position: "desc" }, { createdAt: "desc" }],
    select: { position: true },
  });

  return lastCard ? lastCard.position + CARD_POSITION_GAP : CARD_POSITION_GAP;
}

export async function reorderCardWithinListByNeighbors(data: {
  cardId: string;
  prevCardId?: string | null;
  nextCardId?: string | null;
}): Promise<CardRecord> {
  const existingCard = await db.card.findUnique({
    where: {
      id: data.cardId,
      archivedAt: null,
    },
    select: {
      id: true,
      listId: true,
    },
  });

  if (!existingCard) {
    throw new Error("Card not found");
  }

  const nextPosition = await resolveCardPosition({
    targetListId: existingCard.listId,
    prevCardId: data.prevCardId,
    nextCardId: data.nextCardId,
  });

  return db.card.update({
    where: {
      id: data.cardId,
      archivedAt: null,
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
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function moveCardToListByNeighbors(data: {
  cardId: string;
  targetListId: string;
  prevCardId?: string | null;
  nextCardId?: string | null;
}): Promise<CardRecord> {
  const nextPosition = await resolveCardPosition({
    targetListId: data.targetListId,
    prevCardId: data.prevCardId,
    nextCardId: data.nextCardId,
  });

  return db.card.update({
    where: {
      id: data.cardId,
      archivedAt: null,
    },
    data: {
      listId: data.targetListId,
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
      coverImage: true,
      archivedAt: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
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
