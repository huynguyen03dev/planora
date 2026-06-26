import { NextResponse } from "next/server";

import { verifySession } from "@/lib/dal";
import { listReceivedPendingInvitationsByEmail } from "@/lib/invitation";

export async function GET() {
  const { user } = await verifySession();

  const invitations = await listReceivedPendingInvitationsByEmail(user.email);

  return NextResponse.json({
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      workspaceId: invitation.workspaceId,
      workspaceName: invitation.workspaceName,
      role: invitation.role,
      inviterName: invitation.inviterName,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    })),
  });
}
