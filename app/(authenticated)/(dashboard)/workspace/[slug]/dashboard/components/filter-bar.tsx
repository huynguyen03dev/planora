"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Board {
  id: string;
  title: string;
}

interface Member {
  id: string;
  name: string;
  image: string | null;
}

interface FilterBarProps {
  workspaceSlug: string;
  boards: Board[];
  members: Member[];
  currentFilters: {
    board?: string;
    member?: string;
    range?: "7d" | "30d" | "90d";
    from?: string;
    to?: string;
    includeArchivedBoards?: string;
  };
}

export function FilterBar({
  workspaceSlug,
  boards,
  members,
  currentFilters,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilters = (
    updates: Record<string, string | undefined>,
    removeKeys: string[] = [],
  ) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const key of removeKeys) {
      params.delete(key);
    }

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const query = params.toString();
    router.push(
      query
        ? `/workspace/${workspaceSlug}/dashboard?${query}`
        : `/workspace/${workspaceSlug}/dashboard`,
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <label htmlFor="range" className="text-sm font-medium">
          Range:
        </label>
        <select
          id="range"
          value={currentFilters.range ?? "30d"}
          onChange={(e) => updateFilters({ range: e.target.value }, ["from", "to"])}
          className="rounded border bg-background px-2 py-1 text-sm"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="board" className="text-sm font-medium">
          Board:
        </label>
        <select
          id="board"
          value={currentFilters.board ?? ""}
          onChange={(e) =>
            updateFilters({ board: e.target.value || undefined })
          }
          className="rounded border bg-background px-2 py-1 text-sm"
        >
          <option value="">All boards</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="member" className="text-sm font-medium">
          Member:
        </label>
        <select
          id="member"
          value={currentFilters.member ?? ""}
          onChange={(e) =>
            updateFilters({ member: e.target.value || undefined })
          }
          className="rounded border bg-background px-2 py-1 text-sm"
        >
          <option value="">All members</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={currentFilters.includeArchivedBoards === "1"}
          onChange={(e) =>
            updateFilters({
              includeArchivedBoards: e.target.checked ? "1" : undefined,
            })
          }
          className="rounded border"
        />
        Include archived boards
      </label>

      <div className="flex items-center gap-2">
        <label htmlFor="from" className="text-sm font-medium">
          From:
        </label>
        <input
          id="from"
          type="date"
          value={currentFilters.from ?? ""}
          onChange={(e) => updateFilters({ from: e.target.value || undefined })}
          className="rounded border bg-background px-2 py-1 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="to" className="text-sm font-medium">
          To:
        </label>
        <input
          id="to"
          type="date"
          value={currentFilters.to ?? ""}
          onChange={(e) => updateFilters({ to: e.target.value || undefined })}
          className="rounded border bg-background px-2 py-1 text-sm"
        />
      </div>
    </div>
  );
}
