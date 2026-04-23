"use server";

import { revalidatePath } from "next/cache";

import db from "@/lib/prisma";
import { getBoardById } from "@/lib/board";
import {
  createCard,
  updateCardTitle,
  updateCardDetails,
  archiveCard,
  getCardWithListAndBoard,
  reorderCardWithinListByNeighbors,
  moveCardToListByNeighbors,
} from "@/lib/card";
import { createComment } from "@/lib/comment";
import { createAttachment } from "@/lib/attachment";
import {
  createList,
  updateListTitle,
  deleteList,
  getListWithBoard,
  reorderListByNeighbors,
} from "@/lib/list";
import { createActivityEntry } from "@/lib/activity";
import {
  assignMemberToCard,
  removeMemberFromCard,
  type CardMemberRecord,
} from "@/lib/card-member";
import { hasWorkspacePermission } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import {
  createListSchema,
  updateListSchema,
  deleteListSchema,
  reorderListSchema,
  createCardSchema,
  updateCardSchema,
  archiveCardSchema,
  reorderCardSchema,
  moveCardSchema,
  updateCardDetailsSchema,
  createCommentSchema,
  assignCardMemberSchema,
  removeCardMemberSchema,
  uploadAttachmentSchema,
} from "@/lib/schemas";
import { validateFileForUpload, uploadToCloudinary } from "@/lib/cloudinary";

type CreateListResult =
  | { success: true; listId: string }
  | { success: false; error: string };

type UpdateListResult =
  | { success: true }
  | { success: false; error: string };

type DeleteListResult =
  | { success: true }
  | { success: false; error: string };

type CreateCardResult =
  | { success: true; cardId: string }
  | { success: false; error: string };

type UpdateCardResult =
  | { success: true }
  | { success: false; error: string };

type ArchiveCardResult =
  | { success: true }
  | { success: false; error: string };

type ReorderListResult =
  | { success: true }
  | { success: false; error: string };

type ReorderCardResult =
  | { success: true }
  | { success: false; error: string };

type MoveCardResult =
  | { success: true }
  | { success: false; error: string };

export async function createListAction(
  formData: FormData,
): Promise<CreateListResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = createListSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  await verifySession();

  const { boardId, title } = parsed.data;

  const board = await getBoardById(boardId);
  if (!board) {
    return { success: false, error: "Board not found" };
  }

  const canCreateList = await hasWorkspacePermission(board.workspaceId, {
    list: ["create"],
  });

  if (!canCreateList) {
    return { success: false, error: "Board not found" };
  }

  try {
    const list = await createList({ boardId, title });
    revalidatePath(`/boards/${boardId}`);
    return { success: true, listId: list.id };
  } catch {
    return { success: false, error: "Failed to create list. Please try again." };
  }
}

export async function updateListAction(
  formData: FormData,
): Promise<UpdateListResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = updateListSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  await verifySession();

  const { listId, title } = parsed.data;

  const result = await getListWithBoard(listId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "List not found" };
  }

  const canUpdateList = await hasWorkspacePermission(result.board.workspaceId, {
    list: ["update"],
  });

  if (!canUpdateList) {
    return { success: false, error: "List not found" };
  }

  try {
    await updateListTitle(listId, title);
    revalidatePath(`/boards/${result.list.boardId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update list. Please try again." };
  }
}

export async function deleteListAction(
  formData: FormData,
): Promise<DeleteListResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = deleteListSchema.safeParse(rawData);

  if (!parsed.success) {
    return { success: false, error: "List not found" };
  }

  await verifySession();

  const { listId } = parsed.data;

  const result = await getListWithBoard(listId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "List not found" };
  }

  const canDeleteList = await hasWorkspacePermission(result.board.workspaceId, {
    list: ["delete"],
  });

  if (!canDeleteList) {
    return { success: false, error: "List not found" };
  }

  try {
    await deleteList(listId);
    revalidatePath(`/boards/${result.list.boardId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete list. Please try again." };
  }
}

export async function createCardAction(
  formData: FormData,
): Promise<CreateCardResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = createCardSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId } = await verifySession();

  const { listId, title } = parsed.data;

  const result = await getListWithBoard(listId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "List not found" };
  }

  const canCreateCard = await hasWorkspacePermission(result.board.workspaceId, {
    card: ["create"],
  });

  if (!canCreateCard) {
    return { success: false, error: "List not found" };
  }

  try {
    const card = await createCard({ listId, title, createdById: userId });
    revalidatePath(`/boards/${result.list.boardId}`);
    return { success: true, cardId: card.id };
  } catch {
    return { success: false, error: "Failed to create card. Please try again." };
  }
}

