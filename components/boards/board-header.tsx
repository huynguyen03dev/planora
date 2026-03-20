"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { updateBoardAction } from "@/app/(authenticated)/(dashboard)/boards/actions";
import { BoardMenu } from "@/components/boards/board-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBoardTheme } from "@/lib/constants";

type BoardHeaderProps = {
  board: {
    id: string;
    title: string;
    backgroundColor: string | null;
  };
  canEdit: boolean;
  canDelete: boolean;
};

export function BoardHeader({ board, canEdit, canDelete }: BoardHeaderProps) {
  const [draftTitle, setDraftTitle] = useState(board.title);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const skipBlurSaveRef = useRef(false);

  const canSubmit = useMemo(() => {
    return draftTitle.trim() !== "" && draftTitle.trim() !== board.title.trim();
  }, [draftTitle, board.title]);
  const boardTheme = getBoardTheme(board.backgroundColor);

  function handleSave() {
    if (!canEdit || !canSubmit || isPending) {
      setEditing(false);
      setDraftTitle(board.title);
      return;
    }

    const formData = new FormData();
    formData.set("boardId", board.id);
    formData.set("title", draftTitle);

    startTransition(async () => {
      const result = await updateBoardAction(formData);
      if (!result.success) {
        setError(result.error);
        setEditing(true);
        return;
      } else {
        setError("");
        setEditing(false);
      }
    });
  }

  function handleBlur() {
    if (skipBlurSaveRef.current) {
      skipBlurSaveRef.current = false;
      return;
    }

    handleSave();
  }

  return (
    <header
      className="space-y-4 rounded-t-xl border border-black/10 p-4 md:p-5"
      style={{ background: boardTheme.header }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          {canEdit && editing ? (
            <Input
              value={draftTitle}
              onChange={(event) => {
                setDraftTitle(event.target.value);
                setError("");
              }}
              onBlur={handleBlur}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSave();
                }

                if (event.key === "Escape") {
                  skipBlurSaveRef.current = true;
                  setDraftTitle(board.title);
                  setError("");
                  setEditing(false);
                }
              }}
              autoFocus
              disabled={isPending}
              className="max-w-xl bg-white/90"
            />
          ) : canEdit ? (
            <button
              type="button"
              onClick={() => {
                setDraftTitle(board.title);
                setEditing(true);
              }}
              className="max-w-full text-left"
            >
              <h1 className="truncate text-2xl font-semibold text-white">{board.title}</h1>
            </button>
          ) : (
            <h1 className="truncate text-2xl font-semibold text-white">{board.title}</h1>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center -space-x-2 pr-1">
            <span className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-sky-200 text-xs font-semibold text-sky-900">
              AL
            </span>
            <span className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-emerald-200 text-xs font-semibold text-emerald-900">
              MK
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full border-white/40 bg-white/15 text-white hover:bg-white/25"
          >
            Share
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="rounded-full border-white/40 bg-white/15 text-white hover:bg-white/25"
            aria-label="Toggle board favorite"
          >
            *
          </Button>

          <BoardMenu board={board} canEdit={canEdit} canDelete={canDelete} />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive-foreground">{error}</p> : null}
    </header>
  );
}
