"use client";

import { Button } from "@/components/ui/button";

type EmptyBoardsStateProps = {
  onCreateWorkspace: () => void;
};

export function EmptyBoardsState({
  onCreateWorkspace,
}: EmptyBoardsStateProps) {
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-xl bg-muted">
          <span className="text-3xl">W</span>
        </div>
        <h1 className="mb-2 text-xl font-semibold">Create your first workspace</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Workspaces help you organize boards for different teams or projects.
        </p>
        <Button
          type="button"
          onClick={onCreateWorkspace}
          size="lg"
        >
          Create workspace
        </Button>
      </div>
    </div>
  );
}
