import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

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