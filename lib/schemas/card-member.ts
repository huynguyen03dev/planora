// lib/schemas/card-member.ts
import { z } from "zod";

// Schema for assigning a member to a card
export const assignCardMemberSchema = z.object({
  cardId: z
    .string({ message: "Card ID is required" })
    .uuid("Invalid card ID"),
  // Better Auth generates 32-char alphanumeric IDs (nanoid-style), not UUIDs, so
  // userId is bounded by length rather than parsed as a UUID.
  userId: z
    .string({ message: "User ID is required" })
    .min(1, "User ID is required")
    .max(255, "User ID is too long"),
});

// Schema for removing a member from a card
export const removeCardMemberSchema = z.object({
  cardId: z
    .string({ message: "Card ID is required" })
    .uuid("Invalid card ID"),
  // Better Auth generates 32-char alphanumeric IDs (nanoid-style), not UUIDs, so
  // userId is bounded by length rather than parsed as a UUID.
  userId: z
    .string({ message: "User ID is required" })
    .min(1, "User ID is required")
    .max(255, "User ID is too long"),
});

export type AssignCardMemberInput = z.infer<typeof assignCardMemberSchema>;
export type RemoveCardMemberInput = z.infer<typeof removeCardMemberSchema>;