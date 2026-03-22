"use client";

import { useState, useTransition } from "react";

import { createListAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AddListButtonProps = {
  boardId: string;
  canCreate: boolean;
};

export function AddListButton({ boardId, canCreate }: AddListButtonProps) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!canCreate || !title.trim() || isPending) {
      return;
    }

    const formData = new FormData();
    formData.set("boardId", boardId);
    formData.set("title", title.trim());

    startTransition(async () => {
      const result = await createListAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }

      setTitle("");
      setError("");
      setExpanded(false);
    });
  }

  function handleCancel() {
    setTitle("");
    setError("");
    setExpanded(false);
  }

  if (!canCreate) {
    return null;
  }

  if (!expanded) {
    return (
      <Button
        type="button"
        onClick={() => setExpanded(true)}
        variant="ghost"
        className="w-80 shrink-0 justify-start rounded-lg bg-muted hover:bg-muted/90"
      >
        + Add a list
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-80 shrink-0 flex-col gap-2 rounded-lg bg-muted p-3">
      <Input
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setError("");
        }}
        placeholder="Enter list title..."
        autoFocus
        disabled={isPending}
        className="h-8 text-sm"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            handleCancel();
          }
        }}
      />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending || !title.trim()}>
          {isPending ? "Adding..." : "Add list"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
