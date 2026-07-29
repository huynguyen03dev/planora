import { notFound } from "next/navigation";

import { BoardContent } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-content";
import { BoardStoreProvider } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store-provider";
import { BoardHeader } from "@/components/boards/board-header";
import { CardDetailSheet } from "@/components/boards/card-detail-sheet";
import { getBoardById, getStarredBoardIds } from "@/lib/board";
import {
  getBoardPagePermissionsForRole,
  getWorkspaceRole,
} from "@/lib/authorization";
import { getCardDetailForBoard } from "@/lib/card";
import { getCommentsByCardId } from "@/lib/comment";
import type { CommentRecord } from "@/lib/comment";
import { getAttachmentsByCardId } from "@/lib/attachment";
import type { AttachmentRecord } from "@/lib/attachment";
import { getActivityByCardId } from "@/lib/activity";
import type { ActivityRecord } from "@/lib/activity";
import { getBoardTheme } from "@/lib/constants";
import { verifySession } from "@/lib/dal";
import { getListsByBoardId, getArchivedLists } from "@/lib/list";
import type { ArchivedListRecord } from "@/lib/list";
import db from "@/lib/prisma";
import { getCardMembers, getAssignableWorkspaceMembers } from "@/lib/card-member";
import type { CardMemberRecord, AssignableWorkspaceMemberRecord } from "@/lib/card-member";
import { getBoardLabels, getCardLabels } from "@/lib/label";
import type { LabelRecord } from "@/lib/label";
import { getCardChecklists } from "@/lib/checklist";
import type { ChecklistWithItems } from "@/lib/checklist";
import { getArchivedCards } from "@/lib/card";
import type { ArchivedCardRecord } from "@/lib/card";

