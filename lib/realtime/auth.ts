import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

import type { Watcher } from "./types";

export async function authenticateSocket(handshake: { headers: Record<string, string> }): Promise<string | null> {
  const cookieHeader = Object.entries(handshake.headers)
    .filter(([key]) => key.toLowerCase() === "cookie")
    .map(([, value]) => value)
    .join("; ");

  if (!cookieHeader) {
    return null;
  }

  const headers = new Headers();
  headers.set("cookie", cookieHeader);

  try {
    const session = await auth.api.getSession({ headers });

    if (!session) {
      return null;
    }

    return session.user.id;
  } catch {
    return null;
  }
}

export async function canUserJoinBoard(userId: string, boardId: string): Promise<boolean> {
  try {
    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { workspaceId: true, archivedAt: true },
    });

    if (!board || board.archivedAt) {
      return false;
    }

    const member = await db.workspaceMember.findFirst({
      where: {
        userId,
        workspace: { id: board.workspaceId },
      },
    });

    return !!member;
  } catch {
    return false;
  }
}

// Profile for the presence avatar list. The socket only carries a userId, so we
// resolve the display fields once on join. Callers should memoize per-socket
// (profile is constant for a connection) to avoid re-querying on multi-board joins.
export async function getUserProfile(userId: string): Promise<Watcher | null> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, image: true },
    });

    return user;
  } catch {
    return null;
  }
}

export async function canUserJoinWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  try {
    const member = await db.workspaceMember.findFirst({
      where: {
        userId,
        organizationId: workspaceId,
      },
    });

    return !!member;
  } catch {
    return false;
  }
}