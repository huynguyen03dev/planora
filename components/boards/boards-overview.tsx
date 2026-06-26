import { BoardCard } from "./board-card";
import { WorkspaceSection } from "./workspace-section";

type BoardsOverviewProps = {
  workspaces: {
    id: string;
    name: string;
    slug: string;
    canCreateBoard: boolean;
  }[];
  boards: {
    id: string;
    title: string;
    backgroundColor?: string | null;
    workspaceId: string;
  }[];
  starredBoardIds: string[];
};

export function BoardsOverview({ workspaces, boards, starredBoardIds }: BoardsOverviewProps) {
  const starredBoards = boards.filter((board) => starredBoardIds.includes(board.id));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Your workspaces</h1>

      {starredBoards.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            ⭐ Starred
          </h2>
          <div className="flex flex-wrap gap-4">
            {starredBoards.map((board) => (
              <BoardCard
                key={board.id}
                id={board.id}
                title={board.title}
                backgroundColor={board.backgroundColor}
                starred={true}
              />
            ))}
          </div>
        </section>
      ) : null}

      {workspaces.map((workspace) => (
        <WorkspaceSection
          key={workspace.id}
          workspace={workspace}
          boards={boards.filter((board) => board.workspaceId === workspace.id)}
          starredBoardIds={starredBoardIds}
        />
      ))}
    </div>
  );
}
