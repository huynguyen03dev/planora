import { notFound } from "next/navigation";

import { isWorkspaceMember } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import prisma from "@/lib/prisma";

type BoardPageProps = {
  params: Promise<{ boardId: string }>;
};

export default async function BoardPage({ params }: BoardPageProps) {
  const { userId } = await verifySession();
  const { boardId } = await params;

  const board = await prisma.board.findUnique({
    where: {
      id: boardId,
      archivedAt: null,
    },
    select: {
      id: true,
      title: true,
      workspaceId: true,
    },
  });

  if (!board) {
    notFound();
  }

  const canViewBoard = await isWorkspaceMember(userId, board.workspaceId);
  if (!canViewBoard) {
    notFound();
  }

  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{board.title}</h1>
        <p className="mt-2 text-muted-foreground">Board ID: {board.id}</p>
        <p className="mt-1 text-sm text-muted-foreground">Kanban view coming soon</p>
      </div>
    </div>
  );
}
