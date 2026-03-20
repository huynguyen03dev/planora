import { BoardCard } from "./board-card";
import { workspaceBadgeGradient } from "./styles";

type WorkspaceBoardsViewProps = {
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  boards: {
    id: string;
    title: string;
    backgroundColor?: string | null;
  }[];
};

export function WorkspaceBoardsView({
  workspace,
  boards,
}: WorkspaceBoardsViewProps) {
  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-lg ${workspaceBadgeGradient} text-lg font-bold text-white`}
        >
          {initial}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{workspace.name}</h1>
          <p className="text-sm text-muted-foreground">
            {boards.length} {boards.length === 1 ? "board" : "boards"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {boards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No boards yet</p>
        ) : (
          boards.map((board) => (
            <BoardCard
              key={board.id}
              id={board.id}
              title={board.title}
              backgroundColor={board.backgroundColor}
            />
          ))
        )}

        <div
          className="flex h-24 w-44 cursor-not-allowed items-center justify-center rounded-lg border-2 border-dashed border-muted text-sm text-muted-foreground opacity-60"
          title="Coming soon"
        >
          + Create board
        </div>
      </div>
    </div>
  );
}
