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
};

export function BoardsOverview({ workspaces, boards }: BoardsOverviewProps) {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Your workspaces</h1>

      {workspaces.map((workspace) => (
        <WorkspaceSection
          key={workspace.id}
          workspace={workspace}
          boards={boards.filter((board) => board.workspaceId === workspace.id)}
        />
      ))}
    </div>
  );
}
