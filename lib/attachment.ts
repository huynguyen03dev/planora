import "server-only";

import db from "@/lib/prisma";

export type AttachmentRecord = {
  id: string;
  cardId: string;
  userId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    image: string | null;
  };
};

export async function getAttachmentsByCardId(
  cardId: string,
): Promise<AttachmentRecord[]> {
  return db.attachment.findMany({
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
      fileName: true,
      fileUrl: true,
      fileType: true,
      fileSize: true,
      createdAt: true,
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

export async function createAttachment(data: {
  cardId: string;
  userId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  cloudinaryPublicId?: string;
  cloudinaryResourceType?: string;
}): Promise<AttachmentRecord> {
  return db.attachment.create({
    data: {
      cardId: data.cardId,
      userId: data.userId,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileType: data.fileType,
      fileSize: data.fileSize,
      cloudinaryPublicId: data.cloudinaryPublicId,
      cloudinaryResourceType: data.cloudinaryResourceType,
    },
    select: {
      id: true,
      cardId: true,
      userId: true,
      fileName: true,
      fileUrl: true,
      fileType: true,
      fileSize: true,
      createdAt: true,
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

export async function getAttachmentById(
  id: string,
): Promise<AttachmentRecord | null> {
  return db.attachment.findUnique({
    where: { id },
    select: {
      id: true,
      cardId: true,
      userId: true,
      fileName: true,
      fileUrl: true,
      fileType: true,
      fileSize: true,
      createdAt: true,
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
