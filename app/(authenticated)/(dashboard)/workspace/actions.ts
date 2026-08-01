"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { z } from "zod";

import { hasWorkspacePermission } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import db from "@/lib/prisma";
import { inviteMemberSchema } from "@/lib/schemas";
import { isValidTimezone } from "@/lib/timezone";
import { auth } from "@/lib/auth";
import { notifyInvited } from "@/lib/notification";
import { emitAnalyticsRefresh, emitInvitationNew } from "@/lib/realtime/server";

type InviteMemberResult =
  | { success: true; invitationId: string }
  | { success: false; error: string };

const PENDING_INVITATION_STATUS = "pending";

// workspaceId reaches these settings actions straight from the client, so parse
// it before any DB use (CLAUDE.md gotcha #4). NOTE: a workspace IS a Better Auth
// organization, whose id is a 32-char nanoid — NOT a UUID (cf. the US-062 MJ1
// memberId correction; app models like board/card use UUIDs, Better Auth models
// do not). So bound it by length rather than parsing as a UUID; .uuid() would
// reject every legitimate workspace id. hasWorkspacePermission remains the real
// gate — this is defense-in-depth with a "not found" posture on malformed input.
const workspaceIdSchema = z.string().min(1).max(255);

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

export async function inviteMemberAction(
  formData: FormData,
): Promise<InviteMemberResult> {
  const { userId: inviterUserId } = await verifySession();

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

    // Best-effort in-app notification for invited user
    try {
      const inviter = await db.user.findUnique({
        where: { id: inviterUserId },
        select: { name: true },
      });
      const workspace = await db.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
      });
      await notifyInvited({
        invitedEmail: normalizedEmail,
        inviterName: inviter?.name ?? "Someone",
        workspaceName: workspace?.name ?? "a workspace",
      });
    } catch (notificationError) {
      console.error("Failed to send invite notification:", notificationError);
    }

    // Best-effort live arrival signal (US-083 W2): resolve an already-
    // registered invitee by normalized email and push `invitation:new` to their
    // user room only. Better Auth stores BOTH user emails and invitation
    // emails lowercase (sign-up.mjs normalizes at sign-up; createInvitation
    // lowercases on create), so the insensitive match is a defensive superset.
    // An unregistered email gets no realtime signal — the persisted invitation
    // and email flow still succeed. A lookup/emit failure never fails the
    // invite.
    try {
      const invitee = await db.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: "insensitive" } },
        select: { id: true },
      });

      if (invitee) {
        emitInvitationNew(invitee.id, { invitationId: invitation.id });
      }
    } catch (emitError) {
      console.error("Failed to emit invitation:new:", emitError);
    }

    return { success: true, invitationId: invitation.id };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "Failed to send invitation. Please try again."),
    };
  }
}

// ─── Workspace Analytics Settings ─────────────────────────────────

type UpdateWorkspaceTimezoneResult =
  | { success: true }
  | { success: false; error: string };

export async function updateWorkspaceTimezoneAction(
  workspaceId: string,
  timezone: string,
): Promise<UpdateWorkspaceTimezoneResult> {
  await verifySession();

  if (!workspaceIdSchema.safeParse(workspaceId).success) {
    return { success: false, error: "Workspace not found" };
  }

  if (!isValidTimezone(timezone)) {
    return { success: false, error: "Invalid timezone. Please enter a valid IANA timezone string (e.g. America/New_York, UTC)." };
  }

  const canManageWorkspace = await hasWorkspacePermission(workspaceId, {
    organization: ["update"],
  });

  if (!canManageWorkspace) {
    return { success: false, error: "Workspace not found" };
  }

  try {
    await db.workspace.update({
      where: { id: workspaceId },
      data: { timezone },
    });

    revalidatePath("/workspace");
    emitAnalyticsRefresh(workspaceId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "Failed to update timezone."),
    };
  }
}

type UpdateWorkspaceRequireEstimateResult =
  | { success: true }
  | { success: false; error: string };

export async function updateWorkspaceRequireEstimateAction(
  workspaceId: string,
  requireEstimateBeforeDone: boolean,
): Promise<UpdateWorkspaceRequireEstimateResult> {
  await verifySession();

  if (!workspaceIdSchema.safeParse(workspaceId).success) {
    return { success: false, error: "Workspace not found" };
  }

  const canManageWorkspace = await hasWorkspacePermission(workspaceId, {
    organization: ["update"],
  });

  if (!canManageWorkspace) {
    return { success: false, error: "Workspace not found" };
  }

  try {
    await db.workspace.update({
      where: { id: workspaceId },
      data: { requireEstimateBeforeDone },
    });

    revalidatePath("/workspace");
    emitAnalyticsRefresh(workspaceId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "Failed to update setting."),
    };
  }
}

type UpdateWorkspaceAnalyticsLaunchResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Set the analytics launch boundary for a workspace.
 * This marks when full analytics history started being captured.
 * Admin-only action, typically called once after backfill.
 */
export async function updateWorkspaceAnalyticsLaunchAction(
  workspaceId: string,
  launchAt: Date,
): Promise<UpdateWorkspaceAnalyticsLaunchResult> {
  await verifySession();

  if (!workspaceIdSchema.safeParse(workspaceId).success) {
    return { success: false, error: "Workspace not found" };
  }

  const canManageWorkspace = await hasWorkspacePermission(workspaceId, {
    organization: ["update"],
  });

  if (!canManageWorkspace) {
    return { success: false, error: "Workspace not found" };
  }

  try {
    await db.workspace.update({
      where: { id: workspaceId },
      data: { analyticsLaunchAt: launchAt },
    });

    revalidatePath("/workspace");
    emitAnalyticsRefresh(workspaceId);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "Failed to update analytics launch date."),
    };
  }
}
