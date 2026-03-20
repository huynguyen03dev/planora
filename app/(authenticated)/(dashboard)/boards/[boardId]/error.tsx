"use client";

import { ErrorState } from "@/components/boards/error-state";

type BoardErrorProps = {
  error: Error;
  reset: () => void;
};

export default function BoardError({ error, reset }: BoardErrorProps) {
  void error;

  return (
    <ErrorState
      title="Could not load this board"
      message="Something went wrong while loading the board. Please retry."
      onRetry={reset}
    />
  );
}
