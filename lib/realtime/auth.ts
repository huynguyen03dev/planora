import { auth } from "@/lib/auth";
import type { WorkspaceRole } from "@/lib/authorization";
import db from "@/lib/prisma";

import type { UserProfile } from "./types";

function normalizeRole(role: string): WorkspaceRole {
  return role === "admin" || role === "editor" ? role : "viewer";
}

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

// Returns the user's role in the board's workspace, or null when they cannot
// join (board missing/archived, or not a member). The role doubles as the
// authorization check (null = denied) and the presence badge source (US-047),
// so the join path resolves membership in a single query.
export async function getBoardMembershipRole(
  userId: string,
  boardId: string,
): Promise<WorkspaceRole | null> {
  try {
    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { workspaceId: true, archivedAt: true },
    });

    if (!board || board.archivedAt) {
      return null;
    }

    const member = await db.workspaceMember.findFirst({
      where: {
        userId,
        workspace: { id: board.workspaceId },
      },
      select: { role: true },
    });

    return member ? normalizeRole(member.role) : null;
  } catch {
    return null;
  }
}

// Profile for the presence avatar list. The socket only carries a userId, so we
// resolve the display fields once on join. Callers should memoize per-socket
// (profile is constant for a connection) to avoid re-querying on multi-board
// joins. Role is board-dependent and resolved separately via
// getBoardMembershipRole.
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
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