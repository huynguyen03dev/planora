"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { verifySession } from "@/lib/dal";
import { getInvitationSummary } from "@/lib/invitation";
import {
  acceptInvitationSchema,
  declineInvitationSchema,
} from "@/lib/schemas";
import { auth } from "@/lib/auth";

type AcceptInvitationResult =
  | { success: true; workspaceId: string }
  | { success: false; error: string };

type DeclineInvitationResult =
  | { success: true }
  | { success: false; error: string };

const PENDING_INVITATION_STATUS = "pending";

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

export async function acceptInvitationAction(
  formData: FormData,
): Promise<AcceptInvitationResult> {
  const { user } = await verifySession();

  const rawData = Object.fromEntries(formData);
  const parsed = acceptInvitationSchema.safeParse(rawData);

  if (!parsed.success) {
    return { success: false, error: "Invitation not found" };
  }

  const { invitationId } = parsed.data;

  const invitation = await getInvitationSummary(invitationId);
  if (!invitation) {
    return { success: false, error: "Invitation not found" };
  }

  if (invitation.status !== PENDING_INVITATION_STATUS) {
    return { success: false, error: "Invitation is no longer pending" };
  }

  if (invitation.expiresAt <= new Date()) {
    return { success: false, error: "Invitation has expired" };
  }

  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      success: false,
      error: "This invitation was sent to a different email",
    };
  }

  try {
    await auth.api.acceptInvitation({
      headers: await headers(),
      body: {
        invitationId,
      },
    });

    revalidatePath("/invitations");
    revalidatePath("/workspace");
    revalidatePath("/boards");

    return { success: true, workspaceId: invitation.workspaceId };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "Failed to accept invitation. Please try again."),
    };
  }
}

export async function declineInvitationAction(
  formData: FormData,
): Promise<DeclineInvitationResult> {
  const { user } = await verifySession();

  const rawData = Object.fromEntries(formData);
  const parsed = declineInvitationSchema.safeParse(rawData);

  if (!parsed.success) {
    return { success: false, error: "Invitation not found" };
  }

  const { invitationId } = parsed.data;

  const invitation = await getInvitationSummary(invitationId);
  if (!invitation) {
    return { success: false, error: "Invitation not found" };
  }

  if (invitation.status !== PENDING_INVITATION_STATUS) {
    return { success: false, error: "Invitation is no longer pending" };
  }

  if (invitation.expiresAt <= new Date()) {
    return { success: false, error: "Invitation has expired" };
  }

  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      success: false,
      error: "This invitation was sent to a different email",
    };
  }

  try {
    await auth.api.rejectInvitation({
      headers: await headers(),
      body: {
        invitationId,
      },
    });

    revalidatePath("/invitations");
    revalidatePath("/workspace");
    revalidatePath("/boards");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "Failed to decline invitation. Please try again."),
    };
  }
}
