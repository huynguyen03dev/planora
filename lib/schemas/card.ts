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

const maybeCardIdSchema = z
  .string({ message: "Invalid card ID" })
  .uuid({ message: "Invalid card ID" })
  .nullable()
  .optional();

export const reorderCardSchema = z
  .object({
    cardId: z.string().uuid({ message: "Invalid card ID" }),
    prevCardId: maybeCardIdSchema,
    nextCardId: maybeCardIdSchema,
  })
  .refine(
    (data) => !(data.prevCardId && data.nextCardId && data.prevCardId === data.nextCardId),
    {
      message: "Invalid reorder payload",
      path: ["nextCardId"],
    },
  )
  .refine(
    (data) => data.cardId !== data.prevCardId && data.cardId !== data.nextCardId,
    {
      message: "Invalid reorder payload",
      path: ["cardId"],
    },
  );

export type ReorderCardInput = z.infer<typeof reorderCardSchema>;

export const moveCardSchema = z
  .object({
    cardId: z.string().uuid({ message: "Invalid card ID" }),
    targetListId: z.string().uuid({ message: "Invalid list ID" }),
    prevCardId: maybeCardIdSchema,
    nextCardId: maybeCardIdSchema,
  })
  .refine(
    (data) => !(data.prevCardId && data.nextCardId && data.prevCardId === data.nextCardId),
    {
      message: "Invalid move payload",
      path: ["nextCardId"],
    },
  )
  .refine(
    (data) => data.cardId !== data.prevCardId && data.cardId !== data.nextCardId,
    {
      message: "Invalid move payload",
      path: ["cardId"],
    },
  );

export type MoveCardInput = z.infer<typeof moveCardSchema>;

const MAX_CARD_DESCRIPTION_LENGTH = 10000;

export const updateCardDetailsSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  title: z
    .string({ message: "Title is required" })
    .trim()
    .min(MIN_CARD_TITLE_LENGTH, "Title is required")
    .max(MAX_CARD_TITLE_LENGTH, `Title must be ${MAX_CARD_TITLE_LENGTH} characters or less`),
  description: z
    .string()
    .max(MAX_CARD_DESCRIPTION_LENGTH, `Description must be ${MAX_CARD_DESCRIPTION_LENGTH} characters or less`)
    .transform((val) => (val === "" ? null : val))
    .nullable()
    .default(null),
});

export type UpdateCardDetailsInput = z.infer<typeof updateCardDetailsSchema>;
