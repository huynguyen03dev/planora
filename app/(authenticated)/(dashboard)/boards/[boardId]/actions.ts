"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/app/generated/prisma/client";

import db from "@/lib/prisma";
import { getBoardById } from "@/lib/board";
import {
  updateCardDetails,
  getCardWithListAndBoard,
  reorderCardWithinListByNeighbors,
  getCardWithListAndMembers,
} from "@/lib/card";
import { createComment } from "@/lib/comment";
import { createAttachment } from "@/lib/attachment";
import {
  type LabelRecord,
  createLabel,
  updateLabel,
  deleteLabel,
  addCardLabel,
  removeCardLabel,
  getLabelWithBoard,
  getCardLabels,
  getCardIdsWithLabel,
} from "@/lib/label";
import {
  createList,
  updateListTitle,
  updateListIsDone,
  getListWithBoard,
  reorderListByNeighbors,
} from "@/lib/list";
import { createActivityEntry } from "@/lib/activity";
import {
  type CardMemberRecord,
  getCardMembers,
} from "@/lib/card-member";
import { hasWorkspacePermission } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import {
  emitAnalyticsRefresh,
  emitCardMoved,
  emitListMoved,
  emitListCreated,
  emitListUpdated,
  emitListDeleted,
  emitCardCreated,
  emitCardUpdated,
  emitCardArchived,
  emitCardLabelsUpdated,
  emitCardMembersUpdated,
  emitCommentCreated,
} from "@/lib/realtime/server";
import { notifyCardAssigned, notifyCommentOnCard } from "@/lib/notification";
import {
  createListSchema,
  updateListSchema,
  deleteListSchema,
  reorderListSchema,
  createCardSchema,
  archiveCardSchema,
  reorderCardSchema,
  moveCardSchema,
  updateCardDetailsSchema,
  createCommentSchema,
  assignCardMemberSchema,
  removeCardMemberSchema,
  uploadAttachmentSchema,
  updateListIsDoneSchema,
  updateCardEstimateSchema,
  updateCardDueDateSchema,
  createLabelSchema,
  updateLabelSchema,
  deleteLabelSchema,
  addCardLabelSchema,
  removeCardLabelSchema,
} from "@/lib/schemas";
import {
  buildCardArchivedEvent,
  buildCardCompletedEvent,
  buildCardCreatedEvent,
    buildCardDeletedEvent,
    buildCardMemberAssignedEvent,
    buildCardMemberUnassignedEvent,
    buildCardMoveLifecycleEvents,
    buildDueDateChangedEvent,
    buildDueDateClearedEvent,
    buildDueDateSetEvent,
  buildEstimateChangedEvent,
  buildEstimateSetEvent,
  recordCardHistoryEvents,
} from "@/lib/card-history";
import { validateFileForUpload, uploadToCloudinary } from "@/lib/cloudinary";

const CARD_POSITION_GAP = 16384;
const MAX_REORDER_CARD_RETRIES = 3;

function toIsoOrNull(date: Date | null | undefined): string | null {
  return date?.toISOString() ?? null;
}

async function getMemberIdsForCard(
  tx: Prisma.TransactionClient,
  cardId: string,
): Promise<string[]> {
  const members = await tx.cardMember.findMany({
    where: { cardId },
    select: { userId: true },
    orderBy: { assignedAt: "asc" },
  });

  return members.map((member) => member.userId);
}

