"use client";

import { useTransition } from "react";
import Link from "next/link";
import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { toggleBoardStarAction } from "@/app/(authenticated)/(dashboard)/boards/actions";

import { defaultBoardGradient } from "./styles";

type BoardCardProps = {
  id: string;
  title: string;
  backgroundColor?: string | null;
  starred?: boolean;
};

export function BoardCard({
  id,
  title,
  backgroundColor,
  starred = false,
}: BoardCardProps) {
  const [isPending, startTransition] = useTransition();
  const backgroundStyle = backgroundColor ?? defaultBoardGradient;
  const starDisplay = starred || isPending;

  function handleToggleStar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await toggleBoardStarAction(id);
    });
  }

  return (
    <div className="relative h-24 w-44">
      <Link
        href={`/boards/${id}`}
        className="block h-full w-full rounded-lg p-3 transition-opacity hover:opacity-90"
        style={{ background: backgroundStyle }}
      >
        <span className="line-clamp-2 pr-7 text-sm font-medium text-white">
          {title}
        </span>
      </Link>
      <button
        type="button"
        onClick={handleToggleStar}
        disabled={isPending}
        aria-label={starDisplay ? "Unstar board" : "Star board"}
        className={`absolute right-1 top-1 rounded p-0.5 transition-all ${
          starDisplay
            ? "text-yellow-400 hover:text-yellow-300"
            : "text-white/20 hover:text-yellow-300/70"
        }`}
      >
        <HugeiconsIcon
          icon={StarIcon}
          className="size-[18px] drop-shadow-sm"
        />
      </button>
    </div>
  );
}
