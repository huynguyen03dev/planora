import { BoardCard } from "./board-card";
import { workspaceBadgeGradient } from "./styles";

type WorkspaceSectionProps = {
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

export function WorkspaceSection({ workspace, boards }: WorkspaceSectionProps) {
  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-8 items-center justify-center rounded-md ${workspaceBadgeGradient} text-sm font-bold text-white`}
        >
          {initial}
        </div>
        <h2 className="font-medium">{workspace.name}</h2>
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
      </div>
    </section>
  );
}
