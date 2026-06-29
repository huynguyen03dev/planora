// lib/schemas/checklist.ts
import { z } from "zod";

export const MIN_CHECKLIST_TITLE_LENGTH = 1;
export const MAX_CHECKLIST_TITLE_LENGTH = 100;
export const MIN_CHECKLIST_ITEM_TITLE_LENGTH = 1;
export const MAX_CHECKLIST_ITEM_TITLE_LENGTH = 200;

const checklistTitleSchema = z
  .string({ message: "Title is required" })
  .trim()
  .min(MIN_CHECKLIST_TITLE_LENGTH, "Title is required")
  .max(MAX_CHECKLIST_TITLE_LENGTH, "Title is too long");

const checklistItemTitleSchema = z
  .string({ message: "Title is required" })
  .trim()
  .min(MIN_CHECKLIST_ITEM_TITLE_LENGTH, "Title is required")
  .max(MAX_CHECKLIST_ITEM_TITLE_LENGTH, "Title is too long");

// Create a checklist on a card.
export const createChecklistSchema = z.object({
  cardId: z.string({ message: "Card ID is required" }).uuid("Invalid card ID"),
  title: checklistTitleSchema,
});

// Delete a checklist (cascades to its items).
export const deleteChecklistSchema = z.object({
  checklistId: z
    .string({ message: "Checklist ID is required" })
    .uuid("Invalid checklist ID"),
});

// Add an item to a checklist.
export const createChecklistItemSchema = z.object({
  checklistId: z
    .string({ message: "Checklist ID is required" })
    .uuid("Invalid checklist ID"),
  title: checklistItemTitleSchema,
});

// Toggle an item's completion state. FormData carries strings, so coerce the
// boolean from the "true"/"false" the client sends.
export const toggleChecklistItemSchema = z.object({
  itemId: z.string({ message: "Item ID is required" }).uuid("Invalid item ID"),
  isCompleted: z
    .union([z.literal("true"), z.literal("false")])
    .transform((value) => value === "true"),
});

// Delete a single checklist item.
export const deleteChecklistItemSchema = z.object({
  itemId: z.string({ message: "Item ID is required" }).uuid("Invalid item ID"),
});

export type CreateChecklistInput = z.infer<typeof createChecklistSchema>;
export type DeleteChecklistInput = z.infer<typeof deleteChecklistSchema>;
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;
export type ToggleChecklistItemInput = z.infer<typeof toggleChecklistItemSchema>;
export type DeleteChecklistItemInput = z.infer<typeof deleteChecklistItemSchema>;
