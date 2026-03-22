import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

type PermissionRequest = {
  board?: Array<"create" | "update" | "delete">;
  list?: Array<"create" | "update" | "delete">;
  card?: Array<"create" | "update" | "delete">;
  comment?: Array<"create" | "update" | "delete">;
};

export type WorkspaceRole = "admin" | "editor" | "viewer";

export type BoardPagePermissions = {
  canEditBoard: boolean;
  canDeleteBoard: boolean;
  canCreateList: boolean;
  canEditList: boolean;
  canDeleteList: boolean;
};

const rolePermissionMap: Record<WorkspaceRole, BoardPagePermissions> = {
  admin: {
    canEditBoard: true,
    canDeleteBoard: true,
    canCreateList: true,
    canEditList: true,
    canDeleteList: true,
  },
  editor: {
    canEditBoard: true,
    canDeleteBoard: false,
    canCreateList: true,
    canEditList: true,
    canDeleteList: true,
  },
  viewer: {
    canEditBoard: false,
    canDeleteBoard: false,
    canCreateList: false,
    canEditList: false,
    canDeleteList: false,
  },
};

export async function isWorkspaceMember(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const membership = await db.workspaceMember.findFirst({
    where: {
      organizationId: workspaceId,
      userId,
    },
    select: {
      id: true,
    },
  });

  return Boolean(membership);
}

export async function getWorkspaceRole(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  const membership = await db.workspaceMember.findFirst({
    where: {
      organizationId: workspaceId,
      userId,
    },
    select: {
      role: true,
    },
  });

  if (
    !membership ||
    (membership.role !== "admin" && membership.role !== "editor" && membership.role !== "viewer")
  ) {
    return null;
  }

  return membership.role;
}

export function getBoardPagePermissionsForRole(
  role: WorkspaceRole,
): BoardPagePermissions {
  return rolePermissionMap[role];
}

export async function hasWorkspacePermission(
  workspaceId: string,
  permissions: PermissionRequest,
): Promise<boolean> {
  const result = await auth.api.hasPermission({
    headers: await headers(),
    body: {
      organizationId: workspaceId,
      permissions,
    },
  });

  return result.success;
}
