"use client";

import { useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { toggleBoardStarAction } from "@/app/(authenticated)/(dashboard)/boards/actions";
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { getBoardTheme } from "@/lib/constants";
import type { WorkspaceBoardMember } from "@/lib/workspace";

type BoardCardProps = {
  id: string;
  title: string;
  backgroundColor?: string | null;
  starred?: boolean;
  listCount: number;
  cardCount: number;
  lastActivityAt: Date;
  members: WorkspaceBoardMember[];
  memberCount: number;
};

export function BoardCard({
  id,
  title,
  backgroundColor,
  starred = false,
  listCount,
  cardCount,
  lastActivityAt,
  members,
  memberCount,
}: BoardCardProps) {
  const [isPending, startTransition] = useTransition();
  const backgroundStyle = getBoardTheme(backgroundColor).header;
  const starDisplay = starred || isPending;
  const memberOverflow = Math.max(0, memberCount - members.length);

  function handleToggleStar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await toggleBoardStarAction(id);
    });
  }

  return (
    <div className="group relative">
      <Link
        href={`/boards/${id}`}
        className="block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-muted"
      >
        <div className="relative h-20 p-3" style={{ background: backgroundStyle }}>
          <span className="line-clamp-2 pr-7 text-sm font-medium text-white">
            {title}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs text-muted-foreground">
              {listCount} {listCount === 1 ? "list" : "lists"} · {cardCount}{" "}
              {cardCount === 1 ? "card" : "cards"}
            </p>
            <p
              className="truncate text-xs text-muted-foreground"
              suppressHydrationWarning
            >
              Updated {formatDistanceToNow(lastActivityAt, { addSuffix: true })}
            </p>
          </div>

          {memberCount > 0 ? (
            <AvatarGroup className="shrink-0">
              {members.map((member) => (
                <MemberAvatar
                  key={member.id}
                  seed={member.id}
                  name={member.name}
                  image={member.image}
                  size="sm"
                />
              ))}
              {memberOverflow > 0 ? (
                <AvatarGroupCount
                  className="text-xs"
                  aria-label={`${memberOverflow} more`}
                >
                  +{memberOverflow}
                </AvatarGroupCount>
              ) : null}
            </AvatarGroup>
          ) : null}
        </div>
      </Link>

      <Button
        type="button"
        variant="ghost"
        onClick={handleToggleStar}
        disabled={isPending}
        aria-label={starDisplay ? "Unstar board" : "Star board"}
        className={`absolute right-2 top-2 h-7 w-7 rounded p-0.5 transition-all hover:bg-white/15 dark:hover:bg-white/10 ${
          starDisplay
            ? "text-yellow-400 hover:text-yellow-300"
            : "text-white/40 hover:text-yellow-300/70"
        }`}
      >
        <HugeiconsIcon
          icon={StarIcon}
          className="size-[18px] drop-shadow-sm"
          fill={starDisplay ? "currentColor" : "none"}
        />
      </Button>
    </div>
  );
}
