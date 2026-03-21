// lib/schemas/board.ts
import { z } from "zod";
import { BOARD_COLORS, DEFAULT_BOARD_COLOR, MAX_BOARD_TITLE_LENGTH, MIN_BOARD_TITLE_LENGTH } from "@/lib/constants";

// Helper: validate board colors exist
const boardColorSet = new Set<string>(BOARD_COLORS.map((color) => color.value));

// Schema for creating a workspace
export const createWorkspaceSchema = z.object({
  workspaceName: z
    .string({ message: "Workspace name is required" })
    .trim()
    .min(2, "Workspace name must be at least 2 characters")
    .max(64, "Workspace name must be 64 characters or less"),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

// Schema for creating a board
export const createBoardSchema = z.object({
  workspaceId: z.string({ message: "Workspace is required" }).uuid("Invalid workspace ID"),
  title: z
    .string({ message: "Board title is required" })
    .trim()
    .min(MIN_BOARD_TITLE_LENGTH, "Board title is required")
    .max(MAX_BOARD_TITLE_LENGTH, `Board title must be ${MAX_BOARD_TITLE_LENGTH} characters or less`),
  backgroundColor: z
    .string({ message: "Invalid board color" })
    .refine(
      (color) => boardColorSet.has(color),
      "Invalid board color"
    )
    .optional()
    .default(DEFAULT_BOARD_COLOR),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;

// Schema for updating a board
export const updateBoardSchema = z.object({
  boardId: z.string({ message: "Board not found" }).uuid("Invalid board ID"),
  title: z
    .string()
    .trim()
    .min(MIN_BOARD_TITLE_LENGTH, "Board title is required")
    .max(MAX_BOARD_TITLE_LENGTH, `Board title must be ${MAX_BOARD_TITLE_LENGTH} characters or less`)
    .optional(),
  backgroundColor: z
    .string()
    .refine(
      (color) => boardColorSet.has(color),
      "Invalid board color"
    )
    .optional(),
}).refine(
  (data) => data.title !== undefined || data.backgroundColor !== undefined,
  { message: "No board updates provided", path: ["title"] }
);

export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;

// Schema for deleting a board (only needs ID)
export const deleteBoardSchema = z.object({
  boardId: z.string({ message: "Board not found" }).uuid("Invalid board ID"),
});

export type DeleteBoardInput = z.infer<typeof deleteBoardSchema>;