async function resolveCardPositionForTx(
  tx: Prisma.TransactionClient,
  data: {
    targetListId: string;
    prevCardId?: string | null;
    nextCardId?: string | null;
  },
): Promise<number> {
  const [prevCard, nextCard] = await Promise.all([
    data.prevCardId
      ? tx.card.findUnique({
          where: { id: data.prevCardId, archivedAt: null },
          select: { id: true, listId: true, position: true },
        })
      : null,
    data.nextCardId
      ? tx.card.findUnique({
          where: { id: data.nextCardId, archivedAt: null },
          select: { id: true, listId: true, position: true },
        })
      : null,
  ]);

  if (data.prevCardId && (!prevCard || prevCard.listId !== data.targetListId)) {
    throw new Error("Invalid prevCardId");
  }

  if (data.nextCardId && (!nextCard || nextCard.listId !== data.targetListId)) {
    throw new Error("Invalid nextCardId");
  }

  if (prevCard && nextCard) {
    const lower = Math.min(prevCard.position, nextCard.position);
    const upper = Math.max(prevCard.position, nextCard.position);
    return (lower + upper) / 2;
  }

  if (prevCard) {
    return prevCard.position + CARD_POSITION_GAP;
  }

  if (nextCard) {
    return nextCard.position - CARD_POSITION_GAP;
  }

  const lastCard = await tx.card.findFirst({
    where: {
      listId: data.targetListId,
      archivedAt: null,
    },
    orderBy: [{ position: "desc" }, { createdAt: "desc" }],
    select: { position: true },
  });

  return lastCard ? lastCard.position + CARD_POSITION_GAP : CARD_POSITION_GAP;
}

