"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/app/generated/prisma/client";

import db from "@/lib/prisma";
import {
  CARD_POSITION_GAP,
  LIVE_CARD_SCOPE,
  OrderConflictError,
  lockBoardRowForUpdate,
  lockListRowsForUpdate,
  lockWorkspaceRowForUpdate,
} from "@/lib/ordering";
import { getBoardById } from "@/lib/board";
import {
  updateCardDetails,
  getCardWithListAndBoard,
  getArchivedCardWithListAndBoard,
  lockCardOrderingScopeForUpdate,
  reorderCardWithinListByNeighbors,
  moveCardInTransaction,
  getCardWithListAndMembers,
  setCardCompletion,
  type CardDetailRecord,
  updateCardCover,
  updateCardPriority,
} from "@/lib/card";
import { createComment, getCommentsByCardId, COMMENT_PAGE_SIZE } from "@/lib/comment";
import { createAttachment, getAttachmentsByCardId } from "@/lib/attachment";
import {
  type ChecklistWithItems,
  type ChecklistItemRecord,
  getChecklistWithCard,
  getChecklistItemWithCard,
  createChecklist,
  deleteChecklist,
  createChecklistItem,
  setChecklistItemCompleted,
  deleteChecklistItem,
} from "@/lib/checklist";
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
  getListWithBoard,
  getArchivedListWithBoard,
  restoreList,
  reorderListByNeighbors,
} from "@/lib/list";
import { createActivityEntry, getActivityByCardId, ACTIVITY_PAGE_SIZE } from "@/lib/activity";
import {
  type CardMemberRecord,
  getCardMembers,
} from "@/lib/card-member";
import { hasWorkspacePermission, isWorkspaceMember } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import {
  emitAnalyticsRefresh,
  emitCardMoved,
  emitListMoved,
  emitListCreated,
  emitListRestored,
  emitListUpdated,
  emitListDeleted,
  emitCardCreated,
  emitCardUpdated,
  emitCardArchived,
  emitCardLabelsUpdated,
  emitCardMembersUpdated,
  emitCardCompletionUpdated,
  emitCardMetaUpdated,
  emitCommentCreated,
} from "@/lib/realtime/server";
import { notifyCardAssigned, notifyCommentOnCard, notifyMentioned } from "@/lib/notification";
import { evaluateRules } from "@/lib/automation/evaluator";
import { RuleExecutionError } from "@/lib/automation/types";
import { fireDeferredEffects, logRuleExecutionError } from "@/lib/automation/effects";
import type { DeferredEffect } from "@/lib/automation/executor";
import {
  createListSchema,
  updateListSchema,
  archiveListSchema,
  restoreListSchema,
  permanentDeleteListSchema,
  reorderListSchema,
  createCardSchema,
  archiveCardSchema,
  restoreCardSchema,
  reorderCardSchema,
  moveCardSchema,
  updateCardDetailsSchema,
  createCommentSchema,
  assignCardMemberSchema,
  removeCardMemberSchema,
  uploadAttachmentSchema,
  toggleCardCompletionSchema,
  updateCardEstimateSchema,
  updateCardDueDateSchema,
  updateCardPrioritySchema,
  updateCardCoverSchema,
  setCardCoverSchema,
  createLabelSchema,
  updateLabelSchema,
  deleteLabelSchema,
  addCardLabelSchema,
  removeCardLabelSchema,
  createChecklistSchema,
  deleteChecklistSchema,
  createChecklistItemSchema,
  toggleChecklistItemSchema,
  deleteChecklistItemSchema,
  loadMoreCardDetailSchema,
} from "@/lib/schemas";
import {
  buildCardArchivedEvent,
  buildCardRestoredEvent,
  buildCardCompletedEvent,
  buildCardReopenedEvent,
  buildCardCreatedEvent,
  buildCardMemberAssignedEvent,
    buildCardMemberUnassignedEvent,
    buildCardMoveLifecycleEvents,
    buildDueDateChangedEvent,
    buildDueDateClearedEvent,
    buildDueDateSetEvent,
  buildCardDeletedEvent,
  buildEstimateChangedEvent,
  buildEstimateSetEvent,
  recordCardHistoryEvents,
} from "@/lib/card-history";
import { validateFileForUpload, uploadToCloudinary } from "@/lib/cloudinary";

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

export type ArchiveListResult =
  | { success: true }
  | { success: false; error: string };

export type RestoreListResult =
  | { success: true }
  | { success: false; error: string };

export type DeleteListResult = ArchiveListResult;

type CreateCardResult =
  | { success: true; cardId: string }
  | { success: false; error: string };

type ArchiveCardResult =
  | { success: true }
  | { success: false; error: string };

type RestoreCardResult =
  | { success: true }
  | { success: false; error: string; code?: RestoreCardErrorCode };

/**
 * The dedicated parent-list-archived outcome, surfaced only when the card is
 * archived under an archived parent list and the caller is authorized; every
 * other case keeps the generic not-found contract (no existence leak). Not
 * exported: "use server" modules only allow async function exports, so the
 * public contract is the runtime result shape.
 */
const PARENT_LIST_ARCHIVED_MESSAGE = "Restore the list first.";
type RestoreCardErrorCode = "PARENT_LIST_ARCHIVED";

type ReorderListResult =
  | { success: true }
  | { success: false; error: string; code?: "ORDER_CONFLICT" };

type ReorderCardResult =
  | { success: true }
  | { success: false; error: string; code?: "ORDER_CONFLICT" };

type MoveCardResult =
  | { success: true }
  | { success: false; error: string; code?: "ORDER_CONFLICT" };

type ToggleCardCompletionResult =
  | { success: true; card: CardDetailRecord }
  | { success: false; error: string };

type UpdateCardEstimateResult =
  | { success: true }
  | { success: false; error: string };

type UpdateCardDueDateResult =
  | { success: true }
  | { success: false; error: string };


