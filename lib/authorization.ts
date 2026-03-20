import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

type PermissionRequest = {
  board?: Array<"create" | "update" | "delete">;
  list?: Array<"create" | "update" | "delete">;
  card?: Array<"create" | "update" | "delete">;
  comment?: Array<"create" | "update" | "delete">;
};

export async function isWorkspaceMember(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const membership = await prisma.workspaceMember.findFirst({
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