async function normalizeCardPositionsForTx(
  tx: Prisma.TransactionClient,
  listId: string,
): Promise<void> {
  const cards = await tx.card.findMany({
    where: { listId, archivedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  await Promise.all(
    cards.map((card, index) =>
      tx.card.update({
        where: { id: card.id },
        data: { position: CARD_POSITION_GAP * (index + 1) },
      }),
    ),
  );
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

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

type UpdateListIsDoneResult =
  | { success: true }
  | { success: false; error: string };

type UpdateCardEstimateResult =
  | { success: true }
  | { success: false; error: string };

type UpdateCardDueDateResult =
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

  const { boardId, title, isDone } = parsed.data;

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
    const list = await createList({ boardId, title, isDone });
    revalidatePath(`/boards/${boardId}`);
    emitListCreated(list.boardId, {
      list: {
        id: list.id,
        title: list.title,
        boardId: list.boardId,
        isDone: list.isDone,
        position: list.position,
      },
    });
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
    emitListUpdated(result.list.boardId, { listId, title });
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update list. Please try again." };
  }
}

export async function updateListIsDoneAction(
  formData: FormData,
): Promise<UpdateListIsDoneResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = updateListIsDoneSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  await verifySession();

  const { listId, isDone } = parsed.data;

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
    await updateListIsDone(listId, isDone);
    revalidatePath(`/boards/${result.list.boardId}`);
    emitListUpdated(result.list.boardId, { listId, isDone });
    emitAnalyticsRefresh(result.board.workspaceId);
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

  const { userId } = await verifySession();

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
    await db.$transaction(async (tx) => {
      const cards = await tx.card.findMany({
        where: { listId },
        select: {
          id: true,
          estimateHours: true,
          dueDate: true,
          completedAt: true,
          archivedAt: true,
          members: {
            select: { userId: true },
            orderBy: { assignedAt: "asc" },
          },
        },
      });
      await recordCardHistoryEvents(
        tx,
        cards.map((card) =>
          buildCardDeletedEvent(
            result.board.workspaceId,
            result.board.id,
            card.id,
            {
              memberIds: card.members.map((member) => member.userId),
              estimateHours: card.estimateHours,
              dueDate: toIsoOrNull(card.dueDate),
              completedAt: toIsoOrNull(card.completedAt),
              archivedAt: toIsoOrNull(card.archivedAt),
            },
            userId,
          ),
        ),
      );
      await tx.list.delete({
        where: { id: listId },
      });
    });
    revalidatePath(`/boards/${result.list.boardId}`);
    emitListDeleted(result.list.boardId, { listId });
    emitAnalyticsRefresh(result.board.workspaceId);
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
    const card = await db.$transaction(async (tx) => {
      const lastCard = await tx.card.findFirst({
        where: {
          listId,
          archivedAt: null,
        },
        orderBy: [{ position: "desc" }, { createdAt: "desc" }],
        select: { position: true },
      });
      const position = lastCard
        ? lastCard.position + CARD_POSITION_GAP
        : CARD_POSITION_GAP;
      const completedAt = result.list.isDone ? new Date() : null;
      const createdCard = await tx.card.create({
        data: {
          listId,
          title,
          createdById: userId,
          position,
          completedAt,
        },
        select: {
          id: true,
          listId: true,
          title: true,
          position: true,
          estimateHours: true,
          dueDate: true,
          archivedAt: true,
          deletedAt: true,
        },
      });
      const memberIds = await getMemberIdsForCard(tx, createdCard.id);
      const events = [
        buildCardCreatedEvent(
          result.board.workspaceId,
          result.board.id,
          createdCard.id,
          {
            listId: result.list.id,
            listIsDone: result.list.isDone,
            estimateHours: createdCard.estimateHours,
            dueDate: toIsoOrNull(createdCard.dueDate),
            memberIds,
            archivedAt: toIsoOrNull(createdCard.archivedAt),
            deletedAt: toIsoOrNull(createdCard.deletedAt),
          },
          userId,
        ),
      ];

      if (result.list.isDone) {
        events.push(
          buildCardCompletedEvent(
            result.board.workspaceId,
            result.board.id,
            createdCard.id,
            {
              listId: result.list.id,
              estimateHours: createdCard.estimateHours,
              dueDate: toIsoOrNull(createdCard.dueDate),
              memberIds,
              firstCompletion: true,
            },
            userId,
          ),
        );
      }

      await recordCardHistoryEvents(tx, events);
      return createdCard;
    });

    revalidatePath(`/boards/${result.list.boardId}`);
    emitCardCreated(result.list.boardId, {
      card: {
        id: card.id,
        listId: card.listId,
        title: card.title,
        position: card.position,
      },
    });
    emitAnalyticsRefresh(result.board.workspaceId);
    return { success: true, cardId: card.id };
  } catch {
    return { success: false, error: "Failed to create card. Please try again." };
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

  const { userId } = await verifySession();

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
    await db.$transaction(async (tx) => {
      const card = await tx.card.update({
        where: {
          id: cardId,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
        select: {
          id: true,
          estimateHours: true,
          dueDate: true,
          members: {
            select: { userId: true },
            orderBy: { assignedAt: "asc" },
          },
        },
      });
      await recordCardHistoryEvents(tx, [
        buildCardArchivedEvent(
          result.board.workspaceId,
          result.board.id,
          card.id,
          {
            memberIds: card.members.map((member) => member.userId),
            estimateHours: card.estimateHours,
            dueDate: toIsoOrNull(card.dueDate),
          },
          userId,
        ),
      ]);
    });
    revalidatePath(`/boards/${result.list.boardId}`);
    emitCardArchived(result.list.boardId, { cardId });
    emitAnalyticsRefresh(result.board.workspaceId);
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
    const updatedList = await reorderListByNeighbors({
      listId,
      prevListId: prevListId ?? null,
      nextListId: nextListId ?? null,
    });
    // No revalidatePath for pure reorder (decision 0008): the actor already
    // committed the move optimistically, and the list:moved emit below carries
    // the canonical position to every client (the actor included). Revalidating
    // here only forced a redundant full-board reseed on the actor.
    emitListMoved(result.list.boardId, {
      listId: updatedList.id,
      position: updatedList.position,
    });
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
    const reorderedCard = await reorderCardWithinListByNeighbors({
      cardId,
      prevCardId: prevCardId ?? null,
      nextCardId: nextCardId ?? null,
    });

    // No revalidatePath for pure reorder (decision 0008): the actor committed
    // optimistically and the card:moved emit carries the canonical position to
    // all clients. Revalidating only forced a redundant full-board reseed.
    emitCardMoved(result.list.boardId, {
      cardId: reorderedCard.id,
      listId: reorderedCard.listId,
      position: reorderedCard.position,
    });

    return { success: true };
  } catch {
    return { success: false, error: "Failed to reorder card. Please try again." };
  }
}

export async function updateCardEstimateAction(
  formData: FormData,
): Promise<UpdateCardEstimateResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = updateCardEstimateSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId } = await verifySession();
  const { cardId, estimateHours } = parsed.data;

  const snapshot = await getCardWithListAndMembers(cardId);
  if (!snapshot) {
    return { success: false, error: "Card not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(snapshot.board.workspaceId, {
    card: ["update"],
  });

  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  if (snapshot.card.completedAt) {
    return { success: false, error: "Estimate cannot be changed after first completion" };
  }

  try {
    if (estimateHours !== snapshot.card.estimateHours) {
      await db.$transaction(async (tx) => {
        await tx.card.update({
          where: {
            id: cardId,
            archivedAt: null,
          },
          data: { estimateHours: estimateHours ?? null },
        });
        const metadata = {
          previousEstimateHours: snapshot.card.estimateHours,
          nextEstimateHours: estimateHours ?? null,
          memberIds: snapshot.memberIds,
        };

        const event = snapshot.card.estimateHours == null
          ? buildEstimateSetEvent(
              snapshot.board.workspaceId,
              snapshot.board.id,
              snapshot.card.id,
              metadata,
              userId,
            )
          : buildEstimateChangedEvent(
              snapshot.board.workspaceId,
              snapshot.board.id,
              snapshot.card.id,
              metadata,
              userId,
            );

        await recordCardHistoryEvents(tx, [event]);
      });
    } else {
      await db.card.update({
        where: {
          id: cardId,
          archivedAt: null,
        },
        data: { estimateHours: estimateHours ?? null },
      });
    }

    revalidatePath(`/boards/${snapshot.board.id}`);
    emitAnalyticsRefresh(snapshot.board.workspaceId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update estimate. Please try again." };
  }
}