type BoardPageProps = {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ cardId?: string | string[] }>;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function BoardPage({
  params,
  searchParams,
}: BoardPageProps) {
  const { userId, user } = await verifySession();
  const { boardId } = await params;
  const resolvedSearchParams = await searchParams;

  const board = await getBoardById(boardId);

  if (!board) {
    notFound();
  }

  const role = await getWorkspaceRole(userId, board.workspaceId);
  if (!role) {
    notFound();
  }

  const {
    canEditBoard,
    canDeleteBoard,
    canCreateList,
    canEditList,
    canDeleteList,
    canCreateCard,
    canEditCard,
    canArchiveCard,
    canComment,
    canPermanentDelete,
  } = getBoardPagePermissionsForRole(role);

  const rawCardId = resolvedSearchParams.cardId;
  const selectedCardId =
    typeof rawCardId === "string" && rawCardId.length > 0 && isUuid(rawCardId)
      ? rawCardId
      : null;

  // Load lists + board labels first (needed regardless of card selection).
  // Archived cards & lists only matter to users who can restore them (editor/admin).
  const [lists, boardLabels, archivedCards, archivedLists, starredBoardIds] = await Promise.all([
    getListsByBoardId(boardId),
    getBoardLabels(boardId),
    canArchiveCard
      ? getArchivedCards(boardId)
      : Promise.resolve([] as ArchivedCardRecord[]),
    canDeleteList
      ? getArchivedLists(boardId)
      : Promise.resolve([] as ArchivedListRecord[]),
    getStarredBoardIds(userId),
  ]);
  const isBoardStarred = starredBoardIds.includes(board.id);

  // For admin users, batch-query live card counts and Cloudinary attachment
  // presence for the permanent-delete UI (US-074 Slice C). Avoids N+1.
  const listIds = canPermanentDelete ? archivedLists.map((l) => l.id) : [];
  let liveCardCountByList: Map<string, number> | undefined;
  const cloudinaryBlockedListIds = new Set<string>();
  if (listIds.length > 0) {
    const [cardGroups, cloudinaryAttachments] = await Promise.all([
      db.card.groupBy({
        by: ["listId"],
        where: { listId: { in: listIds }, archivedAt: null, deletedAt: null },
        _count: true,
      }),
      // Distinct list IDs with Cloudinary-backed attachments; no cap (the
      // set deduplicates and handles any attachment count per list).
      db.attachment.findMany({
        where: {
          card: { listId: { in: listIds } },
          cloudinaryPublicId: { not: null },
        },
        select: { card: { select: { listId: true } } },
      }),
    ]);
    liveCardCountByList = new Map(cardGroups.map((g) => [g.listId, g._count]));
    for (const a of cloudinaryAttachments) {
      cloudinaryBlockedListIds.add(a.card.listId);
    }
  }

  // Initialize data variables
  let selectedCard = null;
  let comments: CommentRecord[] = [];
  let attachments: AttachmentRecord[] = [];
  let activity: ActivityRecord[] = [];
  let assignees: CardMemberRecord[] = [];
  let assignableMembers: AssignableWorkspaceMemberRecord[] = [];
  let cardLabels: LabelRecord[] = [];
  let checklists: ChecklistWithItems[] = [];

  // If a card ID is provided, load card details and related data
  if (selectedCardId) {
    selectedCard = await getCardDetailForBoard(boardId, selectedCardId);
    
    // Fail-closed: treat invalid/foreign/archived card as no selection
    if (!selectedCard) {
      selectedCard = null;
    }
    
    // Load card-specific data in parallel (only if card is valid)
    if (selectedCard) {
      const [
        cardComments,
        cardAttachments,
        cardActivity,
        cardAssignees,
        cardLabelRecords,
        cardChecklists,
      ] = await Promise.all([
        getCommentsByCardId(selectedCard.id),
        getAttachmentsByCardId(selectedCard.id),
        getActivityByCardId(selectedCard.id),
        getCardMembers(selectedCard.id),
        getCardLabels(selectedCard.id),
        getCardChecklists(selectedCard.id),
      ]);

      comments = cardComments;
      attachments = cardAttachments;
      activity = cardActivity;
      assignees = cardAssignees;
      cardLabels = cardLabelRecords;
      checklists = cardChecklists;
      
      // Load assignable members only if the current user can edit cards
      if (canEditCard) {
        assignableMembers = await getAssignableWorkspaceMembers(board.workspaceId);
      }
    }
  }

  const boardTheme = getBoardTheme(board.backgroundColor);

  const listsWithCards = lists.map((list) => ({
    id: list.id,
    title: list.title,
    boardId: list.boardId,
    position: list.position,
    cards: list.cards.map((card) => ({
      id: card.id,
      listId: card.listId,
      title: card.title,
      position: card.position,
      coverImage: card.coverImage,
      priority: card.priority,
      dueDate: card.dueDate,
      completedAt: card.completedAt,
      updatedAt: card.updatedAt,
      labels: card.labels,
      members: card.members,
      memberCount: card.memberCount,
      checklistDone: card.checklistDone,
      checklistTotal: card.checklistTotal,
      commentCount: card.commentCount,
    })),
  }));

  const selectedCardData = selectedCard
    ? {
        card: {
          id: selectedCard.id,
          listId: selectedCard.listId,
          title: selectedCard.title,
          description: selectedCard.description,
          estimateHours: selectedCard.estimateHours,
          dueDate: selectedCard.dueDate,
          completedAt: selectedCard.completedAt,
          coverImage: selectedCard.coverImage,
          priority: selectedCard.priority,
          updatedAt: selectedCard.updatedAt,
        },
        comments: comments.map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          user: c.user,
        })),
        activity: activity.map((a) => ({
          id: a.id,
          action: a.action,
          entityType: a.entityType,
          createdAt: a.createdAt,
          user: a.user,
          metadata: a.metadata,
        })),
        attachments: attachments.map((a) => ({
          id: a.id,
          url: a.fileUrl,
          filename: a.fileName,
          mimeType: a.fileType,
          size: a.fileSize,
          uploadedAt: a.createdAt,
        })),
        assignees: assignees.map((a) => ({
          id: a.id,
          name: a.name,
          email: a.email,
          image: a.image,
        })),
        assignableMembers: assignableMembers.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          image: m.image,
        })),
      }
    : null;

  return (
    <BoardStoreProvider
      boardId={board.id}
      lists={listsWithCards}
      selectedCardId={selectedCardId}
      selectedCard={selectedCardData}
      currentViewer={{ id: user.id, name: user.name, image: user.image ?? null, role }}
      canEdit={canEditList}
      canDelete={canDeleteList}
      canCreateList={canCreateList}
      canCreateCard={canCreateCard}
      canEditCard={canEditCard}
      canArchiveCard={canArchiveCard}
    >
      {/* Pin the board to the viewport minus the 56px (3.5rem) app header so the
          page itself never scrolls; lists scroll their cards internally instead. */}
      <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-hidden p-3 sm:p-6">
        <BoardHeader
          board={{
            id: board.id,
            title: board.title,
            backgroundColor: board.backgroundColor,
          }}
          canEdit={canEditBoard}
          canDelete={canDeleteBoard}
          canArchiveCard={canArchiveCard}
          canDeleteList={canDeleteList}
          archivedCards={archivedCards.map((card) => ({
            id: card.id,
            title: card.title,
            listTitle: card.listTitle,
          }))}
          archivedLists={archivedLists.map((list) => ({
            id: list.id,
            title: list.title,
            cardCount: list.cardCount,
            liveCardCount: liveCardCountByList?.get(list.id) ?? 0,
            cloudinaryBlocked: cloudinaryBlockedListIds.has(list.id),
          }))}
          canPermanentDelete={canPermanentDelete}
          starred={isBoardStarred}
        />

        <div
          className="-mt-px flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl border border-t-0 border-white/20"
          style={{ background: boardTheme.surface }}
        >
          <BoardContent
            boardId={board.id}
            lists={listsWithCards}
            canEdit={canEditList}
            canDelete={canDeleteList}
            canCreateList={canCreateList}
            canCreateCard={canCreateCard}
            canEditCard={canEditCard}
            canArchiveCard={canArchiveCard}
          />
        </div>

        <CardDetailSheet
          key={selectedCard?.id ?? "card-detail-sheet-closed"}
          open={Boolean(selectedCard)}
          card={selectedCard}
          comments={comments}
          activity={activity}
          attachments={attachments}
          assignees={assignees}
          assignableMembers={assignableMembers}
          boardId={board.id}
          boardLabels={boardLabels}
          cardLabelIds={cardLabels.map((label) => label.id)}
          checklists={checklists}
          canEdit={canEditCard}
          canArchive={canArchiveCard}
          canComment={canComment}
        />
      </div>
    </BoardStoreProvider>
  );
}
