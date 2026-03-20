import { notFound } from "next/navigation";

import { BoardHeader } from "@/components/boards/board-header";
import { getBoardById } from "@/lib/board";
import { hasWorkspacePermission, isWorkspaceMember } from "@/lib/authorization";
import { getBoardTheme } from "@/lib/constants";
import { verifySession } from "@/lib/dal";

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

  const [canEditBoard, canDeleteBoard] = await Promise.all([
    hasWorkspacePermission(board.workspaceId, { board: ["update"] }),
    hasWorkspacePermission(board.workspaceId, { board: ["delete"] }),
  ]);
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
        className="-mt-px flex-1 rounded-b-xl border border-t-0 border-white/20 p-6 text-white"
        style={{ background: boardTheme.surface }}
      >
        <h2 className="text-base font-medium">Kanban view</h2>
        <p className="mt-1 text-sm text-white/85">Lists and cards are coming soon.</p>
      </div>
    </div>
  );
}
