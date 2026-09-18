"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
        <Label htmlFor="range" className="text-sm font-medium">
          Range:
        </Label>
        <Select
          value={currentFilters.range ?? "30d"}
          onValueChange={(val) => updateFilters({ range: val as "7d" | "30d" | "90d" }, ["from", "to"])}
        >
          <SelectTrigger id="range" size="sm" className="w-[140px]">
            <SelectValue placeholder="Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="board" className="text-sm font-medium">
          Board:
        </Label>
        <Select
          value={currentFilters.board ?? "all"}
          onValueChange={(val) => updateFilters({ board: val === "all" ? undefined : val })}
        >
          <SelectTrigger id="board" size="sm" className="w-[160px]">
            <SelectValue placeholder="All boards" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All boards</SelectItem>
            {boards.map((board) => (
              <SelectItem key={board.id} value={board.id}>
                {board.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="member" className="text-sm font-medium">
          Member:
        </Label>
        <Select
          value={currentFilters.member ?? "all"}
          onValueChange={(val) => updateFilters({ member: val === "all" ? undefined : val })}
        >
          <SelectTrigger id="member" size="sm" className="w-[160px]">
            <SelectValue placeholder="All members" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All members</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          id="includeArchivedBoards"
          checked={currentFilters.includeArchivedBoards === "1"}
          onCheckedChange={(checked) =>
            updateFilters({
              includeArchivedBoards: checked ? "1" : undefined,
            })
          }
        />
        <Label htmlFor="includeArchivedBoards" className="cursor-pointer font-normal text-sm">
          Include archived boards
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="from" className="text-sm font-medium">
          From:
        </Label>
        <Input
          id="from"
          type="date"
          value={currentFilters.from ?? ""}
          onChange={(e) => updateFilters({ from: e.target.value || undefined })}
          className={`h-8 py-1 text-sm w-36 ${currentFilters.from ? "" : "text-muted-foreground"}`}
        />
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="to" className="text-sm font-medium">
          To:
        </Label>
        <Input
          id="to"
          type="date"
          value={currentFilters.to ?? ""}
          onChange={(e) => updateFilters({ to: e.target.value || undefined })}
          className={`h-8 py-1 text-sm w-36 ${currentFilters.to ? "" : "text-muted-foreground"}`}
        />
      </div>
    </div>
  );
}