export async function updateCardDueDateAction(
  formData: FormData,
): Promise<UpdateCardDueDateResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = updateCardDueDateSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId } = await verifySession();
  const { cardId, dueDate } = parsed.data;

  const snapshot = await getCardWithListAndMembers(cardId);
  if (!snapshot) {
    return { success: false, error: "Card not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(snapshot.board.workspaceId, {
    card: ["update"],
  });

  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  const previousDueDate = snapshot.card.dueDate;
  const nextDueDate = dueDate ?? null;

  try {
    const previousIso = previousDueDate?.toISOString() ?? null;
    const nextIso = nextDueDate?.toISOString() ?? null;

    if (previousIso !== nextIso) {
      await db.$transaction(async (tx) => {
        await tx.card.update({
          where: {
            id: cardId,
            archivedAt: null,
          },
          data: { dueDate: nextDueDate },
        });
        const metadata = {
          previousDueDate: previousIso,
          nextDueDate: nextIso,
          memberIds: snapshot.memberIds,
        };

        let event;
        if (previousDueDate == null && nextDueDate != null) {
          event = buildDueDateSetEvent(
            snapshot.board.workspaceId,
            snapshot.board.id,
            snapshot.card.id,
            metadata,
            userId,
          );
        } else if (previousDueDate != null && nextDueDate == null) {
          event = buildDueDateClearedEvent(
            snapshot.board.workspaceId,
            snapshot.board.id,
            snapshot.card.id,
            metadata,
            userId,
          );
        } else {
          event = buildDueDateChangedEvent(
            snapshot.board.workspaceId,
            snapshot.board.id,
            snapshot.card.id,
            metadata,
            userId,
          );
        }

        await recordCardHistoryEvents(tx, [event]);
      });
    } else {
      await db.card.update({
        where: {
          id: cardId,
          archivedAt: null,
        },
        data: { dueDate: nextDueDate },
      });
    }

    revalidatePath(`/boards/${snapshot.board.id}`);
    emitAnalyticsRefresh(snapshot.board.workspaceId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update due date. Please try again." };
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

  const { userId } = await verifySession();

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

  const snapshot = await getCardWithListAndMembers(cardId);
  if (!snapshot) {
    return { success: false, error: "Card not found" };
  }

  const workspaceSettings = await db.workspace.findUnique({
    where: { id: cardResult.board.workspaceId },
    select: { requireEstimateBeforeDone: true },
  });
  const movesIntoDone = !snapshot.list.isDone && targetListResult.list.isDone;
  if (
    movesIntoDone &&
    workspaceSettings?.requireEstimateBeforeDone &&
    snapshot.card.estimateHours == null
  ) {
    return {
      success: false,
      error: "Set an estimate before moving this card to a done list",
    };
  }

  try {
    let movedCard: { id: string; listId: string; position: number } | null = null;

    for (let attempt = 0; attempt < MAX_REORDER_CARD_RETRIES; attempt += 1) {
      try {
        movedCard = await db.$transaction(async (tx) => {
          const nextPosition = await resolveCardPositionForTx(tx, {
            targetListId,
            prevCardId: prevCardId ?? null,
            nextCardId: nextCardId ?? null,
          });
          const movesOutOfDone = snapshot.list.isDone && !targetListResult.list.isDone;
          const nextCompletedAt = movesIntoDone
            ? (snapshot.card.completedAt ?? new Date())
            : movesOutOfDone
              ? null
              : snapshot.card.completedAt;
          const updatedCard = await tx.card.update({
            where: {
              id: cardId,
              archivedAt: null,
            },
            data: {
              listId: targetListId,
              position: nextPosition,
              completedAt: nextCompletedAt,
            },
            select: {
              id: true,
              listId: true,
              position: true,
              estimateHours: true,
              dueDate: true,
              completedAt: true,
            },
            });
            const memberIds = await getMemberIdsForCard(tx, cardId);
            const events = buildCardMoveLifecycleEvents({
              workspaceId: cardResult.board.workspaceId,
              boardId: cardResult.board.id,
              cardId,
              actorId: userId,
              fromListId: snapshot.list.id,
              toListId: targetListResult.list.id,
              fromListIsDone: snapshot.list.isDone,
              toListIsDone: targetListResult.list.isDone,
              estimateHours: updatedCard.estimateHours,
              dueDate: toIsoOrNull(updatedCard.dueDate),
              memberIds,
              completedAtBeforeMove: snapshot.card.completedAt,
            });

            await recordCardHistoryEvents(tx, events);
            return updatedCard;
        });
        break;
      } catch (error) {
        if (!isUniqueConstraintError(error) || attempt === MAX_REORDER_CARD_RETRIES - 1) {
          throw error;
        }

        await db.$transaction(async (tx) => {
          await normalizeCardPositionsForTx(tx, targetListId);
        });
      }
    }

    if (!movedCard) {
      throw new Error("Failed to move card after retries");
    }

    // No revalidatePath for cross-list move (decision 0008): the actor committed
    // optimistically and the card:moved emit carries the canonical position to
    // all clients. Revalidating only forced a redundant full-board reseed. The
    // analytics refresh emit below is unrelated and stays.
    emitCardMoved(cardResult.list.boardId, {
      cardId: movedCard.id,
      listId: movedCard.listId,
      position: movedCard.position,
    });

    emitAnalyticsRefresh(cardResult.board.workspaceId);
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
    // Board view shows only the title; description is detail-modal-only (out of
    // realtime scope), so the card:updated payload carries just the title.
    emitCardUpdated(result.list.boardId, { cardId, title });
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
    const activity = await createActivityEntry({
      workspaceId: result.board.workspaceId,
      boardId: result.list.boardId,
      cardId,
      userId,
      action: "COMMENTED",
      entityType: "COMMENT",
      metadata: { commentId: comment.id },
    });

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, image: true },
    });

    emitCommentCreated(result.list.boardId, {
      cardId,
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt?.toISOString() ?? null,
        author: {
          id: userId,
          name: user?.name ?? "Unknown",
          image: user?.image ?? null,
        },
      },
      activity: {
        id: activity.id,
        type: activity.action,
        createdAt: activity.createdAt.toISOString(),
        user: {
          id: userId,
          name: user?.name ?? "Unknown",
          image: user?.image ?? null,
        },
      },
    });

    // Best-effort notification fan-out for comment
    try {
      const boardForTitle = await db.board.findUnique({
        where: { id: result.list.boardId },
        select: { title: true },
      });
      await notifyCommentOnCard({
        cardId,
        cardTitle: result.card.title,
        boardId: result.list.boardId,
        boardTitle: boardForTitle?.title ?? "Untitled board",
        commenterUserId: userId,
        commenterName: user?.name ?? "Unknown",
      });
    } catch (notificationError) {
      console.error("Failed to send comment notifications:", notificationError);
    }

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
    const assignment = await db.$transaction(async (tx) => {
      const existing = await tx.cardMember.findUnique({
        where: {
          cardId_userId: {
            cardId,
            userId,
          },
        },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              email: true,
            },
          },
        },
      });

      if (existing) {
        return {
          changed: false,
          member: {
            id: existing.user.id,
            name: existing.user.name,
            image: existing.user.image,
            email: existing.user.email,
          },
        };
      }

      const result = await tx.cardMember.create({
        data: {
          cardId,
          userId,
        },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              email: true,
            },
          },
        },
      });
      const memberIds = await getMemberIdsForCard(tx, cardId);

      await tx.activity.create({
        data: {
          workspaceId: cardResult.board.workspaceId,
          boardId: cardResult.board.id,
          cardId,
          userId: actorUserId,
          action: "CREATED",
          entityType: "MEMBER",
          metadata: {
            actionType: "assign-member",
            targetUserId: userId,
            targetUserName: result.user.name,
          },
        },
      });
      await recordCardHistoryEvents(tx, [
        buildCardMemberAssignedEvent(
          cardResult.board.workspaceId,
          cardResult.board.id,
          cardId,
          {
            targetUserId: userId,
            memberIds,
          },
          actorUserId,
        ),
      ]);

      return {
        changed: true,
        member: {
          id: result.user.id,
          name: result.user.name,
          image: result.user.image,
          email: result.user.email,
        },
      };
    }).catch(async (error) => {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await db.cardMember.findUnique({
        where: {
          cardId_userId: {
            cardId,
            userId,
          },
        },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              email: true,
            },
          },
        },
      });

      if (!existing) {
        throw error;
      }

      return {
        changed: false,
        member: {
          id: existing.user.id,
          name: existing.user.name,
          image: existing.user.image,
          email: existing.user.email,
        },
      };
    });

    if (assignment.changed) {
      // Best-effort notification for assigned user
      try {
        const boardForTitle = await db.board.findUnique({
          where: { id: cardResult.board.id },
          select: { title: true },
        });
        const actorForName = await db.user.findUnique({
          where: { id: actorUserId },
          select: { name: true },
        });
        await notifyCardAssigned({
          recipientUserId: userId,
          actorUserId,
          cardId,
          cardTitle: cardResult.card.title,
          boardId: cardResult.board.id,
          boardTitle: boardForTitle?.title ?? "Untitled board",
          assignedByName: actorForName?.name ?? "Unknown",
        });
      } catch (notificationError) {
        console.error("Failed to send assignment notification:", notificationError);
      }
    }

    revalidatePath(`/boards/${cardResult.board.id}`);
    if (assignment.changed) {
      emitAnalyticsRefresh(cardResult.board.workspaceId);
      // Live-broadcast the new assignee set so any board viewer with this card's
      // detail sheet open updates without a reload (US-011). In-place / live.
      const members = await getCardMembers(cardId);
      emitCardMembersUpdated(cardResult.board.id, { cardId, members });
    }
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
    const removal = await db.$transaction(async (tx) => {
      const result = await tx.cardMember.deleteMany({
        where: {
          cardId,
          userId,
        },
      });

      if (result.count === 0) {
        return { changed: false };
      }

      const removedUser = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      const memberIds = await getMemberIdsForCard(tx, cardId);

      await tx.activity.create({
        data: {
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
        },
      });
      await recordCardHistoryEvents(tx, [
        buildCardMemberUnassignedEvent(
          cardResult.board.workspaceId,
          cardResult.board.id,
          cardId,
          {
            targetUserId: userId,
            memberIds,
          },
          actorUserId,
        ),
      ]);

      return { changed: true };
    });

    revalidatePath(`/boards/${cardResult.board.id}`);
    if (removal.changed) {
      emitAnalyticsRefresh(cardResult.board.workspaceId);
      // Live-broadcast the trimmed assignee set so an open detail sheet on
      // another client drops the member without a reload (US-011). In-place / live.
      const members = await getCardMembers(cardId);
      emitCardMembersUpdated(cardResult.board.id, { cardId, members });
    }
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

