"use server";

import { refresh, revalidatePath } from "next/cache";

import { getBoardById, createBoard, updateBoard, deleteBoard } from "@/lib/board";
import {
  normalizeBoardColor,
  normalizeBoardTitle,
  validateBoardColor,
  validateBoardTitle,
} from "@/lib/board-validation";
import { hasWorkspacePermission } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import { createWorkspaceForCurrentUser } from "@/lib/workspace";

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

  const nameValue = formData.get("workspaceName");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";

  if (!name) {
    return { success: false, error: "Workspace name is required" };
  }

  if (name.length < 2) {
    return {
      success: false,
      error: "Workspace name must be at least 2 characters",
    };
  }

  if (name.length > 64) {
    return {
      success: false,
      error: "Workspace name must be 64 characters or less",
    };
  }

  try {
    const workspace = await createWorkspaceForCurrentUser(name);
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

  const workspaceIdValue = formData.get("workspaceId");
  const titleValue = formData.get("title");
  const backgroundColorValue = formData.get("backgroundColor");

  const workspaceId = typeof workspaceIdValue === "string" ? workspaceIdValue : "";
  const rawTitle = typeof titleValue === "string" ? titleValue : "";
  const rawColor = typeof backgroundColorValue === "string" ? backgroundColorValue : null;

  if (!workspaceId) {
    return { success: false, error: "Workspace is required" };
  }

  const titleError = validateBoardTitle(rawTitle);
  if (titleError) {
    return { success: false, error: titleError };
  }

  const colorError = validateBoardColor(rawColor);
  if (colorError) {
    return { success: false, error: colorError };
  }

  const canCreateBoard = await hasWorkspacePermission(workspaceId, {
    board: ["create"],
  });

  if (!canCreateBoard) {
    return { success: false, error: "Board not found" };
  }

  try {
    const board = await createBoard({
      workspaceId,
      title: normalizeBoardTitle(rawTitle),
      backgroundColor: normalizeBoardColor(rawColor),
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

  const boardIdValue = formData.get("boardId");
  const titleValue = formData.get("title");
  const backgroundColorValue = formData.get("backgroundColor");

  const boardId = typeof boardIdValue === "string" ? boardIdValue : "";
  const rawTitle = typeof titleValue === "string" ? titleValue : null;
  const rawColor = typeof backgroundColorValue === "string" ? backgroundColorValue : null;

  if (!boardId) {
    return { success: false, error: "Board not found" };
  }

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

  if (rawTitle === null && rawColor === null) {
    return { success: false, error: "No board updates provided" };
  }

  if (rawTitle !== null) {
    const titleError = validateBoardTitle(rawTitle);
    if (titleError) {
      return { success: false, error: titleError };
    }
  }

  if (rawColor !== null) {
    const colorError = validateBoardColor(rawColor);
    if (colorError) {
      return { success: false, error: colorError };
    }
  }

  const data: { title?: string; backgroundColor?: string } = {};
  if (rawTitle !== null) {
    data.title = normalizeBoardTitle(rawTitle);
  }

  if (rawColor !== null) {
    data.backgroundColor = normalizeBoardColor(rawColor);
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

  if (!boardId) {
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
