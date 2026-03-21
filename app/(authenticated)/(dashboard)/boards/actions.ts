"use server";

import { refresh, revalidatePath } from "next/cache";

import { getBoardById, createBoard, updateBoard, deleteBoard } from "@/lib/board";
import { hasWorkspacePermission } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import { createWorkspaceForCurrentUser } from "@/lib/workspace";
import {
  createWorkspaceSchema,
  createBoardSchema,
  updateBoardSchema,
  deleteBoardSchema,
} from "@/lib/schemas";

type CreateWorkspaceResult =
  | { success: true; workspaceId: string }
  | { success: false; error: string };

type CreateBoardResult =
  | { success: true; boardId: string }
  | { success: false; error: string };

type UpdateBoardResult =
  | { success: true }
  | { success: false; error: string };

type DeleteBoardResult =
  | { success: true }
  | { success: false; error: string };

export async function createWorkspaceAction(
  formData: FormData,
): Promise<CreateWorkspaceResult> {
  await verifySession();

  // Parse and validate using Zod schema
  const rawData = Object.fromEntries(formData);
  const parsed = createWorkspaceSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Workspace name is required" };
  }

  try {
    const workspace = await createWorkspaceForCurrentUser(parsed.data.workspaceName);
    revalidatePath("/boards");

    return { success: true, workspaceId: workspace.id };
  } catch {
    return {
      success: false,
      error: "Failed to create workspace. Please try again.",
    };
  }
}

export async function createBoardAction(
  formData: FormData,
): Promise<CreateBoardResult> {
  const { userId } = await verifySession();

  // Parse and validate using Zod schema
  const rawData = Object.fromEntries(formData);
  const parsed = createBoardSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { workspaceId, title, backgroundColor } = parsed.data;

  const canCreateBoard = await hasWorkspacePermission(workspaceId, {
    board: ["create"],
  });

  if (!canCreateBoard) {
    return { success: false, error: "Board not found" };
  }

  try {
    const board = await createBoard({
      workspaceId,
      title,
      backgroundColor,
      createdById: userId,
    });

    revalidatePath("/boards");

    return {
      success: true,
      boardId: board.id,
    };
  } catch {
    return {
      success: false,
      error: "Failed to create board. Please try again.",
    };
  }
}

export async function updateBoardAction(
  formData: FormData,
): Promise<UpdateBoardResult> {
  await verifySession();

  // Parse and validate using Zod schema
  const rawData = Object.fromEntries(formData);
  const parsed = updateBoardSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { boardId, title, backgroundColor } = parsed.data;

  const board = await getBoardById(boardId);
  if (!board) {
    return { success: false, error: "Board not found" };
  }

  const canUpdateBoard = await hasWorkspacePermission(board.workspaceId, {
    board: ["update"],
  });

  if (!canUpdateBoard) {
    return { success: false, error: "Board not found" };
  }

  const data: { title?: string; backgroundColor?: string } = {};
  if (title !== undefined) {
    data.title = title;
  }
  if (backgroundColor !== undefined) {
    data.backgroundColor = backgroundColor;
  }

  try {
    await updateBoard(boardId, data);
    revalidatePath("/boards");
    revalidatePath(`/boards/${boardId}`);
    refresh();
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Failed to update board. Please try again.",
    };
  }
}

export async function deleteBoardAction(boardId: string): Promise<DeleteBoardResult> {
  await verifySession();

  // Validate using Zod schema
  const parsed = deleteBoardSchema.safeParse({ boardId });

  if (!parsed.success) {
    return { success: false, error: "Board not found" };
  }

  const board = await getBoardById(boardId);
  if (!board) {
    return { success: false, error: "Board not found" };
  }

  const canDeleteBoard = await hasWorkspacePermission(board.workspaceId, {
    board: ["delete"],
  });

  if (!canDeleteBoard) {
    return { success: false, error: "Board not found" };
  }

  try {
    await deleteBoard(boardId);
    revalidatePath("/boards");
    revalidatePath(`/boards/${boardId}`);
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Failed to delete board. Please try again.",
    };
  }
}
