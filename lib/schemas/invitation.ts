import { z } from "zod";

const workspaceIdSchema = z
  .string({ message: "Workspace is required" })
  .regex(/^[A-Za-z0-9]{32}$/, "Invalid workspace ID");

const invitationIdSchema = z
  .string({ message: "Invitation not found" })
  .trim()
  .min(1, "Invitation not found");

const invitationRoleSchema = z.enum(["editor", "viewer"], {
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
