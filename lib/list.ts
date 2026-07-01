import "server-only";

import db from "@/lib/prisma";
import { renumberPositions } from "@/lib/ordering";

const LIST_POSITION_GAP = 16384;
const MAX_CREATE_LIST_RETRIES = 5;
const MIN_POSITION_GAP = 0.0001;
const MAX_REORDER_LIST_RETRIES = 3;

function isUniqueConstraintError(error: unknown): error is { code: string } {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const withCode = error as { code?: unknown };
  return withCode.code === "P2002";
}

export type ListRecord = {
  id: string;
  boardId: string;
  title: string;
  position: number;
  isDone: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CardLabelRecord = {
  id: string;
  name: string;
  color: string;
};

export type CardFaceMember = {
  id: string;
  name: string;
  image: string | null;
};

// How many member avatars the card face renders before collapsing the rest into
// a "+N" overflow chip. Keeps the board-load payload bounded (US-030 perf watch)
// while still signalling "who's on this card" at a glance.
export const MAX_CARD_FACE_AVATARS = 3;

export type ListCardRecord = {
  id: string;
  listId: string;
  title: string;
  position: number;
  coverImage: string | null;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  dueDate: Date | null;
  completedAt: Date | null;
  labels: CardLabelRecord[];
  /** Up to MAX_CARD_FACE_AVATARS assignees for the avatar stack. */
  members: CardFaceMember[];
  /** Total assignees (>= members.length); drives the "+N" overflow. */
  memberCount: number;
  checklistDone: number;
  checklistTotal: number;
  commentCount: number;
};

export type ListWithCardsRecord = ListRecord & {
  cards: ListCardRecord[];
};

export async function getListsByBoardId(
  boardId: string,
): Promise<ListWithCardsRecord[]> {
  const lists = await db.list.findMany({
    where: { boardId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      boardId: true,
      title: true,
      position: true,
      isDone: true,
      createdAt: true,
      updatedAt: true,
      cards: {
        where: {
          archivedAt: null,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          listId: true,
          title: true,
          position: true,
          coverImage: true,
          priority: true,
          dueDate: true,
          completedAt: true,
          labels: {
            select: {
              label: { select: { id: true, name: true, color: true } },
            },
          },
          members: {
            take: MAX_CARD_FACE_AVATARS,
            orderBy: { assignedAt: "asc" },
            select: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
          // Item booleans only, aggregated to done/total below — the card face
          // sends two numbers, never the raw items, to keep the payload small.
          checklists: {
            select: { items: { select: { isCompleted: true } } },
          },
          _count: { select: { members: true, comments: true } },
        },
      },
    },
  });

  return lists.map((list) => ({
    ...list,
    cards: list.cards.map((card) => {
      let checklistTotal = 0;
      let checklistDone = 0;
      for (const checklist of card.checklists) {
        for (const item of checklist.items) {
          checklistTotal += 1;
          if (item.isCompleted) {
            checklistDone += 1;
          }
        }
      }

      return {
        id: card.id,
        listId: card.listId,
        title: card.title,
        position: card.position,
        coverImage: card.coverImage,
        priority: card.priority,
        dueDate: card.dueDate,
        completedAt: card.completedAt,
        labels: card.labels.map((cardLabel) => cardLabel.label),
        members: card.members.map((member) => member.user),
        memberCount: card._count.members,
        checklistDone,
        checklistTotal,
        commentCount: card._count.comments,
      };
    }),
  }));
}

export async function createList(data: {
  boardId: string;
  title: string;
  isDone?: boolean;
}): Promise<ListRecord> {
  for (let attempt = 0; attempt < MAX_CREATE_LIST_RETRIES; attempt += 1) {
    const lastList = await db.list.findFirst({
      where: { boardId: data.boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const position = lastList ? lastList.position + LIST_POSITION_GAP : LIST_POSITION_GAP;

    try {
      return await db.list.create({
        data: {
          boardId: data.boardId,
          title: data.title,
          position,
          isDone: data.isDone ?? false,
        },
        select: {
          id: true,
          boardId: true,
          title: true,
          position: true,
          isDone: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < MAX_CREATE_LIST_RETRIES - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to create list after retrying position conflicts");
}

export async function updateListTitle(listId: string, title: string): Promise<ListRecord> {
  return db.list.update({
    where: { id: listId },
    data: { title },
    select: {
      id: true,
      boardId: true,
      title: true,
      position: true,
      isDone: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateListIsDone(listId: string, isDone: boolean): Promise<ListRecord> {
  return db.list.update({
    where: { id: listId },
    data: { isDone },
    select: {
      id: true,
      boardId: true,
      title: true,
      position: true,
      isDone: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function normalizeListPositions(boardId: string): Promise<void> {
  // Collision-safe under the live `list_boardId_position_key` unique index: an
  // in-place renumber can transiently assign a position another list still
  // holds and abort mid-transaction, so renumber via a disjoint staging band.
  await db.$transaction(async (tx) => {
    const lists = await tx.list.findMany({
      where: { boardId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, position: true },
    });

    await renumberPositions(lists, LIST_POSITION_GAP, (id, position) =>
      tx.list.update({ where: { id }, data: { position } }),
    );
  });
}

type PositionContext = {
  boardId: string;
  prevListId?: string | null;
  nextListId?: string | null;
};

async function resolveListPosition({
  boardId,
  prevListId,
  nextListId,
}: PositionContext): Promise<number> {
  const [prevList, nextList] = await Promise.all([
    prevListId
      ? db.list.findUnique({
          where: { id: prevListId },
          select: { id: true, boardId: true, position: true },
        })
      : null,
    nextListId
      ? db.list.findUnique({
          where: { id: nextListId },
          select: { id: true, boardId: true, position: true },
        })
      : null,
  ]);

  if (prevListId && (!prevList || prevList.boardId !== boardId)) {
    throw new Error("Invalid prevListId");
  }

  if (nextListId && (!nextList || nextList.boardId !== boardId)) {
    throw new Error("Invalid nextListId");
  }

  if (prevList && nextList) {
    const lower = Math.min(prevList.position, nextList.position);
    const upper = Math.max(prevList.position, nextList.position);
    return (lower + upper) / 2;
  }

  if (prevList) {
    return prevList.position + LIST_POSITION_GAP;
  }

  if (nextList) {
    return nextList.position - LIST_POSITION_GAP;
  }

  const lastList = await db.list.findFirst({
    where: { boardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return lastList ? lastList.position + LIST_POSITION_GAP : LIST_POSITION_GAP;
}

export async function reorderListByNeighbors(data: {
  listId: string;
  prevListId?: string | null;
  nextListId?: string | null;
}): Promise<ListRecord> {
  for (let attempt = 0; attempt < MAX_REORDER_LIST_RETRIES; attempt += 1) {
    const currentList = await db.list.findUnique({
      where: { id: data.listId },
      select: {
        id: true,
        boardId: true,
        position: true,
      },
    });

    if (!currentList) {
      throw new Error("List not found");
    }

    const nextPosition = await resolveListPosition({
      boardId: currentList.boardId,
      prevListId: data.prevListId,
      nextListId: data.nextListId,
    });

    const gapToCurrent = Math.abs(nextPosition - currentList.position);
    if (gapToCurrent < MIN_POSITION_GAP) {
      await normalizeListPositions(currentList.boardId);
      continue;
    }

    try {
      return await db.list.update({
        where: { id: data.listId },
        data: { position: nextPosition },
        select: {
          id: true,
          boardId: true,
          title: true,
          position: true,
          isDone: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < MAX_REORDER_LIST_RETRIES - 1) {
        await normalizeListPositions(currentList.boardId);
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to reorder list after retries");
}

export async function deleteList(listId: string): Promise<void> {
  await db.list.delete({
    where: { id: listId },
  });
}

export async function getListWithBoard(listId: string): Promise<{
  list: ListRecord;
  board: { id: string; workspaceId: string; archivedAt: Date | null };
} | null> {
  const list = await db.list.findUnique({
    where: { id: listId },
    select: {
      id: true,
      boardId: true,
      title: true,
      position: true,
      isDone: true,
      createdAt: true,
      updatedAt: true,
      board: {
        select: {
          id: true,
          workspaceId: true,
          archivedAt: true,
        },
      },
    },
  });

  if (!list) {
    return null;
  }

  const { board, ...listData } = list;
  return { list: listData, board };
}