type UpdateCardPriorityResult =
  | { success: true; card: CardDetailRecord }
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
    const list = await createList({ boardId, title, workspaceId: board.workspaceId });
    revalidatePath(`/boards/${boardId}`);
    emitListCreated(list.boardId, {
      list: {
        id: list.id,
        title: list.title,
        boardId: list.boardId,
        position: list.position,
        // decision 0032: a fresh list starts at revision 0; the store seeds
        // the canonical revision from this payload so later drags CAS on it.
        moveRevision: list.moveRevision,
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

export async function archiveListAction(
  formData: FormData,
): Promise<ArchiveListResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = archiveListSchema.safeParse(rawData);

  if (!parsed.success) {
    return { success: false, error: "List not found" };
  }

  await verifySession();

  const { listId } = parsed.data;

  const result = await getListWithBoard(listId);
  if (!result || result.board.archivedAt || result.list.archivedAt !== null) {
    return { success: false, error: "List not found" };
  }

  const canArchiveList = await hasWorkspacePermission(result.board.workspaceId, {
    list: ["delete"],
  });

  if (!canArchiveList) {
    return { success: false, error: "List not found" };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.list.update({
        where: { id: listId },
        data: { archivedAt: new Date() },
      });
    });
    revalidatePath(`/boards/${result.list.boardId}`);
    // US-074 Slice A: reuse list:deleted as active-board view-removal signal
    emitListDeleted(result.list.boardId, { listId });
    emitAnalyticsRefresh(result.board.workspaceId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to archive list. Please try again." };
  }
}

/** Legacy export for deleteListAction (US-074 Slice A) */
export const deleteListAction = archiveListAction;

export async function restoreListAction(
  formData: FormData,
): Promise<RestoreListResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = restoreListSchema.safeParse(rawData);

  if (!parsed.success) {
    return { success: false, error: "List not found" };
  }

  await verifySession();

  const { listId } = parsed.data;

  const result = await getArchivedListWithBoard(listId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "List not found" };
  }

  const canRestoreList = await hasWorkspacePermission(result.board.workspaceId, {
    list: ["delete"],
  });

  if (!canRestoreList) {
    return { success: false, error: "List not found" };
  }

  try {
    const restoredList = await restoreList(listId, result.board.workspaceId);
    revalidatePath(`/boards/${restoredList.boardId}`);
    emitListRestored(restoredList.boardId, {
      list: {
        id: restoredList.id,
        title: restoredList.title,
        boardId: restoredList.boardId,
        position: restoredList.position,
        // decision 0032: restore is an ordering write; carry the bumped
        // revision so observers seed the canonical value (never the stale
        // pre-archive one).
        moveRevision: restoredList.moveRevision,
      },
    });
    emitAnalyticsRefresh(result.board.workspaceId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to restore list. Please try again." };
  }
}

export type PermanentDeleteListResult =
  | { success: true }
  | { success: false; error: string };

const LIST_TITLE_MISMATCH = "Title confirmation does not match";
const CLOUDINARY_BLOCK =
  "Cannot permanently delete this list: it contains attachments stored in Cloudinary. Contact your workspace admin to resolve this.";
const LIVE_CARDS_BLOCK =
  "This list contains active cards. Use force delete to permanently delete them as well.";
const CONCURRENT_RESTORE =
  "This list was restored while processing. Please try again.";

