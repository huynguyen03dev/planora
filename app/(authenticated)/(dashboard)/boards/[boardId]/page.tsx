import { notFound } from "next/navigation";

import { BoardContent } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-content";
import { BoardHeader } from "@/components/boards/board-header";
import { getBoardById } from "@/lib/board";
import { hasWorkspacePermission, isWorkspaceMember } from "@/lib/authorization";
import { getBoardTheme } from "@/lib/constants";
import { verifySession } from "@/lib/dal";
import { getListsByBoardId } from "@/lib/list";

type BoardPageProps = {
  params: Promise<{ boardId: string }>;
};

export default async function BoardPage({ params }: BoardPageProps) {
  const { userId } = await verifySession();
  const { boardId } = await params;

  const board = await getBoardById(boardId);

  if (!board) {
    notFound();
  }

  const canViewBoard = await isWorkspaceMember(userId, board.workspaceId);
  if (!canViewBoard) {
    notFound();
  }

  const [canEditBoard, canDeleteBoard, canCreateList, canEditList, canDeleteList] = await Promise.all([
    hasWorkspacePermission(board.workspaceId, { board: ["update"] }),
    hasWorkspacePermission(board.workspaceId, { board: ["delete"] }),
    hasWorkspacePermission(board.workspaceId, { list: ["create"] }),
    hasWorkspacePermission(board.workspaceId, { list: ["update"] }),
    hasWorkspacePermission(board.workspaceId, { list: ["delete"] }),
  ]);

  const lists = await getListsByBoardId(boardId);

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
        />
      </div>
    </div>
  );
}
