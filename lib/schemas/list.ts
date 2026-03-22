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
