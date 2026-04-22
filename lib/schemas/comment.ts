import { z } from "zod";

const MIN_COMMENT_CONTENT_LENGTH = 1;
const MAX_COMMENT_CONTENT_LENGTH = 2000;

export const createCommentSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  content: z
    .string({ message: "Comment is required" })
    .trim()
    .min(MIN_COMMENT_CONTENT_LENGTH, "Comment cannot be empty")
    .max(MAX_COMMENT_CONTENT_LENGTH, `Comment must be ${MAX_COMMENT_CONTENT_LENGTH} characters or less`),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;