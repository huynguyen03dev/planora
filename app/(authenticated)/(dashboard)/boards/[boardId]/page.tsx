import { notFound } from "next/navigation";

import { BoardContent } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-content";
import { BoardHeader } from "@/components/boards/board-header";
import { CardDetailSheet } from "@/components/boards/card-detail-sheet";
import { getBoardById } from "@/lib/board";
import {
  getBoardPagePermissionsForRole,
  getWorkspaceRole,
} from "@/lib/authorization";
import { getCardDetailForBoard } from "@/lib/card";
import { getCommentsByCardId } from "@/lib/comment";
import type { CommentRecord } from "@/lib/comment";
import { getActivityByCardId } from "@/lib/activity";
import type { ActivityRecord } from "@/lib/activity";
import { getBoardTheme } from "@/lib/constants";
import { verifySession } from "@/lib/dal";
import { getListsByBoardId } from "@/lib/list";
import { getCardMembers, getAssignableWorkspaceMembers } from "@/lib/card-member";
import type { CardMemberRecord, AssignableWorkspaceMemberRecord } from "@/lib/card-member";

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
  const { userId } = await verifySession();
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
  } = getBoardPagePermissionsForRole(role);

  const rawCardId = resolvedSearchParams.cardId;
  const selectedCardId =
    typeof rawCardId === "string" && rawCardId.length > 0 && isUuid(rawCardId)
      ? rawCardId
      : null;

  // Load lists first (needed regardless of card selection)
  const lists = await getListsByBoardId(boardId);
  
  // Initialize data variables
  let selectedCard = null;
  let comments: CommentRecord[] = [];
  let activity: ActivityRecord[] = [];
  let assignees: CardMemberRecord[] = [];
  let assignableMembers: AssignableWorkspaceMemberRecord[] = [];

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
        cardActivity,
        cardAssignees,
      ] = await Promise.all([
        getCommentsByCardId(selectedCard.id),
        getActivityByCardId(selectedCard.id),
        getCardMembers(selectedCard.id),
      ]);
      
      comments = cardComments;
      activity = cardActivity;
      assignees = cardAssignees;
      
      // Load assignable members only if the current user can edit cards
      if (canEditCard) {
        assignableMembers = await getAssignableWorkspaceMembers(board.workspaceId);
      }
    }
  }

  const boardTheme = getBoardTheme(board.backgroundColor);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col p-6">
      <BoardHeader
        board={{
          id: board.id,
          title: board.title,
          backgroundColor: board.backgroundColor,
        }}
        canEdit={canEditBoard}
        canDelete={canDeleteBoard}
      />

      <div
        className="-mt-px flex flex-1 flex-col rounded-b-xl border border-t-0 border-white/20"
        style={{ background: boardTheme.surface }}
      >
        <BoardContent
          boardId={board.id}
          lists={lists}
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
        assignees={assignees}
        assignableMembers={assignableMembers}
        canEdit={canEditCard}
        canComment={canComment}
      />
    </div>
  );
}