export async function permanentlyDeleteListAction(
  formData: FormData,
): Promise<PermanentDeleteListResult> {
  // verifySession is the very first operation: rejects unauthenticated callers
  // before any schema parsing, DB reads, or writes (governing invariant).
  const { userId } = await verifySession();

  const rawData = Object.fromEntries(formData);
  const parsed = permanentDeleteListSchema.safeParse(rawData);

  if (!parsed.success) {
    return { success: false, error: "List not found" };
  }

  const { listId, confirmationText, force } = parsed.data;

  const result = await getArchivedListWithBoard(listId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "List not found" };
  }

  const canPermanentDelete = await hasWorkspacePermission(
    result.board.workspaceId,
    { organization: ["update"] },
  );

  if (!canPermanentDelete) {
    return { success: false, error: "List not found" };
  }

  if (confirmationText !== result.list.title) {
    return { success: false, error: LIST_TITLE_MISMATCH };
  }

  try {
    await db.$transaction(async (tx) => {
      // Acquire row lock on the list and revalidate archived status under the
      // lock (US-074, in-flight purge race fix).
      const locked = await tx.$queryRaw<
        Array<{ id: string; archivedAt: Date | null }>
      >`SELECT id, "archivedAt" FROM "list" WHERE id = ${listId} FOR UPDATE`;

      if (locked.length === 0 || locked[0].archivedAt === null) {
        throw new Error("CONCURRENT_RESTORE");
      }

      // Cloudinary attachment guard under the lock (decision 0029).
      const cloudinaryAttachment = await tx.attachment.findFirst({
        where: {
          card: { listId },
          cloudinaryPublicId: { not: null },
        },
        select: { id: true },
      });

      if (cloudinaryAttachment) {
        throw new Error("CLOUDINARY_BLOCK");
      }

      // Count live cards (not archived, not deleted) inside the tx
      const liveCards = await tx.card.count({
        where: {
          listId,
          archivedAt: null,
          deletedAt: null,
        },
      });

      if (liveCards > 0 && !force) {
        throw new Error("LIVE_CARDS_EXIST");
      }

      // Snapshot every cascaded card for history events
      const cards = await tx.card.findMany({
        where: { listId },
        select: {
          id: true,
          archivedAt: true,
          deletedAt: true,
          completedAt: true,
          estimateHours: true,
          dueDate: true,
          members: {
            select: { userId: true },
            orderBy: { assignedAt: "asc" },
          },
        },
      });

      // Write truthful CARD_DELETED CardHistoryEvent rows for every card
      const events = cards.map((card) =>
        buildCardDeletedEvent(
          result.board.workspaceId,
          result.list.boardId,
          card.id,
          {
            memberIds: card.members.map((m) => m.userId),
            estimateHours: card.estimateHours,
            dueDate: card.dueDate?.toISOString() ?? null,
            completedAt: card.completedAt?.toISOString() ?? null,
            archivedAt: card.archivedAt?.toISOString() ?? null,
          },
          userId,
        ),
      );

      await recordCardHistoryEvents(tx, events);

      // Conditional deleteMany under READ COMMITTED is the race guard: the
      // list must still be archived.
      const deleteResult = await tx.list.deleteMany({
        where: {
          id: listId,
          archivedAt: { not: null },
        },
      });

      // count 0 means concurrent restore: roll back all history
      if (deleteResult.count === 0) {
        throw new Error("CONCURRENT_RESTORE");
      }
    });

    revalidatePath(`/boards/${result.list.boardId}`);
    emitListDeleted(result.list.boardId, { listId });
    emitAnalyticsRefresh(result.board.workspaceId);
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message === "LIVE_CARDS_EXIST") {
      return { success: false, error: LIVE_CARDS_BLOCK };
    }
    if (error instanceof Error && error.message === "CLOUDINARY_BLOCK") {
      return { success: false, error: CLOUDINARY_BLOCK };
    }
    if (error instanceof Error && error.message === "CONCURRENT_RESTORE") {
      return { success: false, error: CONCURRENT_RESTORE };
    }
    return {
      success: false,
      error: "Failed to permanently delete list. Please try again.",
    };
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

  const { listId, title, description, dueDate, priority } = parsed.data;

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
      // Global ordering gate, then parent-to-child board → list locks. This is
      // the same protocol used by human moves and recursive automation.
      await lockWorkspaceRowForUpdate(tx, result.board.workspaceId);
      const board = await lockBoardRowForUpdate(tx, result.board.id);
      if (!board) {
        throw new Error("BOARD_NOT_FOUND");
      }
      const locked = await lockListRowsForUpdate(tx, [listId]);
      if (locked.length === 0) {
        throw new Error("LIST_NOT_FOUND");
      }
      const lastCard = await tx.card.findFirst({
        where: {
          listId,
          ...LIVE_CARD_SCOPE,
        },
        orderBy: [{ position: "desc" }, { createdAt: "desc" }],
        select: { position: true },
      });
      const position = lastCard
        ? lastCard.position + CARD_POSITION_GAP
        : CARD_POSITION_GAP;
      // A newly created card is never complete: completion is card-owned and set
      // only by the explicit toggle, never derived from the list (decision 0020).
      // US-083 W7: the quick-capture optional fields (description, due date,
      // priority) persist HERE in the same atomic create — no chained update
      // actions, no wrapper mutation.
      const createdCard = await tx.card.create({
        data: {
          listId,
          title,
          createdById: userId,
          position,
          description: description ?? null,
          dueDate: dueDate ?? null,
          priority: priority ?? null,
        },
        select: {
          id: true,
          listId: true,
          title: true,
          position: true,
          moveRevision: true,
          estimateHours: true,
          dueDate: true,
          priority: true,
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
            estimateHours: createdCard.estimateHours,
            dueDate: toIsoOrNull(createdCard.dueDate),
            memberIds,
            archivedAt: toIsoOrNull(createdCard.archivedAt),
            deletedAt: toIsoOrNull(createdCard.deletedAt),
          },
          userId,
        ),
      ];

      await recordCardHistoryEvents(tx, events);

      // Automation (US-066): evaluate rules inside the trigger tx, after the
      // history write. Rule-driven mutations share this tx and roll back with it.
      const { effects } = await evaluateRules({
        client: tx,
        workspaceId: result.board.workspaceId,
        triggerType: "card-created",
        event: { cardId: createdCard.id, boardId: result.board.id, listId },
      });
      return { card: createdCard, ruleEffects: effects };
    });

    revalidatePath(`/boards/${result.list.boardId}`);
    emitCardCreated(result.list.boardId, {
      card: {
        id: card.card.id,
        listId: card.card.listId,
        title: card.card.title,
        position: card.card.position,
        // decision 0032: a fresh card starts at revision 0; the store seeds the
        // canonical revision from this payload so later drags CAS on it.
        moveRevision: card.card.moveRevision,
        // US-083 W7 fidelity: observer clients receive due date + priority
        // for quick-captured cards (the reducer applies them; description is
        // not part of the board-card snapshot).
        dueDate: toIsoOrNull(card.card.dueDate),
        priority: card.card.priority,
      },
    });
    emitAnalyticsRefresh(result.board.workspaceId);
    await fireDeferredEffects(card.ruleEffects);
    return { success: true, cardId: card.card.id };
  } catch (error) {
    if (error instanceof RuleExecutionError) {
      // Decision 0030: only unexpected-abort errors reach here (stale-target
      // failures are isolated in-tx), so the message is accurate for that class.
      await logRuleExecutionError(error);
      return {
        success: false,
        error: `Automation rule "${error.context.ruleName}" hit an unexpected error; no changes were applied.`,
      };
    }
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

export async function restoreCardAction(
  formData: FormData,
): Promise<RestoreCardResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = restoreCardSchema.safeParse(rawData);

  if (!parsed.success) {
    return { success: false, error: "Card not found" };
  }

  const { userId } = await verifySession();

  const { cardId } = parsed.data;

  // Archived-aware resolver (the normal one filters archivedAt:null) flags
  // rather than nulls the parent-list-archived case so the action can gate it.
  const result = await getArchivedCardWithListAndBoard(cardId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  const canRestoreCard = await hasWorkspacePermission(result.board.workspaceId, {
    card: ["delete"],
  });

  if (!canRestoreCard) {
    return { success: false, error: "Card not found" };
  }

  // US-083 W8: this outcome is reached only after existence/archive/authorization
  // checks pass (no existence leak); the in-tx FOR UPDATE revalidation below
  // re-checks the same condition against the race (list archived in between).
  if (result.parentListArchived) {
    return {
      success: false,
      error: PARENT_LIST_ARCHIVED_MESSAGE,
      code: "PARENT_LIST_ARCHIVED",
    };
  }

  try {
    const restoredCard = await db.$transaction(async (tx) => {
      // US-083 W8 race guard: the parent list may be archived between the
      // pre-read and this tx — lock it and revalidate archivedAt under the lock
      // so a restore can never commit a live card into an archived (invisible)
      // list.
      // Global ordering gate, then parent-to-child board → list → card locks.
      await lockWorkspaceRowForUpdate(tx, result.board.workspaceId);
      const board = await lockBoardRowForUpdate(tx, result.board.id);
      if (!board) {
        throw new Error("RESTORE_TARGET_GONE");
      }
      const locked = await tx.$queryRaw<
        Array<{ id: string; archivedAt: Date | null }>
      >`SELECT id, "archivedAt" FROM "list" WHERE id = ${result.list.id} FOR UPDATE`;

      if (locked.length === 0) {
        // Parent list permanently deleted between pre-read and tx: the card
        // cascade-deleted with it. Generic failure — no existence leak.
        throw new Error("RESTORE_TARGET_GONE");
      }
      if (locked[0].archivedAt !== null) {
        throw new Error("PARENT_LIST_ARCHIVED");
      }

      // Parent-to-child (decision 0032): the archived card is invisible to the
      // live lock helper, so lock it directly and re-verify it is still archived
      // under the lock (a concurrent restore CASes on the same where-clause).
      const cardLocked = await tx.$queryRaw<
        Array<{ id: string; listId: string; archivedAt: Date | null }>
      >`SELECT id, "listId", "archivedAt" FROM "card" WHERE id = ${cardId} AND "deletedAt" IS NULL FOR UPDATE`;

      if (cardLocked.length === 0 || cardLocked[0].archivedAt === null) {
        // Card gone, or a concurrent restore already committed it — no write.
        throw new Error("RESTORE_TARGET_GONE");
      }

      // Place the restored card at the END of the live scope under the lock:
      // its pre-archive slot may have been taken by a live card, and the
      // partial unique index would otherwise reject the restore with a P2002.
      const lastCard = await tx.card.findFirst({
        where: { listId: result.list.id, ...LIVE_CARD_SCOPE },
        orderBy: [{ position: "desc" }, { createdAt: "desc" }],
        select: { position: true },
      });
      const position = lastCard
        ? lastCard.position + CARD_POSITION_GAP
        : CARD_POSITION_GAP;

      const card = await tx.card.update({
        where: {
          id: cardId,
          archivedAt: { not: null },
        },
        data: {
          archivedAt: null,
          position,
          // decision 0032: restore is an ordering write — bump the revision so
          // any client that saw the archived card's old revision can never CAS
          // a stale reorder onto the restored incarnation.
          moveRevision: { increment: 1 },
        },
        select: {
          id: true,
          listId: true,
          title: true,
          position: true,
          moveRevision: true,
          estimateHours: true,
          dueDate: true,
          priority: true,
          archivedAt: true,
          deletedAt: true,
          members: {
            select: { userId: true },
            orderBy: { assignedAt: "asc" },
          },
        },
      });
      await recordCardHistoryEvents(tx, [
        buildCardRestoredEvent(
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
      return card;
    });
    revalidatePath(`/boards/${result.list.boardId}`);
    // Reappears via the tested card:created reducer; the payload carries the
    // canonical position + bumped revision (decision 0032) and due date/priority
    // (US-083 W7) so restored cards keep their meta.
    emitCardCreated(result.list.boardId, {
      card: {
        id: restoredCard.id,
        listId: restoredCard.listId,
        title: restoredCard.title,
        position: restoredCard.position,
        moveRevision: restoredCard.moveRevision,
        dueDate: toIsoOrNull(restoredCard.dueDate),
        priority: restoredCard.priority,
      },
    });
    emitAnalyticsRefresh(result.board.workspaceId);
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message === "PARENT_LIST_ARCHIVED") {
      return {
        success: false,
        error: PARENT_LIST_ARCHIVED_MESSAGE,
        code: "PARENT_LIST_ARCHIVED",
      };
    }
    return { success: false, error: "Failed to restore card. Please try again." };
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

  const { listId, prevListId, nextListId, intent, expectedMoveRevision } = parsed.data;

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
      workspaceId: result.board.workspaceId,
      intent,
      prevListId: prevListId ?? null,
      nextListId: nextListId ?? null,
      expectedMoveRevision,
    });
    // No revalidatePath for pure reorder (decision 0008): the actor committed
    // optimistically and the list:moved emit carries the canonical position;
    // revalidating would only force a redundant full-board reseed.
    emitListMoved(result.list.boardId, {
      listId: updatedList.id,
      position: updatedList.position,
      moveRevision: updatedList.moveRevision,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof OrderConflictError) {
      return {
        success: false,
        code: "ORDER_CONFLICT",
        error: "List was reordered by someone else. Refreshing…",
      };
    }
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

  const { cardId, prevCardId, nextCardId, intent, expectedMoveRevision } = parsed.data;

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
      workspaceId: result.board.workspaceId,
      intent,
      prevCardId: prevCardId ?? null,
      nextCardId: nextCardId ?? null,
      expectedMoveRevision,
    });

    // No revalidatePath for pure reorder (decision 0008): the actor committed
    // optimistically and the card:moved emit carries the canonical position;
    // revalidating would only force a redundant full-board reseed.
    emitCardMoved(result.list.boardId, {
      cardId: reorderedCard.id,
      listId: reorderedCard.listId,
      position: reorderedCard.position,
      moveRevision: reorderedCard.moveRevision,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof OrderConflictError) {
      return {
        success: false,
        code: "ORDER_CONFLICT",
        error: "Card was moved by someone else. Refreshing…",
      };
    }
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

  // No estimate lock (decision 0020): the estimate stays editable through
  // complete/reopen cycles; analytics is event-sourced, so the live field freeze
  // guarded nothing analytics trusted.

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
    emitCardMetaUpdated(snapshot.board.id, {
      cardId,
      fields: { estimateHours: estimateHours ?? null },
    });
    emitAnalyticsRefresh(snapshot.board.workspaceId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update estimate. Please try again." };
  }
}

export async function toggleCardCompletionAction(
  formData: FormData,
): Promise<ToggleCardCompletionResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = toggleCardCompletionSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId } = await verifySession();
  const { cardId, complete } = parsed.data;

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

  const previousCompletedAt = snapshot.card.completedAt;
  // A no-op toggle (already in the requested state) still returns success but
  // writes no history event and re-emits the current state.
  const isTransition = complete !== (previousCompletedAt !== null);

  // requireEstimateBeforeDone gate (kept — decision 0020): block only a genuine
  // complete transition, surfaced inline (not a silent no-op).
  if (complete && isTransition) {
    const workspaceSettings = await db.workspace.findUnique({
      where: { id: snapshot.board.workspaceId },
      select: { requireEstimateBeforeDone: true },
    });
    if (
      workspaceSettings?.requireEstimateBeforeDone &&
      snapshot.card.estimateHours == null
    ) {
      return {
        success: false,
        error: "Set an estimate before marking this card complete",
      };
    }
  }

  let ruleEffects: DeferredEffect[] = [];
  try {
    const card = await db.$transaction(async (tx) => {
      // Acquire the same workspace → board → list → card lock scope as
      // moveCardInTransaction before the card CAS (completion can trigger
      // recursive move automation; prevents card → workspace inversion).
      await lockCardOrderingScopeForUpdate(tx, snapshot.board.workspaceId, cardId);

      const { card: updated, transitioned } = await setCardCompletion(
        tx,
        cardId,
        complete,
        previousCompletedAt,
      );

      // Record an event only on an actual transition: `transitioned` is the
      // authoritative in-tx CAS result, so a concurrent double-toggle records at
      // most one event.
      if (transitioned) {
        const event = complete
          ? buildCardCompletedEvent(
              snapshot.board.workspaceId,
              snapshot.board.id,
              cardId,
              {
                listId: snapshot.list.id,
                estimateHours: updated.estimateHours,
                dueDate: toIsoOrNull(updated.dueDate),
                memberIds: snapshot.memberIds,
                // Streak-start marker; vestigial under the current-streak anchor
                // (US-064 / decision 0021).
                firstCompletion: previousCompletedAt === null,
              },
              userId,
            )
          : buildCardReopenedEvent(
              snapshot.board.workspaceId,
              snapshot.board.id,
              cardId,
              {
                listId: snapshot.list.id,
                dueDate: toIsoOrNull(updated.dueDate),
                memberIds: snapshot.memberIds,
              },
              userId,
            );
        await recordCardHistoryEvents(tx, [event]);

        // Automation (US-066): a genuine completion/reopen transition fires the
        // matching trigger inside this tx; rule effects roll back with it.
        const { effects } = await evaluateRules({
          client: tx,
          workspaceId: snapshot.board.workspaceId,
          triggerType: complete ? "card-completed" : "card-reopened",
          event: {
            cardId,
            boardId: snapshot.board.id,
            listId: snapshot.list.id,
            completed: complete,
          },
        });
        ruleEffects = effects;
      }

      return updated;
    });

    revalidatePath(`/boards/${snapshot.list.boardId}`);
    // Dedicated in-place completion event: card:updated is title-only, and
    // completedAt (not a bare boolean) lets the receiver recompute due-status.
    // Safe mid-drag: a flag flip never reorders the list (mirrors labels/members).
    emitCardCompletionUpdated(snapshot.list.boardId, {
      cardId,
      completedAt: toIsoOrNull(card.completedAt),
    });
    emitAnalyticsRefresh(snapshot.board.workspaceId);
    await fireDeferredEffects(ruleEffects);

    return {
      success: true,
      card: {
        id: card.id,
        listId: card.listId,
        title: card.title,
        description: card.description,
        estimateHours: card.estimateHours,
        dueDate: card.dueDate,
        completedAt: card.completedAt,
        priority: card.priority,
        coverImage: card.coverImage,
        updatedAt: card.updatedAt,
      },
    };
  } catch (error) {
    if (error instanceof RuleExecutionError) {
      // Decision 0030: only UNEXPECTED errors reach here (stale-target failures
      // are isolated in-tx and the action succeeds).
      await logRuleExecutionError(error);
      return {
        success: false,
        error: `Automation rule "${error.context.ruleName}" hit an unexpected error; no changes were applied.`,
      };
    }
    return { success: false, error: "Failed to update completion. Please try again." };
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
        // HIGH-1: invalidate existing reminders so the new date gets a fresh
        // DUE_SOON and cleared dates cancel unsent reminders.
        await tx.cardReminder.deleteMany({ where: { cardId } });

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
    // F3: due date is display metadata — push it live so other clients' card
    // faces and due-status recomputes stay in sync (ISO string; store rehydrates).
    emitCardMetaUpdated(snapshot.board.id, {
      cardId,
      fields: { dueDate: nextIso },
    });
    emitAnalyticsRefresh(snapshot.board.workspaceId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update due date. Please try again." };
  }
}

export async function updateCardPriorityAction(
  formData: FormData,
): Promise<UpdateCardPriorityResult> {
  const rawData = Object.fromEntries(formData);
  const priorityValue = rawData.priority === "NONE" ? null : rawData.priority;

  const parsed = updateCardPrioritySchema.safeParse({
    cardId: rawData.cardId,
    priority: priorityValue,
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  await verifySession();
  const { cardId, priority } = parsed.data;

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
    const card = await updateCardPriority(cardId, priority);
    revalidatePath(`/boards/${result.list.boardId}`);
    // F3: priority is display metadata — push it live so other clients' card
    // faces stay in sync.
    emitCardMetaUpdated(result.list.boardId, {
      cardId,
      fields: { priority },
    });
    return { success: true, card };
  } catch {
    return { success: false, error: "Failed to update priority. Please try again." };
  }
}

type UpdateCardCoverResult =
  | { success: true; card: CardDetailRecord }
  | { success: false; error: string };

export async function updateCardCoverAction(
  formData: FormData,
): Promise<UpdateCardCoverResult> {
  const coverImage = formData.get("coverImage");
  const coverImageValue = coverImage === "" ? null : coverImage;

  const parsed = updateCardCoverSchema.safeParse({
    cardId: formData.get("cardId"),
    coverImage: coverImageValue,
  });

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  await verifySession();
  const { cardId, coverImage: parsedCoverImage } = parsed.data;

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

  // Security: a cover URL must be one of this card's own attachments — an
  // external URL would let an editor plant a tracking pixel for every board
  // viewer (US-018). Removal (null) is always allowed.
  if (parsedCoverImage !== null) {
    const attachments = await getAttachmentsByCardId(cardId);
    const isOwnAttachment = attachments.some(
      (attachment) => attachment.fileUrl === parsedCoverImage,
    );
    if (!isOwnAttachment) {
      return {
        success: false,
        error: "Cover image must be one of this card's attachments.",
      };
    }
  }

  try {
    const card = await updateCardCover(cardId, parsedCoverImage);
    revalidatePath(`/boards/${result.list.boardId}`);
    // F3: cover is display metadata — push it live so other clients' card faces
    // stay in sync.
    emitCardMetaUpdated(result.list.boardId, {
      cardId,
      fields: { coverImage: parsedCoverImage },
    });
    return { success: true, card };
  } catch {
    return { success: false, error: "Failed to update card cover. Please try again." };
  }
}

type SetCardCoverResult =
  | { success: true; card: CardDetailRecord }
  | { success: false; error: string };

export async function setCardCoverAction(
  formData: FormData,
): Promise<SetCardCoverResult> {
  const cardId = formData.get("cardId");
  const file = formData.get("file");

  if (!cardId || typeof cardId !== "string" || !file || !(file instanceof File)) {
    return { success: false, error: "Invalid request" };
  }

  const parsed = setCardCoverSchema.safeParse({ cardId, file });

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId: actorUserId } = await verifySession();

  const { cardId: parsedCardId } = parsed.data;

  const cardResult = await getCardWithListAndBoard(parsedCardId);
  if (!cardResult || cardResult.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(cardResult.board.workspaceId, {
    card: ["update"],
  });

  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

  let cloudinaryResult;
  try {
    cloudinaryResult = await uploadToCloudinary({ file });
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    return { success: false, error: "Failed to upload file to cloud storage. Please try again." };
  }

  try {
    // Lock the parent list row and revalidate it is still active before
    // inserting the attachment (US-074, in-flight upload race fix).
    const listId = cardResult.list.id;
    const result = await db.$transaction(async (tx) => {
      const list = await tx.$queryRaw<
        Array<{ id: string; archivedAt: Date | null }>
      >`SELECT id, "archivedAt" FROM "list" WHERE id = ${listId} FOR UPDATE`;

      if (list.length === 0 || list[0].archivedAt !== null) {
        throw new Error("LIST_ARCHIVED_OR_DELETED");
      }

      await createAttachment(
        {
          cardId: parsedCardId,
          userId: actorUserId,
          fileName: file.name,
          fileUrl: cloudinaryResult.secureUrl,
          fileType: file.type,
          fileSize: file.size,
          cloudinaryPublicId: cloudinaryResult.publicId,
          cloudinaryResourceType: cloudinaryResult.resourceType,
        },
        tx,
      );

      await createActivityEntry(
        {
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
        },
        tx,
      );

      const updatedCard = await updateCardCover(
        parsedCardId,
        cloudinaryResult.secureUrl,
        tx,
      );

      return updatedCard;
    });

    revalidatePath(`/boards/${cardResult.board.id}`);
    // F3: the upload set a cover — push it live so other clients' card faces
    // stay in sync.
    emitCardMetaUpdated(cardResult.board.id, {
      cardId: parsedCardId,
      fields: { coverImage: cloudinaryResult.secureUrl },
    });
    return { success: true, card: result };
  } catch (error) {
    if (error instanceof Error && error.message === "LIST_ARCHIVED_OR_DELETED") {
      // Compensate: destroy the just-uploaded Cloudinary asset
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
      return { success: false, error: "Card not found" };
    }

    console.error("Failed to set card cover:", error);
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
    return { success: false, error: "Failed to set card cover. Please try again." };
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

  const { cardId, targetListId, prevCardId, nextCardId, intent, expectedMoveRevision } = parsed.data;

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

  // A move changes only list membership + position; it never completes/reopens
  // a card and never gates on the estimate (decision 0020).
  try {
    let movedCard:
      | { id: string; listId: string; position: number; moveRevision: number; ruleEffects: DeferredEffect[] }
      | null = null;

    movedCard = await db.$transaction(async (tx) => {
      const moved = await moveCardInTransaction(tx, {
        workspaceId: cardResult.board.workspaceId,
        cardId,
        targetListId,
        intent,
        prevCardId: prevCardId ?? null,
        nextCardId: nextCardId ?? null,
        expectedMoveRevision,
      });
      const memberIds = await getMemberIdsForCard(tx, cardId);
      const events = buildCardMoveLifecycleEvents({
        workspaceId: cardResult.board.workspaceId,
        boardId: cardResult.board.id,
        cardId,
        actorId: userId,
        fromListId: moved.fromListId,
        toListId: targetListResult.list.id,
        estimateHours: moved.card.estimateHours,
        memberIds,
      });

      await recordCardHistoryEvents(tx, events);

      // Fire the move trigger only on an actual list change (a same-list reorder
      // is not a move); it runs inside this tx and rolls back with it (US-066).
      let ruleEffects: DeferredEffect[] = [];
      if (snapshot.list.id !== targetListId) {
        const res = await evaluateRules({
          client: tx,
          workspaceId: cardResult.board.workspaceId,
          triggerType: "card-moved-to-list",
          event: {
            cardId,
            boardId: cardResult.board.id,
            listIdFrom: snapshot.list.id,
            listIdTo: targetListId,
            listId: targetListId,
          },
        });
        ruleEffects = res.effects;
      }
      return { ...moved.card, ruleEffects };
    });

    if (!movedCard) {
      throw new Error("Failed to move card");
    }

    // No revalidatePath for cross-list move (decision 0008): the actor committed
    // optimistically and the card:moved emit carries the canonical position;
    // the analytics refresh emit below is unrelated and stays.
    emitCardMoved(cardResult.list.boardId, {
      cardId: movedCard.id,
      listId: movedCard.listId,
      position: movedCard.position,
      moveRevision: movedCard.moveRevision,
    });

    emitAnalyticsRefresh(cardResult.board.workspaceId);
    await fireDeferredEffects(movedCard.ruleEffects);
    return { success: true };
  } catch (error) {
    if (error instanceof OrderConflictError) {
      // decision 0032: stale OCC anchor or vanished placement scope. No write
      // happened; the client rolls back its optimistic commit and resyncs
      // canonical state via router.refresh().
      return {
        success: false,
        code: "ORDER_CONFLICT",
        error: "Card was moved by someone else. Refreshing…",
      };
    }
    if (error instanceof RuleExecutionError) {
      // Decision 0030: only UNEXPECTED errors reach here (stale-target failures
      // are isolated in-tx and the action succeeds).
      await logRuleExecutionError(error);
      return {
        success: false,
        error: `Automation rule "${error.context.ruleName}" hit an unexpected error; no changes were applied.`,
      };
    }
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
      await notifyMentioned({
        content,
        cardId,
        cardTitle: result.card.title,
        boardId: result.list.boardId,
        boardTitle: boardForTitle?.title ?? "Untitled board",
        commenterUserId: userId,
        commenterName: user?.name ?? "Unknown",
        workspaceId: result.board.workspaceId,
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

/** A comment row returned by loadMoreCardDetailAction (sheet UI shape). */
export type LoadMoreCommentItem = {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    image: string | null;
  };
};

/** An activity row returned by loadMoreCardDetailAction (sheet UI shape). */
export type LoadMoreActivityItem = {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    image: string | null;
  };
  metadata: Record<string, unknown> | null;
};

export type LoadMoreCardDetailResult =
  | {
      success: true;
      section: "comments";
      items: LoadMoreCommentItem[];
      hasMore: boolean;
    }
  | {
      success: true;
      section: "activity";
      items: LoadMoreActivityItem[];
      hasMore: boolean;
    }
  | { success: false; error: string };

/**
 * Cursor-paginated fetch of the next comments/activity page for a card detail
 * sheet (page size 50). The cursor is the last loaded entry's (createdAt, id);
 * `hasMore` drives the "Load more" affordance. Open to any workspace member —
 * membership is the read gate, and a non-member gets the same not-found
 * posture as a missing card.
 */
export async function loadMoreCardDetailAction(
  formData: FormData,
): Promise<LoadMoreCardDetailResult> {
  const rawData = Object.fromEntries(formData);
  const parsed = loadMoreCardDetailSchema.safeParse(rawData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError || "Validation failed" };
  }

  const { userId } = await verifySession();

  const { cardId, section, cursorCreatedAt, cursorId } = parsed.data;

  const result = await getCardWithListAndBoard(cardId);
  if (!result || result.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  if (!(await isWorkspaceMember(userId, result.board.workspaceId))) {
    return { success: false, error: "Card not found" };
  }

  const cursor =
    cursorCreatedAt && cursorId
      ? { createdAt: cursorCreatedAt, id: cursorId }
      : undefined;

  if (section === "comments") {
    const page = await getCommentsByCardId(cardId, {
      limit: COMMENT_PAGE_SIZE,
      ...(cursor ? { after: cursor } : {}),
    });
    return {
      success: true,
      section: "comments",
      hasMore: page.hasMore,
      items: page.items.map((comment) => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        user: comment.user,
      })),
    };
  }

  const page = await getActivityByCardId(cardId, {
    limit: ACTIVITY_PAGE_SIZE,
    ...(cursor ? { before: cursor } : {}),
  });
  return {
    success: true,
    section: "activity",
    hasMore: page.hasMore,
    items: page.items.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      createdAt: entry.createdAt.toISOString(),
      user: entry.user,
      metadata: entry.metadata as Record<string, unknown> | null,
    })),
  };
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
          ruleEffects: [] as DeferredEffect[],
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

      // Automation (US-066): a new assignment fires the member-assigned trigger
      // inside this tx; rule effects roll back with the assignment on failure.
      const { effects } = await evaluateRules({
        client: tx,
        workspaceId: cardResult.board.workspaceId,
        triggerType: "member-assigned",
        event: {
          cardId,
          boardId: cardResult.board.id,
          listId: cardResult.list.id,
          memberId: userId,
        },
      });

      return {
        changed: true,
        member: {
          id: result.user.id,
          name: result.user.name,
          image: result.user.image,
          email: result.user.email,
        },
        ruleEffects: effects,
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
        ruleEffects: [] as DeferredEffect[],
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
      // Live-broadcast the new assignee set so open detail sheets update
      // without a reload (US-011).
      const members = await getCardMembers(cardId);
      emitCardMembersUpdated(cardResult.board.id, { cardId, members });
    }
    await fireDeferredEffects(assignment.ruleEffects);
    return {
      success: true,
      changed: assignment.changed,
      member: assignment.member,
    };
  } catch (error) {
    if (error instanceof RuleExecutionError) {
      // Decision 0030: only UNEXPECTED errors reach here (stale-target failures
      // are isolated in-tx and the action succeeds).
      await logRuleExecutionError(error);
      return {
        success: false,
        error: `Automation rule "${error.context.ruleName}" hit an unexpected error; no changes were applied.`,
      };
    }
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
      // Live-broadcast the trimmed assignee set so open detail sheets drop the
      // member without a reload (US-011).
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

  const cardResult = await getCardWithListAndBoard(parsedCardId);
  if (!cardResult || cardResult.board.archivedAt) {
    return { success: false, error: "Card not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(cardResult.board.workspaceId, {
    card: ["update"],
  });

  if (!canUpdateCard) {
    return { success: false, error: "Card not found" };
  }

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
    // Lock the parent list row and revalidate it is still active before
    // inserting the attachment (US-074, in-flight upload race fix).
    const listId = cardResult.list.id;
    const attachment = await db.$transaction(async (tx) => {
      const list = await tx.$queryRaw<
        Array<{ id: string; archivedAt: Date | null }>
      >`SELECT id, "archivedAt" FROM "list" WHERE id = ${listId} FOR UPDATE`;

      if (list.length === 0 || list[0].archivedAt !== null) {
        throw new Error("LIST_ARCHIVED_OR_DELETED");
      }

      const att = await createAttachment(
        {
          cardId: parsedCardId,
          userId: actorUserId,
          fileName: file.name,
          fileUrl: cloudinaryResult.secureUrl,
          fileType: file.type,
          fileSize: file.size,
          cloudinaryPublicId: cloudinaryResult.publicId,
          cloudinaryResourceType: cloudinaryResult.resourceType,
        },
        tx,
      );

      await createActivityEntry(
        {
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
        },
        tx,
      );

      return att;
    });

    revalidatePath(`/boards/${cardResult.board.id}`);
    return { success: true, attachmentId: attachment.id };
  } catch (error) {
    if (error instanceof Error && error.message === "LIST_ARCHIVED_OR_DELETED") {
      // Compensate: destroy the just-uploaded Cloudinary asset
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
      return { success: false, error: "Card not found" };
    }

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
 * Board-scoped labels: set CRUD reuses `board:["update"]` (board
 * configuration); attach/detach reuse `card:["update"]` (editing a card).
 * No dedicated `label` permission statement (US-005). */

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
 * Re-emit the existing `card:labels-updated` event per affected card after a
 * label rename/recolor/delete, since each card carries a denormalized label
 * snapshot. O(N) in the cards carrying the label — fine at board scale, and it
 * reuses the proven live-apply reducer (US-010). For a delete, pass card ids
 * captured BEFORE the cascade so the re-read reflects the removed label.
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

  let ruleEffects: DeferredEffect[] = [];
  try {
    const { changed } = await db.$transaction(async (tx) => {
      const result = await addCardLabel(cardId, labelId, tx);
      // Automation (US-066): a newly attached label fires the trigger inside this
      // tx; rule effects roll back with the attach on failure.
      if (result.changed) {
        const { effects } = await evaluateRules({
          client: tx,
          workspaceId: cardResult.board.workspaceId,
          triggerType: "label-added-to-card",
          event: {
            cardId,
            boardId: cardResult.board.id,
            listId: cardResult.list.id,
            labelId,
          },
        });
        ruleEffects = effects;
      }
      return result;
    });
    if (changed) {
      const labels = await getCardLabels(cardId);
      emitCardLabelsUpdated(cardResult.list.boardId, {
        cardId,
        labels: labels.map((label) => ({ id: label.id, name: label.name, color: label.color })),
      });
    }
    revalidatePath(`/boards/${cardResult.list.boardId}`);
    await fireDeferredEffects(ruleEffects);
    return { success: true, changed };
  } catch (error) {
    if (error instanceof RuleExecutionError) {
      // Decision 0030: only UNEXPECTED errors reach here (stale-target failures
      // are isolated in-tx and the action succeeds).
      await logRuleExecutionError(error);
      return {
        success: false,
        error: `Automation rule "${error.context.ruleName}" hit an unexpected error; no changes were applied.`,
      };
    }
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

/* ─── Checklist actions (card content; reuse card:["update"]) ──────────────
 *
 * Checklists reuse the `card:["update"]` permission (no dedicated statement).
 * They render only in the card detail sheet, so actions revalidate the board
 * path rather than emitting a realtime event; rename/reorder are not supported
 * (float-gap positions slot new items in on create).
 */

type CreateChecklistResult =
  | { success: true; checklist: ChecklistWithItems }
  | { success: false; error: string };

type DeleteChecklistResult =
  | { success: true }
  | { success: false; error: string };

type CreateChecklistItemResult =
  | { success: true; item: ChecklistItemRecord }
  | { success: false; error: string };

type ToggleChecklistItemResult =
  | { success: true; item: ChecklistItemRecord }
  | { success: false; error: string };

type DeleteChecklistItemResult =
  | { success: true }
  | { success: false; error: string };

export async function createChecklistAction(
  formData: FormData,
): Promise<CreateChecklistResult> {
  const parsed = createChecklistSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) };
  }

  const { userId } = await verifySession();
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
    const checklist = await createChecklist({ cardId, title });
    await createActivityEntry({
      workspaceId: result.board.workspaceId,
      boardId: result.list.boardId,
      cardId,
      userId,
      action: "CREATED",
      entityType: "CHECKLIST",
      metadata: { checklistId: checklist.id, title },
    });
    revalidatePath(`/boards/${result.list.boardId}`);
    return { success: true, checklist };
  } catch {
    return { success: false, error: "Failed to create checklist. Please try again." };
  }
}

