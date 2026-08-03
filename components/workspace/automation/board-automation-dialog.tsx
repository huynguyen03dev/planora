"use client";

import { useCallback, useState } from "react";
import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { getBoardAutomationDataAction } from "@/app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions";
import { boardHeaderControlClass } from "@/components/boards/board-header-controls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { AutomationView } from "@/lib/automation/view";
import { cn } from "@/lib/utils";

import { AutomationContent } from "./automation-content";

type BoardAutomationDialogProps = {
  boardId: string;
  boardTitle: string;
};

/**
 * Loading placeholder shaped like `AutomationContent` (count row + rules list +
 * log). Matching the real layout's height keeps the modal from resizing when
 * the lazily-fetched data lands.
 */
function AutomationSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading automation">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="divide-y overflow-hidden rounded-lg border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <div className="space-y-2 rounded-lg border p-4">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    </div>
  );
}

type LoadedData = { workspaceId: string; canManage: boolean } & AutomationView;

/**
 * Board-level automation entry (US-067). A header control that opens a modal
 * managing the rules that run on this board — a Trello-style per-board Butler
 * surface, without leaving the board. Data is fetched lazily on open (so a
 * board that never touches automation adds zero queries to its page load) and
 * re-fetched after each mutation via `AutomationContent`'s `onMutated`.
 */
export function BoardAutomationDialog({ boardId, boardTitle }: BoardAutomationDialogProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Returns the promise so callers that re-fetch after a mutation (the log
  // panel's Refresh, RuleRow/RuleBuilder's onMutated) can await the round-trip
  // and reflect its pending state.
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return getBoardAutomationDataAction({ boardId })
      .then((res) => {
        if (res.success) {
          setData({
            workspaceId: res.workspaceId,
            canManage: res.canManage,
            options: res.options,
            rules: res.rules,
            logs: res.logs,
            lastRunByRule: res.lastRunByRule,
          });
        } else {
          setError(res.error);
        }
      })
      .catch(() => setError("Failed to load automation"))
      .finally(() => setLoading(false));
  }, [boardId]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Re-fetch on every open so the modal always reflects the latest rules.
    if (next) load();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("gap-1.5", boardHeaderControlClass)}
        >
          <HugeiconsIcon icon={AiMagicIcon} size={16} aria-hidden="true" />
          Automation
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Automation</DialogTitle>
          <DialogDescription>
            Rules that run on <span className="font-medium text-foreground">{boardTitle}</span>,
            plus workspace-wide rules. New rules default to this board.
          </DialogDescription>
        </DialogHeader>

        {/* Native flex scroll container (US-066 dialog-overflow fix): a flex-1
            min-h-0 item with overflow-y-auto clips reliably where radix
            ScrollArea's percentage-height viewport did not. */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading && !data ? (
            <AutomationSkeleton />
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-destructive" role="alert">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={load}>
                Try again
              </Button>
            </div>
          ) : data ? (
            <div className="flex flex-col gap-6">
              <AutomationContent
                workspaceId={data.workspaceId}
                canManage={data.canManage}
                rules={data.rules}
                options={data.options}
                logs={data.logs}
                lastRunByRule={data.lastRunByRule}
                defaultBoardId={boardId}
                onMutated={load}
              />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
