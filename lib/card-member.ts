import "server-only";

import db from "@/lib/prisma";

export type CardMemberRecord = {
  id: string;
  name: string;
  image: string | null;
  email: string;
};

export type AssignableWorkspaceMemberRecord = {
  id: string;
  name: string;
  image: string | null;
  email: string;
  role: string;
};

export async function getCardMembers(cardId: string): Promise<CardMemberRecord[]> {
  return db.cardMember.findMany({
    where: {
      cardId,
    },
    orderBy: {
      assignedAt: "asc", // oldest assignment first
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
        },
      },
    },
  }).then((results) =>
    results.map((result) => ({
      id: result.user.id,
      name: result.user.name,
      image: result.user.image,
      email: result.user.email,
    }))
  );
}

export async function getAssignableWorkspaceMembers(
  workspaceId: string
): Promise<AssignableWorkspaceMemberRecord[]> {
  return db.workspaceMember.findMany({
    where: {
      organizationId: workspaceId,
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
        },
      },
      role: true,
    },
  }).then((results) =>
    results.map((result) => ({
      id: result.user.id,
      name: result.user.name,
      image: result.user.image,
      email: result.user.email,
      role: result.role,
    }))
  );
}

export async function assignMemberToCard(data: {
  cardId: string;
  userId: string;
}): Promise<CardMemberRecord> {
  // Check if already assigned to avoid duplicates
  const existing = await db.cardMember.findUnique({
    where: {
      cardId_userId: {
        cardId: data.cardId,
        userId: data.userId,
      },
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
        },
      },
    },
  });

  if (existing) {
    return {
      id: existing.user.id,
      name: existing.user.name,
      image: existing.user.image,
      email: existing.user.email,
    };
  }

  // Create new assignment
  const result = await db.cardMember.create({
    data: {
      cardId: data.cardId,
      userId: data.userId,
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
        },
      },
    },
  });

  return {
    id: result.user.id,
    name: result.user.name,
    image: result.user.image,
    email: result.user.email,
  };
}

export async function removeMemberFromCard(data: {
  cardId: string;
  userId: string;
}): Promise<void> {
  // Safe delete - no-op if relation doesn't exist
  await db.cardMember.deleteMany({
    where: {
      cardId: data.cardId,
      userId: data.userId,
    },
  });
}