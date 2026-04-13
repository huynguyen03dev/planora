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
