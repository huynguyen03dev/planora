import { z } from "zod";

const MIN_LIST_TITLE_LENGTH = 1;
const MAX_LIST_TITLE_LENGTH = 100;

export const createListSchema = z.object({
  boardId: z.string().uuid({ message: "Invalid board ID" }),
  title: z
    .string({ message: "Title is required" })
    .trim()
    .min(MIN_LIST_TITLE_LENGTH, "Title is required")
    .max(MAX_LIST_TITLE_LENGTH, `Title must be ${MAX_LIST_TITLE_LENGTH} characters or less`),
});

export type CreateListInput = z.infer<typeof createListSchema>;

export const updateListSchema = z.object({
  listId: z.string().uuid({ message: "Invalid list ID" }),
  title: z
    .string({ message: "Title is required" })
    .trim()
    .min(MIN_LIST_TITLE_LENGTH, "Title is required")
    .max(MAX_LIST_TITLE_LENGTH, `Title must be ${MAX_LIST_TITLE_LENGTH} characters or less`),
});

export type UpdateListInput = z.infer<typeof updateListSchema>;

export const deleteListSchema = z.object({
  listId: z.string().uuid({ message: "Invalid list ID" }),
});

export type DeleteListInput = z.infer<typeof deleteListSchema>;

export const archiveListSchema = deleteListSchema;
export type ArchiveListInput = DeleteListInput;

export const restoreListSchema = deleteListSchema;
export type RestoreListInput = DeleteListInput;

export const permanentDeleteListSchema = z.object({
  listId: z.string().uuid({ message: "Invalid list ID" }),
  confirmationText: z
    .string({ message: "Confirmation text is required" })
    .min(1, "Confirmation text is required"),
  force: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((val) => val === "true"),
});

export type PermanentDeleteListInput = z.infer<typeof permanentDeleteListSchema>;

const maybeListIdSchema = z
  .string({ message: "Invalid list ID" })
  .uuid({ message: "Invalid list ID" })
  .nullable()
  .optional();

// Explicit placement intent + OCC anchor (decision 0032) — mirror the card
// schemas; see lib/schemas/card.ts for the shared definitions.
const placementIntentSchema = z.enum(["start", "end", "between"]);
const expectedMoveRevisionSchema = z
  .preprocess(
    (value) => (value === undefined || value === "" ? 0 : Number(value)),
    z.number().int().min(0, "Invalid move revision"),
  )
  .default(0);

export const reorderListSchema = z
  .object({
    listId: z.string().uuid({ message: "Invalid list ID" }),
    intent: placementIntentSchema,
    prevListId: maybeListIdSchema,
    nextListId: maybeListIdSchema,
    expectedMoveRevision: expectedMoveRevisionSchema,
  })
  .refine(
    (data) => !(data.prevListId && data.nextListId && data.prevListId === data.nextListId),
    {
      message: "Invalid reorder payload",
      path: ["nextListId"],
    },
  )
  .refine(
    (data) => data.listId !== data.prevListId && data.listId !== data.nextListId,
    {
      message: "Invalid reorder payload",
      path: ["listId"],
    },
  );

export type ReorderListInput = z.infer<typeof reorderListSchema>;
