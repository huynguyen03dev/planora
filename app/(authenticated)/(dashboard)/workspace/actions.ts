"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { hasWorkspacePermission } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import db from "@/lib/prisma";
import { inviteMemberSchema } from "@/lib/schemas";
import { auth } from "@/lib/auth";

type InviteMemberResult =
  | { success: true; invitationId: string }
  | { success: false; error: string };

const PENDING_INVITATION_STATUS = "pending";

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

export async function inviteMemberAction(
  formData: FormData,
): Promise<InviteMemberResult> {
  await verifySession();

  const rawData = Object.fromEntries(formData);
  const parsed = inviteMemberSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { workspaceId, email, role } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const canInviteMember = await hasWorkspacePermission(workspaceId, {
    invitation: ["create"],
  });

  if (!canInviteMember) {
    return { success: false, error: "Workspace not found" };
  }

  const existingMember = await db.workspaceMember.findFirst({
    where: {
      organizationId: workspaceId,
      user: {
        email: normalizedEmail,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingMember) {
    return { success: false, error: "User is already a workspace member" };
  }

  const duplicatePendingInvite = await db.invitation.findFirst({
    where: {
      organizationId: workspaceId,
      email: normalizedEmail,
      status: PENDING_INVITATION_STATUS,
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicatePendingInvite) {
    return {
      success: false,
      error: "An invitation is already pending for this email",
    };
  }

  try {
    const invitation = await auth.api.createInvitation({
      headers: await headers(),
      body: {
        email: normalizedEmail,
        role,
        organizationId: workspaceId,
      },
    });

    revalidatePath("/workspace");
    revalidatePath("/boards");

    return { success: true, invitationId: invitation.id };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "Failed to send invitation. Please try again."),
    };
  }
}
