import "server-only";

import db from "@/lib/prisma";

export type BoardRecord = {
  id: string;
  workspaceId: string;
  title: string;
  backgroundColor: string | null;
  createdById: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getBoardById(boardId: string): Promise<BoardRecord | null> {
  return db.board.findUnique({
    where: {
      id: boardId,
      archivedAt: null,
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      backgroundColor: true,
      createdById: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createBoard(data: {
  workspaceId: string;
  title: string;
  backgroundColor: string;
  createdById: string;
}): Promise<BoardRecord> {
  return db.board.create({
    data,
    select: {
      id: true,
      workspaceId: true,
      title: true,
      backgroundColor: true,
      createdById: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateBoard(
  boardId: string,
  data: { title?: string; backgroundColor?: string },
): Promise<BoardRecord> {
  return db.board.update({
    where: {
      id: boardId,
      archivedAt: null,
    },
    data,
    select: {
      id: true,
      workspaceId: true,
      title: true,
      backgroundColor: true,
      createdById: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function deleteBoard(boardId: string): Promise<void> {
  await db.board.update({
    where: {
      id: boardId,
      archivedAt: null,
    },
    data: {
      archivedAt: new Date(),
    },
  });
}
