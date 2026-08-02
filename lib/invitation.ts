import "server-only";

import db from "@/lib/prisma";

const PENDING_INVITATION_STATUS = "pending";

export type WorkspacePendingInvitationRecord = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  inviterId: string;
  inviterName: string;
  inviterEmail: string;
};

export type ReceivedPendingInvitationRecord = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  inviterId: string;
  inviterName: string;
  inviterEmail: string;
};

export type InvitationSummaryRecord = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  inviterId: string;
  inviterName: string;
  inviterEmail: string;
} | null;

export async function listWorkspacePendingInvitations(
  workspaceId: string,
): Promise<WorkspacePendingInvitationRecord[]> {
  const now = new Date();

  const invitations = await db.invitation.findMany({
    where: {
      organizationId: workspaceId,
      status: PENDING_INVITATION_STATUS,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      organizationId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      inviterId: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      workspace: {
        select: {
          name: true,
        },
      },
    },
  });

  return invitations.map((invitation) => ({
    id: invitation.id,
    workspaceId: invitation.organizationId,
    workspaceName: invitation.workspace.name,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    inviterId: invitation.inviterId,
    inviterName: invitation.user.name,
    inviterEmail: invitation.user.email,
  }));
}

export async function listReceivedPendingInvitationsByEmail(
  email: string,
): Promise<ReceivedPendingInvitationRecord[]> {
  const now = new Date();
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail.length === 0) {
    return [];
  }

  const invitations = await db.invitation.findMany({
    where: {
      email: normalizedEmail,
      status: PENDING_INVITATION_STATUS,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      organizationId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      inviterId: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      workspace: {
        select: {
          name: true,
        },
      },
    },
  });

  return invitations.map((invitation) => ({
    id: invitation.id,
    workspaceId: invitation.organizationId,
    workspaceName: invitation.workspace.name,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    inviterId: invitation.inviterId,
    inviterName: invitation.user.name,
    inviterEmail: invitation.user.email,
  }));
}

/**
 * Pending-invitation count for an email (US-083 W2 badge resync). The header's
 * connect-time resync reads this from the DB so a reconnect heals drift rather
 * than trusting an increment-only counter. Better Auth stores both user and
 * invitation emails lowercase (sign-up.mjs normalizes at sign-up;
 * createInvitation lowercases on create), so the input is normalized before
 * the query — mirroring `listReceivedPendingInvitationsByEmail`.
 */
export async function getPendingInvitationCount(email: string): Promise<number> {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail.length === 0) {
    return 0;
  }

  return db.invitation.count({
    where: {
      email: normalizedEmail,
      status: PENDING_INVITATION_STATUS,
      expiresAt: {
        gt: new Date(),
      },
    },
  });
}

export async function getInvitationSummary(
  invitationId: string,
): Promise<InvitationSummaryRecord> {
  const invitation = await db.invitation.findUnique({
    where: {
      id: invitationId,
    },
    select: {
      id: true,
      organizationId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      inviterId: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      workspace: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!invitation) {
    return null;
  }

  return {
    id: invitation.id,
    workspaceId: invitation.organizationId,
    workspaceName: invitation.workspace.name,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    inviterId: invitation.inviterId,
    inviterName: invitation.user.name,
    inviterEmail: invitation.user.email,
  };
}
