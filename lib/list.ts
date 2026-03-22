import "server-only";

import db from "@/lib/prisma";

const LIST_POSITION_GAP = 16384;

export type ListRecord = {
  id: string;
  boardId: string;
  title: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function getListsByBoardId(boardId: string): Promise<ListRecord[]> {
  return db.list.findMany({
    where: { boardId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      boardId: true,
      title: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createList(data: {
  boardId: string;
  title: string;
}): Promise<ListRecord> {
  const lastList = await db.list.findFirst({
    where: { boardId: data.boardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const position = lastList ? lastList.position + LIST_POSITION_GAP : LIST_POSITION_GAP;

  return db.list.create({
    data: {
      boardId: data.boardId,
      title: data.title,
      position,
    },
    select: {
      id: true,
      boardId: true,
      title: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
  });
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
      createdAt: true,
      updatedAt: true,
    },
  });
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
