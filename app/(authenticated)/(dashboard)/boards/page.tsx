import { redirect } from "next/navigation";

import { verifySession } from "@/lib/dal";
import {
  listBoardsByWorkspaceIds,
  listWorkspaceMembershipsByUserId,
} from "@/lib/workspace";

import { BoardsPageWrapper } from "./boards-page-wrapper";

type BoardsPageProps = {
  searchParams: Promise<{
    workspace?: string;
    createWorkspace?: string;
  }>;
};

export default async function BoardsPage({ searchParams }: BoardsPageProps) {
  const { userId } = await verifySession();
  const params = await searchParams;

  const memberships = await listWorkspaceMembershipsByUserId(userId);
  const workspaces = memberships.map((membership) => membership.workspace);
  const workspaceIds = workspaces.map((workspace) => workspace.id);

  const selectedWorkspaceId = params.workspace ?? null;
  const shouldOpenCreateWorkspace = params.createWorkspace === "1";

  if (selectedWorkspaceId && !workspaceIds.includes(selectedWorkspaceId)) {
    redirect("/boards");
  }

  const boards = await listBoardsByWorkspaceIds(workspaceIds);

  return (
    <BoardsPageWrapper
      workspaces={workspaces}
      boards={boards}
      selectedWorkspaceId={selectedWorkspaceId}
      initialModalOpen={shouldOpenCreateWorkspace}
    />
  );
}
