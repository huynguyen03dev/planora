import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
};

export type WorkspaceBoard = {
  id: string;
  title: string;
  backgroundColor: string | null;
  workspaceId: string;
};

function toSlugSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalized.length > 0) {
    return normalized.slice(0, 40);
  }

  return "workspace";
}

export async function listWorkspaceMembershipsByUserId(
  userId: string,
): Promise<WorkspaceMembership[]> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
        },
      },
    },
  });

  memberships.sort(
    (a, b) =>
      a.workspace.createdAt.getTime() - b.workspace.createdAt.getTime(),
  );

  return memberships.map((membership) => ({
    workspaceId: membership.organizationId,
    role: membership.role,
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
    },
  }));
}

export async function createWorkspaceForCurrentUser(
  rawName: string,
): Promise<{ id: string; name: string; slug: string }> {
  const name = rawName.trim();
  if (name.length === 0) {
    throw new Error("Workspace name is required.");
  }

  const slugBase = toSlugSegment(name);
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;

  const workspace = await auth.api.createOrganization({
    body: {
      name,
      slug,
    },
    headers: await headers(),
  });

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
  };
}

export async function setActiveWorkspaceForCurrentUser(
  organizationId: string,
): Promise<void> {
  await auth.api.setActiveOrganization({
    body: { organizationId },
    headers: await headers(),
  });
}

export async function listBoardsByWorkspaceIds(
  workspaceIds: string[],
): Promise<WorkspaceBoard[]> {
  if (workspaceIds.length === 0) {
    return [];
  }

  const boards = await db.board.findMany({
    where: {
      workspaceId: {
        in: workspaceIds,
      },
      archivedAt: null,
    },
    select: {
      id: true,
      title: true,
      backgroundColor: true,
      workspaceId: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return boards;
}
