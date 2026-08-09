"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Crown02Icon, StarIcon, UserAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  toggleBoardStarAction,
  updateBoardAction,
} from "@/app/(authenticated)/(dashboard)/boards/actions";
import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";
import { BoardFilter } from "@/components/boards/board-filter";
import { BoardAutomationDialog } from "@/components/workspace/automation/board-automation-dialog";
import { boardHeaderAvatarCountClass } from "@/components/boards/board-header-controls";
import { ArchivedCardsDialog } from "@/components/boards/archived-cards-dialog";
import type { ArchivedCardData, ArchivedListData } from "@/components/boards/archived-cards-dialog";
import { BoardMenu } from "@/components/boards/board-menu";
import { InviteMemberDialog } from "@/components/workspace/members/invite-member-dialog";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { avatarColorClass, avatarRingClass } from "@/lib/avatar";
import { getBoardTheme } from "@/lib/constants";
import { cn, getInitials } from "@/lib/utils";

// Cap how many watcher avatars render before collapsing into a "+N" count.
const MAX_VISIBLE_WATCHERS = 5;

type BoardHeaderProps = {
  board: {
    id: string;
    title: string;
    backgroundColor: string | null;
  };
  canEdit: boolean;
  canDelete: boolean;
  canArchiveCard: boolean;
  canDeleteList?: boolean;
  archivedCards: ArchivedCardData[];
  archivedLists?: ArchivedListData[];
  // Admin-only permanent delete affordance (US-074 Slice C).
  canPermanentDelete?: boolean;
  starred: boolean;
  // U1: the Share button is the workspace invite entry. Without a workspace
  // to invite into (or the invitation:create permission), no dead button
  // renders — the header never offers an action the user can't take.
  workspaceId?: string | null;
  canInviteMembers?: boolean;
};

export function BoardHeader({
  board,
  canEdit,
  canDelete,
  canArchiveCard,
  canDeleteList = false,
  archivedCards,
  archivedLists = [],
  canPermanentDelete = false,
  starred,
  workspaceId = null,
  canInviteMembers = false,
}: BoardHeaderProps) {
  // Live presence: who currently has this board open. Server-driven, deduped.
  const watchers = useBoardStore((s) => s.watchers);
  const visibleWatchers = watchers.slice(0, MAX_VISIBLE_WATCHERS);
  const watcherOverflow = watchers.length - visibleWatchers.length;
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
    if (!canEdit) {
      setEditing(false);
      setDraftTitle(board.title);
      return;
    }

    // A blur that lands while a save is in flight (the input is disabled
    // mid-flight, and disabling a focused input fires a blur) must not wipe
    // the typed draft: the in-flight transition settles editing/error state
    // when it completes, and reverting here would discard a rename that may
    // still land. Stay in edit mode and keep the draft.
    if (isPending) {
      return;
    }

    if (!canSubmit) {
      // Nothing to save (unchanged or empty draft): close the editor and
      // restore the last known title.
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
      className="space-y-2 rounded-t-xl border border-white/15 p-3 md:space-y-4 md:p-5"
      style={{ background: boardTheme.header }}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-3">
        <div className="min-w-0 flex-1">
          {canEdit && editing ? (
            <Input
              aria-label="Board title"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "board-title-error" : undefined}
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraftTitle(board.title);
                setEditing(true);
              }}
              className="max-w-full h-auto p-1 -m-1 text-left text-white hover:bg-white/10"
            >
              <h1 className="truncate text-xl font-semibold sm:text-2xl">{board.title}</h1>
            </Button>
          ) : (
            <h1 className="truncate text-xl font-semibold text-white sm:text-2xl">{board.title}</h1>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5 md:gap-2">
          {showReconnecting ? (
            <Badge
              role="status"
              className="flex h-6 items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-white" />
              Reconnecting…
            </Badge>
          ) : null}

          {watchers.length > 0 ? (
            <AvatarGroup className="pr-1" aria-label="Viewing now">
              {visibleWatchers.map((watcher) => (
                <Avatar
                  key={watcher.id}
                  // Per-user lighter-hue separating ring (see lib/avatar). Lift an
                  // admin above its overlapping neighbours so the crown
                  // (bottom-right) is never hidden under the next avatar.
                  className={cn(
                    avatarRingClass(watcher.id),
                    watcher.role === "admin" && "z-10",
                  )}
                  title={
                    watcher.role === "admin"
                      ? `${watcher.name} (admin)`
                      : watcher.name
                  }
                >
                  {watcher.image ? (
                    <AvatarImage src={watcher.image} alt={watcher.name} />
                  ) : null}
                  <AvatarFallback className={avatarColorClass(watcher.id)}>
                    {getInitials(watcher.name)}
                  </AvatarFallback>
                  {watcher.role === "admin" ? (
                    // Trello-style corner marker: a board admin gets a small gold
                    // crown at the avatar's bottom-right. Decorative — the role is
                    // already in the avatar's title for assistive tech.
                    <AvatarBadge
                      aria-hidden
                      className="-right-0.5 -bottom-0.5 bg-amber-400 text-amber-950 ring-white/70 group-data-[size=default]/avatar:size-3 group-data-[size=default]/avatar:[&>svg]:size-2"
                    >
                      <HugeiconsIcon icon={Crown02Icon} strokeWidth={2.5} />
                    </AvatarBadge>
                  ) : null}
                </Avatar>
              ))}
              {watcherOverflow > 0 ? (
                <AvatarGroupCount
                  className={cn("text-xs", boardHeaderAvatarCountClass)}
                  aria-label={`${watcherOverflow} more`}
                >
                  +{watcherOverflow}
                </AvatarGroupCount>
              ) : null}
            </AvatarGroup>
          ) : null}

          {canInviteMembers && workspaceId ? (
            <InviteMemberDialog
              workspaceId={workspaceId}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Share"
                  className="gap-1.5 rounded-md border-white/40 bg-white/15 text-white hover:bg-white/25"
                >
                  <HugeiconsIcon icon={UserAddIcon} size={16} aria-hidden="true" />
                  {/* Label hides below md so the toolbar stays a single icon
                      row on narrow screens; the aria-label keeps the name. */}
                  <span className="hidden md:inline">Share</span>
                </Button>
              }
            />
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={handleToggleStar}
            disabled={starPending}
            aria-pressed={isStarred}
            aria-label={isStarred ? "Unstar board" : "Star board"}
            className={`rounded-md border-white/40 bg-white/15 hover:bg-white/25 ${
              isStarred ? "text-yellow-400 hover:text-yellow-300" : "text-white"
            }`}
          >
            <HugeiconsIcon
              icon={StarIcon}
              className="size-[18px] drop-shadow-sm"
              fill={isStarred ? "currentColor" : "none"}
            />
          </Button>

          <BoardFilter />

          <BoardAutomationDialog boardId={board.id} boardTitle={board.title} />

          <ArchivedCardsDialog
            archivedCards={archivedCards}
            archivedLists={archivedLists}
            canRestore={canArchiveCard || canDeleteList}
            canPermanentDelete={canPermanentDelete}
          />

          <BoardMenu board={board} canEdit={canEdit} canDelete={canDelete} />
        </div>
      </div>

      {error ? (
        <p
          id="board-title-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </header>
  );
}