/* ── Labels ──────────────────────────────────────────────────────────────
 *
 * Board-scoped labels and their card attachments. Label-set CRUD reuses the
 * `board:["update"]` permission (managing a board's configuration);
 * attach/detach reuse `card:["update"]` (editing a card), mirroring
 * assignCardMemberAction. No dedicated `label` access-control statement — see
 * story US-005. Realtime broadcast of label changes lands in slice 2 alongside
 * card-face chips. */

type CreateLabelResult =
  | { success: true; label: LabelRecord }
  | { success: false; error: string };

type UpdateLabelResult =
  | { success: true; label: LabelRecord }
  | { success: false; error: string };

type DeleteLabelResult =
  | { success: true }
  | { success: false; error: string };

type AddCardLabelResult =
  | { success: true; changed: boolean }
  | { success: false; error: string };

type RemoveCardLabelResult =
  | { success: true; changed: boolean }
  | { success: false; error: string };

function firstFieldError(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }): string {
  return Object.values(error.flatten().fieldErrors)[0]?.[0] ?? "Validation failed";
}

/**
 * Broadcast a label-set change to every affected card on a board. A label
 * rename/recolor/delete touches the denormalized label snapshot on each card
 * carrying it, so we re-emit the existing in-place `card:labels-updated` event
 * (the same one attach/detach uses) once per affected card with its current
 * label set. O(N) in the cards carrying the label — fine at board scale, and it
 * reuses the proven live-apply reducer rather than introducing a new event type
 * (US-010). For a delete, pass the card ids captured BEFORE the row cascade and
 * call after the delete commits, so each re-read reflects the removed label.
 */
