import { z } from "zod";

// Better Auth organization ids are 32-char nanoids (NOT UUIDs); bound by the
// exact shape rather than parsing as a UUID. Exported so the member-management
// schemas reuse the identical contract (US-063).
export const workspaceIdSchema = z
  .string({ message: "Workspace is required" })
  .regex(/^[A-Za-z0-9]{32}$/, "Invalid workspace ID");

export const invitationIdSchema = z
  .string({ message: "Invitation not found" })
  .trim()
  .min(1, "Invitation not found");

// Admins may invite at any role, admin included (US-063). editor/viewer remain
// the common case; admin is deliberate co-management.
const invitationRoleSchema = z.enum(["admin", "editor", "viewer"], {
  message: "Invalid role",
});

export const inviteMemberSchema = z.object({
  workspaceId: workspaceIdSchema,
  email: z
    .string({ message: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email address"),
  role: invitationRoleSchema,
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const acceptInvitationSchema = z.object({
  invitationId: invitationIdSchema,
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const declineInvitationSchema = z.object({
  invitationId: invitationIdSchema,
});

export type DeclineInvitationInput = z.infer<typeof declineInvitationSchema>;
