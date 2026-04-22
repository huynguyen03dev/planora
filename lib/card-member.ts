import "server-only";

import db from "@/lib/prisma";

function isUniqueConstraintError(error: unknown): error is { code: string } {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const withCode = error as { code?: unknown };
  return withCode.code === "P2002";
}

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

export type AssignMemberToCardResult = {
  member: CardMemberRecord;
  changed: boolean;
};

export type RemoveMemberFromCardResult = {
  changed: boolean;
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
}): Promise<AssignMemberToCardResult> {
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
      member: {
        id: existing.user.id,
        name: existing.user.name,
        image: existing.user.image,
        email: existing.user.email,
      },
      changed: false,
    };
  }

  try {
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
      member: {
        id: result.user.id,
        name: result.user.name,
        image: result.user.image,
        email: result.user.email,
      },
      changed: true,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const concurrentExisting = await db.cardMember.findUnique({
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

    if (!concurrentExisting) {
      throw error;
    }

    return {
      member: {
        id: concurrentExisting.user.id,
        name: concurrentExisting.user.name,
        image: concurrentExisting.user.image,
        email: concurrentExisting.user.email,
      },
      changed: false,
    };
  }
}

export async function removeMemberFromCard(data: {
  cardId: string;
  userId: string;
}): Promise<RemoveMemberFromCardResult> {
  // Safe delete - no-op if relation doesn't exist.
  const result = await db.cardMember.deleteMany({
    where: {
      cardId: data.cardId,
      userId: data.userId,
    },
  });

  return { changed: result.count > 0 };
}