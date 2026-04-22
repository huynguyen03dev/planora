import "server-only";

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

export async function getCommentsByCardId(
  cardId: string,
): Promise<CommentRecord[]> {
  return db.comment.findMany({
    where: {
      cardId,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
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
    },
  });
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
    select: {
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
    },
  });
}