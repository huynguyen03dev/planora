"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  toggleBoardStarAction,
  updateBoardAction,
} from "@/app/(authenticated)/(dashboard)/boards/actions";
import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";
import { BoardFilter } from "@/components/boards/board-filter";
import { BoardSearch } from "@/components/boards/board-search";
import { ArchivedCardsDialog } from "@/components/boards/archived-cards-dialog";
import type { ArchivedCardData } from "@/components/boards/archived-cards-dialog";
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
  canArchiveCard: boolean;
  archivedCards: ArchivedCardData[];
  starred: boolean;
};

export function BoardHeader({
  board,
  canEdit,
  canDelete,
  canArchiveCard,
  archivedCards,
  starred,
}: BoardHeaderProps) {
  const [draftTitle, setDraftTitle] = useState(board.title);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const skipBlurSaveRef = useRef(false);

  // Optimistic star state; pending also reads as starred so the toggle feels
  // instant (mirrors the boards-overview BoardCard star).
  const [isStarred, setIsStarred] = useState(starred);
  const [starPending, startStarTransition] = useTransition();

  function handleToggleStar() {
    setIsStarred((prev) => !prev);
    startStarTransition(async () => {
      const result = await toggleBoardStarAction(board.id);
      if (result.success) {
        setIsStarred(result.starred);
      } else {
        // Revert on failure.
        setIsStarred((prev) => !prev);
      }
    });
  }

  const socketConnected = useBoardStore((s) => s.socketConnected);
  const [showReconnecting, setShowReconnecting] = useState(false);

  useEffect(() => {
    if (socketConnected) {
      return;
    }

    const timer = setTimeout(() => setShowReconnecting(true), 1000);
    // Reset on teardown — runs when we transition back to connected (or unmount),
    // so the badge hides immediately on reconnect without a synchronous
    // setState in the effect body.
    return () => {
      clearTimeout(timer);
      setShowReconnecting(false);
    };
  }, [socketConnected]);

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
              <h1 className="truncate text-xl font-semibold text-white sm:text-2xl">{board.title}</h1>
            </button>
          ) : (
            <h1 className="truncate text-xl font-semibold text-white sm:text-2xl">{board.title}</h1>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {showReconnecting ? (
            <span
              role="status"
              className="flex items-center gap-1.5 rounded-full bg-amber-500/90 px-2.5 py-1 text-xs font-medium text-white"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-white" />
              Reconnecting…
            </span>
          ) : null}

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
            onClick={handleToggleStar}
            disabled={starPending}
            aria-pressed={isStarred}
            aria-label={isStarred ? "Unstar board" : "Star board"}
            className={`rounded-full border-white/40 bg-white/15 hover:bg-white/25 ${
              isStarred ? "text-yellow-400 hover:text-yellow-300" : "text-white"
            }`}
          >
            <HugeiconsIcon
              icon={StarIcon}
              className="size-[18px] drop-shadow-sm"
              fill={isStarred ? "currentColor" : "none"}
            />
          </Button>

          <BoardSearch />

          <BoardFilter />

          <ArchivedCardsDialog
            archivedCards={archivedCards}
            canRestore={canArchiveCard}
          />

          <BoardMenu board={board} canEdit={canEdit} canDelete={canDelete} />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive-foreground">{error}</p> : null}
    </header>
  );
}