async function broadcastLabelChange(boardId: string, cardIds: string[]): Promise<void> {
  for (const cardId of cardIds) {
    const labels = await getCardLabels(cardId);
    emitCardLabelsUpdated(boardId, {
      cardId,
      labels: labels.map((label) => ({ id: label.id, name: label.name, color: label.color })),
    });
  }
}

export async function createLabelAction(
  formData: FormData,
): Promise<CreateLabelResult> {
  const parsed = createLabelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) };
  }

  await verifySession();
  const { boardId, name, color } = parsed.data;

  const board = await getBoardById(boardId);
  if (!board) {
    return { success: false, error: "Board not found" };
  }

  const canManage = await hasWorkspacePermission(board.workspaceId, {
    board: ["update"],
  });
  if (!canManage) {
    return { success: false, error: "Board not found" };
  }

  try {
    const label = await createLabel({ boardId, name, color });
    revalidatePath(`/boards/${boardId}`);
    return { success: true, label };
  } catch (error) {
    console.error("Failed to create label:", error);
    return { success: false, error: "Failed to create label. Please try again." };
  }
}

export async function updateLabelAction(
  formData: FormData,
): Promise<UpdateLabelResult> {
  const parsed = updateLabelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) };
  }

  await verifySession();
  const { labelId, name, color } = parsed.data;

  const label = await getLabelWithBoard(labelId);
  if (!label || label.board.archivedAt) {
    return { success: false, error: "Label not found" };
  }

  const canManage = await hasWorkspacePermission(label.board.workspaceId, {
    board: ["update"],
  });
  if (!canManage) {
    return { success: false, error: "Label not found" };
  }

  try {
    const updated = await updateLabel(labelId, { name, color });
    // The renamed/recolored label is still attached to the same cards; refresh
    // each card's chip snapshot live on every observer (US-010).
    const affectedCardIds = await getCardIdsWithLabel(labelId);
    await broadcastLabelChange(label.boardId, affectedCardIds);
    revalidatePath(`/boards/${label.boardId}`);
    return { success: true, label: updated };
  } catch (error) {
    console.error("Failed to update label:", error);
    return { success: false, error: "Failed to update label. Please try again." };
  }
}

