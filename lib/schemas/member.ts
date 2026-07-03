import { z } from "zod";

import { invitationIdSchema, workspaceIdSchema } from "./invitation";

// User ids are Better Auth nanoids (not UUIDs); bound by length. The action
// resolves the id to a WorkspaceMember within the workspace scope, which is the
// real isolation check — this is defense-in-depth against malformed input.
const userIdSchema = z
  .string({ message: "Member is required" })
  .trim()
  .min(1, "Member is required")
  .max(255);

const workspaceRoleSchema = z.enum(["admin", "editor", "viewer"], {
  message: "Invalid role",
});

export const removeMemberSchema = z.object({
  workspaceId: workspaceIdSchema,
  targetUserId: userIdSchema,
});

export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;

export const updateMemberRoleSchema = z.object({
  workspaceId: workspaceIdSchema,
  targetUserId: userIdSchema,
  role: workspaceRoleSchema,
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const leaveWorkspaceSchema = z.object({
  workspaceId: workspaceIdSchema,
});

export type LeaveWorkspaceInput = z.infer<typeof leaveWorkspaceSchema>;

export const cancelInvitationSchema = z.object({
  workspaceId: workspaceIdSchema,
  invitationId: invitationIdSchema,
});

export type CancelInvitationInput = z.infer<typeof cancelInvitationSchema>;
