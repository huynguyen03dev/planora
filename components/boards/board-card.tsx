import Link from "next/link";

import { defaultBoardGradient } from "./styles";

type BoardCardProps = {
  id: string;
  title: string;
  backgroundColor?: string | null;
};

export function BoardCard({ id, title, backgroundColor }: BoardCardProps) {
  const backgroundStyle = backgroundColor ?? defaultBoardGradient;

  return (
    <Link
      href={`/boards/${id}`}
      className="block h-24 w-44 rounded-lg p-3 transition-opacity hover:opacity-90"
      style={{ background: backgroundStyle }}
    >
      <span className="line-clamp-2 text-sm font-medium text-white">{title}</span>
    </Link>
  );
}
