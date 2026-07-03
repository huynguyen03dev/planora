"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { hasWorkspacePermission } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import db from "@/lib/prisma";
import {
  cancelInvitationSchema,
  leaveWorkspaceSchema,
  removeMemberSchema,
  updateMemberRoleSchema,
} from "@/lib/schemas";
import {
  assertRetainsAdmin,
  LastAdminError,
  resolveWorkspaceMember,
  withWorkspaceAdminLock,
} from "@/lib/workspace-members";
import {
  listWorkspaceMembershipsByUserId,
  setActiveWorkspaceForCurrentUser,
} from "@/lib/workspace";

type ActionResult = { success: true } | { success: false; error: string };
type LeaveResult =
  | { success: true; redirectTo: string }
  | { success: false; error: string };

// Better Auth returns "Workspace not found" via our permission gate; keep the
// same not-found posture for denials so we never confirm a workspace exists to a
// caller who cannot manage it (mirrors inviteMemberAction).
const WORKSPACE_NOT_FOUND = "Workspace not found";
const LAST_ADMIN_MESSAGE = "A workspace must keep at least one admin.";

function firstFieldError(
  error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } },
): string | undefined {
  return Object.values(error.flatten().fieldErrors)[0]?.[0];
}

// R2 fires as our own LastAdminError before the BA call, so we normally surface
// the friendly message. If Better Auth's own last-owner guard fires first (its
// message says "owner"), translate it to our product language.
function normalizeAdminError(error: unknown): string {
  if (error instanceof LastAdminError) {
    return error.message;
  }

  const message = error instanceof Error ? error.message : "";
  if (/only owner|without an owner/i.test(message)) {
    return LAST_ADMIN_MESSAGE;
  }

  return message.trim().length > 0
    ? message
    : "Action failed. Please try again.";
}

export async function removeMemberAction(input: unknown): Promise<ActionResult> {
  await verifySession();

  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) ?? "Validation failed" };
  }

  const { workspaceId, targetUserId } = parsed.data;

  const canRemove = await hasWorkspacePermission(workspaceId, {
    member: ["delete"],
  });
  if (!canRemove) {
    return { success: false, error: WORKSPACE_NOT_FOUND };
  }

  const target = await resolveWorkspaceMember(workspaceId, targetUserId);
  if (!target) {
    return { success: false, error: "Member not found" };
  }

  try {
    await withWorkspaceAdminLock(workspaceId, async (adminCount) => {
      assertRetainsAdmin(adminCount, target.role === "admin");
      await auth.api.removeMember({
        headers: await headers(),
        body: { memberIdOrEmail: target.memberId, organizationId: workspaceId },
      });
    });

    revalidatePath("/workspace");
    revalidatePath("/boards");
    return { success: true };
  } catch (error) {
    return { success: false, error: normalizeAdminError(error) };
  }
}

export async function updateMemberRoleAction(
  input: unknown,
): Promise<ActionResult> {
  await verifySession();

  const parsed = updateMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) ?? "Validation failed" };
  }

  const { workspaceId, targetUserId, role } = parsed.data;

  const canUpdate = await hasWorkspacePermission(workspaceId, {
    member: ["update"],
  });
  if (!canUpdate) {
    return { success: false, error: WORKSPACE_NOT_FOUND };
  }

  const target = await resolveWorkspaceMember(workspaceId, targetUserId);
  if (!target) {
    return { success: false, error: "Member not found" };
  }

  // No-op: nothing to change, and it must never count as an admin-affecting op.
  if (target.role === role) {
    return { success: true };
  }

  try {
    await withWorkspaceAdminLock(workspaceId, async (adminCount) => {
      assertRetainsAdmin(adminCount, target.role === "admin" && role !== "admin");
      await auth.api.updateMemberRole({
        headers: await headers(),
        body: { memberId: target.memberId, role, organizationId: workspaceId },
      });
    });

    revalidatePath("/workspace");
    revalidatePath("/boards");
    return { success: true };
  } catch (error) {
    return { success: false, error: normalizeAdminError(error) };
  }
}

export async function leaveWorkspaceAction(input: unknown): Promise<LeaveResult> {
  const { userId } = await verifySession();

  const parsed = leaveWorkspaceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) ?? "Validation failed" };
  }

  const { workspaceId } = parsed.data;

  // Any member may leave; membership itself is the gate. A non-member resolves
  // to null (also the isolation check) and is denied before any write.
  const self = await resolveWorkspaceMember(workspaceId, userId);
  if (!self) {
    return { success: false, error: WORKSPACE_NOT_FOUND };
  }

  try {
    await withWorkspaceAdminLock(workspaceId, async (adminCount) => {
      assertRetainsAdmin(adminCount, self.role === "admin");
      await auth.api.leaveOrganization({
        headers: await headers(),
        body: { organizationId: workspaceId },
      });
    });
  } catch (error) {
    return { success: false, error: normalizeAdminError(error) };
  }

  // Better Auth nulls the active org on leave; reselect a remaining workspace so
  // the chooser lands the user somewhere sensible (decision 0019, R3).
  try {
    const remaining = await listWorkspaceMembershipsByUserId(userId);
    if (remaining.length > 0) {
      await setActiveWorkspaceForCurrentUser(remaining[0].workspaceId);
    }
  } catch (error) {
    console.error("Failed to reselect active workspace after leave:", error);
  }

  revalidatePath("/workspace");
  revalidatePath("/boards");
  return { success: true, redirectTo: "/workspace" };
}

export async function cancelInvitationAction(
  input: unknown,
): Promise<ActionResult> {
  await verifySession();

  const parsed = cancelInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) ?? "Validation failed" };
  }

  const { workspaceId, invitationId } = parsed.data;

  const canCancel = await hasWorkspacePermission(workspaceId, {
    invitation: ["cancel"],
  });
  if (!canCancel) {
    return { success: false, error: WORKSPACE_NOT_FOUND };
  }

  // Isolation: the invitation must belong to the caller's workspace. Better Auth
  // derives the org from the invitation, so without this a WS-B admin could pass
  // a WS-A invitation id; scoping here denies before the BA call.
  const invitation = await db.invitation.findFirst({
    where: { id: invitationId, organizationId: workspaceId },
    select: { id: true },
  });
  if (!invitation) {
    return { success: false, error: "Invitation not found" };
  }

  try {
    await auth.api.cancelInvitation({
      headers: await headers(),
      body: { invitationId },
    });

    revalidatePath("/workspace");
    revalidatePath("/boards");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Failed to revoke invitation.",
    };
  }
}
