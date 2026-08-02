import "server-only";

import type { QuickCaptureOptions } from "@/lib/quick-capture";
import db from "@/lib/prisma";

/**
 * US-083 W7 — the quick capture options read model.
 *
 * Scope is derived SERVER-SIDE from the session user's `WorkspaceMember`
 * rows — never client-supplied. Only editor/admin (creatable) memberships
 * are returned, with active boards and active lists only, in a deterministic
 * membership/board order, via exactly four bounded queries (no N+1):
 * 1. memberships (creatable roles, by createdAt → the deterministic
 *    membership order the default resolution relies on),
 * 2. workspaces (id + name),
 * 3. active boards (id, title, workspaceId, by createdAt),
 * 4. active lists of active boards (id, title, boardId, by position).
 *
 * `createCardAction` remains the authoritative permission/isolation boundary
 * for the actual create; this action only feeds the selector.
 */
export async function getQuickCaptureOptions(userId: string): Promise<QuickCaptureOptions> {
  const memberships = await db.workspaceMember.findMany({
    where: {
      userId,
      role: { in: ["admin", "editor"] },
    },
    select: { organizationId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (memberships.length === 0) {
    return { workspaces: [] };
  }

  const workspaceIds = memberships.map((membership) => membership.organizationId);

  const [workspaces, boards, lists] = await Promise.all([
    db.workspace.findMany({
      where: { id: { in: workspaceIds } },
      select: { id: true, name: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.board.findMany({
      where: { workspaceId: { in: workspaceIds }, archivedAt: null },
      select: { id: true, title: true, workspaceId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.list.findMany({
      where: {
        board: { workspaceId: { in: workspaceIds }, archivedAt: null },
        archivedAt: null,
      },
      select: { id: true, title: true, boardId: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
  ]);

  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const boardsByWorkspace = new Map<string, typeof boards>();
  for (const board of boards) {
    const bucket = boardsByWorkspace.get(board.workspaceId);
    if (bucket) {
      bucket.push(board);
    } else {
      boardsByWorkspace.set(board.workspaceId, [board]);
    }
  }
  const listsByBoard = new Map<string, typeof lists>();
  for (const list of lists) {
    const bucket = listsByBoard.get(list.boardId);
    if (bucket) {
      bucket.push(list);
    } else {
      listsByBoard.set(list.boardId, [list]);
    }
  }

  // Workspaces follow MEMBERSHIP order (the membership query's orderBy), not
  // the workspace query's own order — deterministic and stable across runs.
  const grouped: QuickCaptureOptions["workspaces"] = [];
  for (const membership of memberships) {
    const workspace = workspaceById.get(membership.organizationId);
    if (!workspace) {
      continue;
    }
    grouped.push({
      id: workspace.id,
      name: workspace.name,
      boards: (boardsByWorkspace.get(workspace.id) ?? []).map((board) => ({
        id: board.id,
        title: board.title,
        lists: (listsByBoard.get(board.id) ?? []).map((list) => ({
          id: list.id,
          title: list.title,
        })),
      })),
    });
  }

  return { workspaces: grouped };
}
