"use client";

import { ErrorState } from "@/components/boards/error-state";

type BoardsErrorProps = {
  error: Error;
  reset: () => void;
};

export default function BoardsError({ error, reset }: BoardsErrorProps) {
  return (
    <ErrorState
      title="Could not load boards"
      message={
        error.message ||
        "Something went wrong while loading workspaces and boards."
      }
      onRetry={reset}
    />
  );
}
