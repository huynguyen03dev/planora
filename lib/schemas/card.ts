import { z } from "zod";

const MIN_CARD_TITLE_LENGTH = 1;
const MAX_CARD_TITLE_LENGTH = 160;

export const createCardSchema = z.object({
  listId: z.string().uuid({ message: "Invalid list ID" }),
  title: z
    .string({ message: "Title is required" })
    .trim()
    .min(MIN_CARD_TITLE_LENGTH, "Title is required")
    .max(MAX_CARD_TITLE_LENGTH, `Title must be ${MAX_CARD_TITLE_LENGTH} characters or less`),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;

export const updateCardSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  title: z
    .string({ message: "Title is required" })
    .trim()
    .min(MIN_CARD_TITLE_LENGTH, "Title is required")
    .max(MAX_CARD_TITLE_LENGTH, `Title must be ${MAX_CARD_TITLE_LENGTH} characters or less`),
});

export type UpdateCardInput = z.infer<typeof updateCardSchema>;

export const archiveCardSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
});

export type ArchiveCardInput = z.infer<typeof archiveCardSchema>;