export async function updateCardAction(
  formData: FormData,
): Promise<UpdateCardResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = updateCardSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  await verifySession();

  const { cardId, title } = parsed.data;

  const result = await getCardWithListAndBoard(cardId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(result.board.workspaceId, {
    card: ["update"],
  });

  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  try {
    await updateCardTitle(cardId, title);
    revalidatePath(`/boards/${result.list.boardId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update card. Please try again." };
  }
}

export async function archiveCardAction(
  formData: FormData,
): Promise<ArchiveCardResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = archiveCardSchema.safeParse(rawData);

  if (!parsed.success) {
    return { success: false, error: "Card not found" };
  }

  await verifySession();

  const { cardId } = parsed.data;

  const result = await getCardWithListAndBoard(cardId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  const canArchiveCard = await hasWorkspacePermission(result.board.workspaceId, {
    card: ["delete"],
  });

  if (!canArchiveCard) {
    return { success: false, error: "Card not found" };
  }

  try {
    await archiveCard(cardId);
    revalidatePath(`/boards/${result.list.boardId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to archive card. Please try again." };
  }
}

export async function reorderListAction(
  formData: FormData,
): Promise<ReorderListResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = reorderListSchema.safeParse(rawData);

  if (!parsed.success) {
    return { success: false, error: "List not found" };
  }

  await verifySession();

  const { listId, prevListId, nextListId } = parsed.data;

  const result = await getListWithBoard(listId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "List not found" };
  }

  const canUpdateList = await hasWorkspacePermission(result.board.workspaceId, {
    list: ["update"],
  });

  if (!canUpdateList) {
    return { success: false, error: "List not found" };
  }

  try {
    await reorderListByNeighbors({
      listId,
      prevListId: prevListId ?? null,
      nextListId: nextListId ?? null,
    });
    revalidatePath(`/boards/${result.list.boardId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to reorder list. Please try again." };
  }
}

export async function reorderCardAction(
  formData: FormData,
): Promise<ReorderCardResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = reorderCardSchema.safeParse(rawData);

  if (!parsed.success) {
    return { success: false, error: "Card not found" };
  }

  await verifySession();

  const { cardId, prevCardId, nextCardId } = parsed.data;

  const result = await getCardWithListAndBoard(cardId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(result.board.workspaceId, {
    card: ["update"],
  });

  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  try {
    await reorderCardWithinListByNeighbors({
      cardId,
      prevCardId: prevCardId ?? null,
      nextCardId: nextCardId ?? null,
    });
    revalidatePath(`/boards/${result.list.boardId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to reorder card. Please try again." };
  }
}

export async function moveCardAction(
  formData: FormData,
): Promise<MoveCardResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = moveCardSchema.safeParse(rawData);

  if (!parsed.success) {
    return { success: false, error: "Card not found" };
  }

  await verifySession();

  const { cardId, targetListId, prevCardId, nextCardId } = parsed.data;

  const cardResult = await getCardWithListAndBoard(cardId);
  if (!cardResult || cardResult.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  const targetListResult = await getListWithBoard(targetListId);
  if (
    !targetListResult ||
    targetListResult.board.archivedAt ||
    targetListResult.list.boardId !== cardResult.list.boardId
  ) {
    return { success: false, error: "List not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(cardResult.board.workspaceId, {
    card: ["update"],
  });

  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  try {
    await moveCardToListByNeighbors({
      cardId,
      targetListId,
      prevCardId: prevCardId ?? null,
      nextCardId: nextCardId ?? null,
    });
    revalidatePath(`/boards/${cardResult.list.boardId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to move card. Please try again." };
  }
}

type UpdateCardDetailsResult =
  | { success: true }
  | { success: false; error: string };

type CreateCommentResult =
  | { success: true; commentId: string }
  | { success: false; error: string };

type AssignCardMemberResult =
  | { success: true; changed: boolean; member: CardMemberRecord }
  | { success: false; error: string };

type RemoveCardMemberResult =
  | { success: true; changed: boolean }
  | { success: false; error: string };

export async function updateCardDetailsAction(
  formData: FormData,
): Promise<UpdateCardDetailsResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = updateCardDetailsSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId } = await verifySession();

  const { cardId, title, description } = parsed.data;

  const result = await getCardWithListAndBoard(cardId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(result.board.workspaceId, {
    card: ["update"],
  });

  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  try {
    await updateCardDetails(cardId, { title, description });
    await createActivityEntry({
      workspaceId: result.board.workspaceId,
      boardId: result.list.boardId,
      cardId,
      userId,
      action: "UPDATED",
      entityType: "CARD",
      metadata: { title, description: description ?? null },
    });
    revalidatePath(`/boards/${result.list.boardId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update card. Please try again." };
  }
}

export async function createCommentAction(
  formData: FormData,
): Promise<CreateCommentResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = createCommentSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId } = await verifySession();

  const { cardId, content } = parsed.data;

  const result = await getCardWithListAndBoard(cardId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  const canComment = await hasWorkspacePermission(result.board.workspaceId, {
    comment: ["create"],
  });

  if (!canComment) {
    return { success: false, error: "Card not found" };
  }

  try {
    const comment = await createComment({
      cardId,
      userId,
      content,
    });
    await createActivityEntry({
      workspaceId: result.board.workspaceId,
      boardId: result.list.boardId,
      cardId,
      userId,
      action: "COMMENTED",
      entityType: "COMMENT",
      metadata: { commentId: comment.id },
    });
    revalidatePath(`/boards/${result.list.boardId}`);
    return { success: true, commentId: comment.id };
  } catch {
    return { success: false, error: "Failed to create comment. Please try again." };
  }
}

export async function assignCardMemberAction(
  formData: FormData,
): Promise<AssignCardMemberResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = assignCardMemberSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId: actorUserId } = await verifySession();

  const { cardId, userId } = parsed.data;

  // Get card with board and workspace info for permission checking.
  const cardResult = await getCardWithListAndBoard(cardId);
  if (!cardResult || cardResult.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  // Check if user has permission to update cards in this workspace.
  const canUpdateCard = await hasWorkspacePermission(cardResult.board.workspaceId, {
    card: ["update"],
  });

  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  // Check if target user belongs to the same workspace.
  const workspaceMember = await db.workspaceMember.findFirst({
    where: {
      organizationId: cardResult.board.workspaceId,
      userId,
    },
  });

  if (!workspaceMember) {
    return { success: false, error: "User not in workspace" };
  }

  try {
    const assignment = await assignMemberToCard({ cardId, userId });

    if (assignment.changed) {
      await createActivityEntry({
        workspaceId: cardResult.board.workspaceId,
        boardId: cardResult.board.id,
        cardId,
        userId: actorUserId,
        action: "CREATED",
        entityType: "MEMBER",
        metadata: {
          actionType: "assign-member",
          targetUserId: userId,
          targetUserName: assignment.member.name,
        },
      });
    }

    revalidatePath(`/boards/${cardResult.board.id}`);
    return {
      success: true,
      changed: assignment.changed,
      member: assignment.member,
    };
  } catch (error) {
    console.error("Failed to assign member to card:", error);
    return { success: false, error: "Failed to assign member. Please try again." };
  }
}

export async function removeCardMemberAction(
  formData: FormData,
): Promise<RemoveCardMemberResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = removeCardMemberSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId: actorUserId } = await verifySession();

  const { cardId, userId } = parsed.data;

  // Get card with board and workspace info for permission checking.
  const cardResult = await getCardWithListAndBoard(cardId);
  if (!cardResult || cardResult.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  // Check if user has permission to update cards in this workspace.
  const canUpdateCard = await hasWorkspacePermission(cardResult.board.workspaceId, {
    card: ["update"],
  });

  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  try {
    const removal = await removeMemberFromCard({ cardId, userId });

    if (removal.changed) {
      const removedUser = await db.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      await createActivityEntry({
        workspaceId: cardResult.board.workspaceId,
        boardId: cardResult.board.id,
        cardId,
        userId: actorUserId,
        action: "DELETED",
        entityType: "MEMBER",
        metadata: {
          actionType: "remove-member",
          targetUserId: userId,
          targetUserName: removedUser?.name ?? "a member",
        },
      });
    }

    revalidatePath(`/boards/${cardResult.board.id}`);
    return { success: true, changed: removal.changed };
  } catch (error) {
    console.error("Failed to remove member from card:", error);
    return { success: false, error: "Failed to remove member. Please try again." };
  }
}

type UploadAttachmentResult =
  | { success: true; attachmentId: string }
  | { success: false; error: string };

export async function uploadAttachmentAction(
  formData: FormData,
): Promise<UploadAttachmentResult> {
  const cardId = formData.get("cardId");
  const file = formData.get("file");

  if (!cardId || typeof cardId !== "string" || !file || !(file instanceof File)) {
    return { success: false, error: "Invalid request" };
  }

  const parsed = uploadAttachmentSchema.safeParse({ cardId, file });

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId: actorUserId } = await verifySession();

  const { cardId: parsedCardId } = parsed.data;

  // Get card with board and workspace info for permission checking.
  const cardResult = await getCardWithListAndBoard(parsedCardId);
  if (!cardResult || cardResult.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  // Check if user has permission to update cards in this workspace.
  const canUpdateCard = await hasWorkspacePermission(cardResult.board.workspaceId, {
    card: ["update"],
  });

  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  // Validate file
  const fileValidation = validateFileForUpload(file);
  if (!fileValidation.valid) {
    return { success: false, error: fileValidation.error };
  }

  let cloudinaryResult;
  try {
    cloudinaryResult = await uploadToCloudinary({ file });
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    return { success: false, error: "Failed to upload file to cloud storage. Please try again." };
  }

  try {
    const attachment = await createAttachment({
      cardId: parsedCardId,
      userId: actorUserId,
      fileName: file.name,
      fileUrl: cloudinaryResult.secureUrl,
      fileType: file.type,
      fileSize: file.size,
      cloudinaryPublicId: cloudinaryResult.publicId,
      cloudinaryResourceType: cloudinaryResult.resourceType,
    });

    await createActivityEntry({
      workspaceId: cardResult.board.workspaceId,
      boardId: cardResult.board.id,
      cardId: parsedCardId,
      userId: actorUserId,
      action: "CREATED",
      entityType: "ATTACHMENT",
      metadata: {
        fileName: file.name,
        fileSize: file.size,
      },
    });

    revalidatePath(`/boards/${cardResult.board.id}`);
    return { success: true, attachmentId: attachment.id };
  } catch (error) {
    console.error("Failed to save attachment:", error);
    try {
      const { v2: cloudinary } = await import("cloudinary");
      const config = (await import("@/lib/cloudinary")).getCloudinaryConfig();
      cloudinary.config({
        cloud_name: config.cloudName,
        api_key: config.apiKey,
        api_secret: config.apiSecret,
      });
      await cloudinary.uploader.destroy(cloudinaryResult.publicId, {
        resource_type: cloudinaryResult.resourceType,
      });
      console.log("Cleaned up orphaned Cloudinary file:", cloudinaryResult.publicId);
    } catch (cleanupError) {
      console.error("Failed to clean up Cloudinary file:", cleanupError);
    }
    return { success: false, error: "Failed to save attachment. Please try again." };
  }
}