export async function deleteLabelAction(
  formData: FormData,
): Promise<DeleteLabelResult> {
  const parsed = deleteLabelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) };
  }

  await verifySession();
  const { labelId } = parsed.data;

  const label = await getLabelWithBoard(labelId);
  if (!label || label.board.archivedAt) {
    return { success: false, error: "Label not found" };
  }

  const canManage = await hasWorkspacePermission(label.board.workspaceId, {
    board: ["update"],
  });
  if (!canManage) {
    return { success: false, error: "Label not found" };
  }

  try {
    // Capture affected cards BEFORE the delete — the CardLabel rows cascade away
    // with the label, so afterwards we could not learn which cards to refresh.
    const affectedCardIds = await getCardIdsWithLabel(labelId);
    await deleteLabel(labelId);
    // Each re-read now returns the card's label set minus the deleted label, so
    // the chip disappears live on every observer (US-010).
    await broadcastLabelChange(label.boardId, affectedCardIds);
    revalidatePath(`/boards/${label.boardId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete label:", error);
    return { success: false, error: "Failed to delete label. Please try again." };
  }
}

export async function addCardLabelAction(
  formData: FormData,
): Promise<AddCardLabelResult> {
  const parsed = addCardLabelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) };
  }

  await verifySession();
  const { cardId, labelId } = parsed.data;

  const cardResult = await getCardWithListAndBoard(cardId);
  if (!cardResult || cardResult.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(cardResult.board.workspaceId, {
    card: ["update"],
  });
  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  // The label must belong to the card's board (no cross-board attach).
  const label = await getLabelWithBoard(labelId);
  if (!label || label.boardId !== cardResult.list.boardId) {
    return { success: false, error: "Label not found" };
  }

  try {
    const { changed } = await addCardLabel(cardId, labelId);
    if (changed) {
      const labels = await getCardLabels(cardId);
      emitCardLabelsUpdated(cardResult.list.boardId, {
        cardId,
        labels: labels.map((label) => ({ id: label.id, name: label.name, color: label.color })),
      });
    }
    revalidatePath(`/boards/${cardResult.list.boardId}`);
    return { success: true, changed };
  } catch (error) {
    console.error("Failed to add label to card:", error);
    return { success: false, error: "Failed to add label. Please try again." };
  }
}

export async function removeCardLabelAction(
  formData: FormData,
): Promise<RemoveCardLabelResult> {
  const parsed = removeCardLabelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) };
  }

  await verifySession();
  const { cardId, labelId } = parsed.data;

  const cardResult = await getCardWithListAndBoard(cardId);
  if (!cardResult || cardResult.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(cardResult.board.workspaceId, {
    card: ["update"],
  });
  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  try {
    const { changed } = await removeCardLabel(cardId, labelId);
    if (changed) {
      const labels = await getCardLabels(cardId);
      emitCardLabelsUpdated(cardResult.list.boardId, {
        cardId,
        labels: labels.map((label) => ({ id: label.id, name: label.name, color: label.color })),
      });
    }
    revalidatePath(`/boards/${cardResult.list.boardId}`);
    return { success: true, changed };
  } catch (error) {
    console.error("Failed to remove label from card:", error);
    return { success: false, error: "Failed to remove label. Please try again." };
  }
}
