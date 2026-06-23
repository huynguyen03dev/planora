// lib/schemas/label.ts
import { z } from "zod";

import { BOARD_COLORS } from "@/lib/constants";

const LABEL_COLOR_VALUES = BOARD_COLORS.map((color) => color.value) as [
  string,
  ...string[],
];

export const MIN_LABEL_NAME_LENGTH = 1;
export const MAX_LABEL_NAME_LENGTH = 50;

const labelNameSchema = z
  .string({ message: "Label name is required" })
  .trim()
  .min(MIN_LABEL_NAME_LENGTH, "Label name is required")
  .max(MAX_LABEL_NAME_LENGTH, "Label name is too long");

const labelColorSchema = z
  .string({ message: "Label color is required" })
  .refine((value) => LABEL_COLOR_VALUES.includes(value), "Invalid label color");

// Create a label on a board.
export const createLabelSchema = z.object({
  boardId: z.string({ message: "Board ID is required" }).uuid("Invalid board ID"),
  name: labelNameSchema,
  color: labelColorSchema,
});

// Rename / recolor an existing label.
export const updateLabelSchema = z.object({
  labelId: z.string({ message: "Label ID is required" }).uuid("Invalid label ID"),
  name: labelNameSchema,
  color: labelColorSchema,
});

// Delete a label from its board (cascades to CardLabel).
export const deleteLabelSchema = z.object({
  labelId: z.string({ message: "Label ID is required" }).uuid("Invalid label ID"),
});

// Attach a label to a card.
export const addCardLabelSchema = z.object({
  cardId: z.string({ message: "Card ID is required" }).uuid("Invalid card ID"),
  labelId: z.string({ message: "Label ID is required" }).uuid("Invalid label ID"),
});

// Detach a label from a card.
export const removeCardLabelSchema = z.object({
  cardId: z.string({ message: "Card ID is required" }).uuid("Invalid card ID"),
  labelId: z.string({ message: "Label ID is required" }).uuid("Invalid label ID"),
});

export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type DeleteLabelInput = z.infer<typeof deleteLabelSchema>;
export type AddCardLabelInput = z.infer<typeof addCardLabelSchema>;
export type RemoveCardLabelInput = z.infer<typeof removeCardLabelSchema>;