export async function deleteChecklistAction(
  formData: FormData,
): Promise<DeleteChecklistResult> {
  const parsed = deleteChecklistSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) };
  }

  const { userId } = await verifySession();
  const { checklistId } = parsed.data;

  const scope = await getChecklistWithCard(checklistId);
  if (!scope) {
    return { success: true };
  }

  if (scope.board.archivedAt || scope.cardArchived || scope.listArchived) {
    return { success: false, error: "Checklist not found" };
  }

  if (!(await isWorkspaceMember(userId, scope.board.workspaceId))) {
    return { success: false, error: "Checklist not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(scope.board.workspaceId, {
    card: ["update"],
  });
  if (!canUpdateCard) {
    return {
      success: false,
      error: "You do not have permission to delete checklists on this card.",
    };
  }

  try {
    await deleteChecklist(checklistId);
    await createActivityEntry({
      workspaceId: scope.board.workspaceId,
      boardId: scope.boardId,
      cardId: scope.cardId,
      userId,
      action: "DELETED",
      entityType: "CHECKLIST",
      metadata: { checklistId },
    });
    revalidatePath(`/boards/${scope.boardId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete checklist. Please try again." };
  }
}

export async function createChecklistItemAction(
  formData: FormData,
): Promise<CreateChecklistItemResult> {
  const parsed = createChecklistItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) };
  }

  await verifySession();
  const { checklistId, title } = parsed.data;

  const scope = await getChecklistWithCard(checklistId);
  if (!scope || scope.board.archivedAt || scope.cardArchived || scope.listArchived) {
    return { success: false, error: "Checklist not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(scope.board.workspaceId, {
    card: ["update"],
  });
  if (!canUpdateCard) {
    return { success: false, error: "Checklist not found" };
  }

  try {
    const item = await createChecklistItem({ checklistId, title });
    revalidatePath(`/boards/${scope.boardId}`);
    return { success: true, item };
  } catch {
    return { success: false, error: "Failed to add item. Please try again." };
  }
}

export async function toggleChecklistItemAction(
  formData: FormData,
): Promise<ToggleChecklistItemResult> {
  const parsed = toggleChecklistItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) };
  }

  await verifySession();
  const { itemId, isCompleted } = parsed.data;

  const scope = await getChecklistItemWithCard(itemId);
  if (!scope || scope.board.archivedAt || scope.cardArchived || scope.listArchived) {
    return { success: false, error: "Item not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(scope.board.workspaceId, {
    card: ["update"],
  });
  if (!canUpdateCard) {
    return { success: false, error: "Item not found" };
  }

  try {
    const item = await setChecklistItemCompleted(itemId, isCompleted);
    revalidatePath(`/boards/${scope.boardId}`);
    return { success: true, item };
  } catch {
    return { success: false, error: "Failed to update item. Please try again." };
  }
}

export async function deleteChecklistItemAction(
  formData: FormData,
): Promise<DeleteChecklistItemResult> {
  const parsed = deleteChecklistItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: firstFieldError(parsed.error) };
  }

  await verifySession();
  const { itemId } = parsed.data;

  const scope = await getChecklistItemWithCard(itemId);
  if (!scope || scope.board.archivedAt || scope.cardArchived || scope.listArchived) {
    return { success: false, error: "Item not found" };
  }

  const canUpdateCard = await hasWorkspacePermission(scope.board.workspaceId, {
    card: ["update"],
  });
  if (!canUpdateCard) {
    return { success: false, error: "Item not found" };
  }

  try {
    await deleteChecklistItem(itemId);
    revalidatePath(`/boards/${scope.boardId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete item. Please try again." };
  }
}
