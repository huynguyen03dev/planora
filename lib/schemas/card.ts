import { z } from "zod";

import { IMAGE_MIME_TYPES, fileSchema } from "./file";

const MIN_CARD_TITLE_LENGTH = 1;
const MAX_CARD_TITLE_LENGTH = 160;

// Valid estimate hour values per PRD
export const VALID_ESTIMATE_HOURS = [1, 2, 4, 8, 16] as const;

export const estimateHoursSchema = z.preprocess(
  (value) => {
    if (value === "" || value == null) return null;
    if (typeof value === "string") return Number(value);
    return value;
  },
  z
    .number()
    .int()
    .refine((val) => VALID_ESTIMATE_HOURS.includes(val as typeof VALID_ESTIMATE_HOURS[number]), {
      message: `Estimate must be one of: ${VALID_ESTIMATE_HOURS.join(", ")}`,
    })
    .nullable()
    .optional(),
);

const MAX_CARD_DESCRIPTION_LENGTH = 10000;

// US-083 W7: quick capture's optional fields ride the SAME schema as the
// existing board composer, backward-compatibly — absent keys (the board
// composer's form) parse to null just like empty strings (the capture
// dialog's form). Priority follows the existing "NONE" → null convention
// (see updateCardPriorityAction); dueDate accepts the "YYYY-MM-DD" wire
// format the detail sheet already uses (z.coerce.date convention, with ""
// normalized to null before coercion).
export const createCardSchema = z.object({
  listId: z.string().uuid({ message: "Invalid list ID" }),
  title: z
    .string({ message: "Title is required" })
    .trim()
    .min(MIN_CARD_TITLE_LENGTH, "Title is required")
    .max(MAX_CARD_TITLE_LENGTH, `Title must be ${MAX_CARD_TITLE_LENGTH} characters or less`),
  description: z
    .string()
    .max(MAX_CARD_DESCRIPTION_LENGTH, `Description must be ${MAX_CARD_DESCRIPTION_LENGTH} characters or less`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  dueDate: z
    .preprocess((value) => {
      if (value === "" || value == null) return null;
      return value;
    }, z.coerce.date().nullable())
    .optional(),
  priority: z
    .preprocess((value) => {
      if (value === "" || value === "NONE" || value == null) return null;
      return value;
    }, z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).nullable())
    .optional(),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;

export const archiveCardSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
});

export type ArchiveCardInput = z.infer<typeof archiveCardSchema>;

export const restoreCardSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
});

export type RestoreCardInput = z.infer<typeof restoreCardSchema>;

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

export const updateCardEstimateSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  estimateHours: estimateHoursSchema,
});

export type UpdateCardEstimateInput = z.infer<typeof updateCardEstimateSchema>;

// Card-owned completion toggle (US-045). `complete` is a form-string boolean:
// "true" marks complete, "false" reopens. Completion is a property of the card,
// never derived from list membership (decision 0020).
export const toggleCardCompletionSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  complete: z.preprocess((value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }, z.boolean({ message: "Invalid completion state" })),
});

export type ToggleCardCompletionInput = z.infer<typeof toggleCardCompletionSchema>;

export const updateCardDueDateSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  dueDate: z.coerce.date().nullable().optional(),
});

export type UpdateCardDueDateInput = z.infer<typeof updateCardDueDateSchema>;

export const updateCardPrioritySchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).nullable(),
});

export type UpdateCardPriorityInput = z.infer<typeof updateCardPrioritySchema>;

export const updateCardCoverSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  coverImage: z.string().url({ message: "Must be a valid URL" }).max(2048).nullable(),
});

export type UpdateCardCoverInput = z.infer<typeof updateCardCoverSchema>;

export const setCardCoverSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  file: fileSchema(IMAGE_MIME_TYPES, "Only image files are allowed"),
});

export type SetCardCoverInput = z.infer<typeof setCardCoverSchema>;
