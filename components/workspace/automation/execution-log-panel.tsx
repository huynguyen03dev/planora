"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshIcon, TimelineListIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { getRuleExecutionLogAction } from "@/app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TriggerType } from "@/lib/schemas/automation";

import { ACTION_TYPE_LABELS, TRIGGER_LABELS, type ActionType } from "./rule-descriptors";
import type { NotifyFn } from "./types";

export type LogEntry = {
  id: string;
  // null once the rule is deleted (log survives via SetNull); ruleName is
  // denormalized so the entry always has a display name.
  ruleId: string | null;
  ruleName: string;
  chainDepth: number;
  actionType: string;
  triggerType: string;
  status: string;
  error: string | null;
  executedAt: string;
};

type ExecutionLogPanelProps = {
  workspaceId: string;
  initialLogs: LogEntry[];
  notify: NotifyFn;
  // Host-driven refresh (board modal, US-067). When provided, the Refresh
  // button re-fetches through the host (which stays board-scoped) instead of
  // the built-in workspace-wide fetch; the fresh logs flow back via
  // `initialLogs`. Returns a promise so the button can show its pending state
  // for the host round-trip too. Omitted on the workspace page, which
  // self-refreshes.
  onRefresh?: () => void | Promise<void>;
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "error") return "destructive";
  if (status === "success") return "outline";
  return "secondary";
}

function actionLabel(type: string): string {
  return ACTION_TYPE_LABELS[type as ActionType] ?? type;
}

function triggerLabel(type: string): string {
  return TRIGGER_LABELS[type as TriggerType] ?? type;
}

export function ExecutionLogPanel({
  workspaceId,
  initialLogs,
  notify,
  onRefresh,
}: ExecutionLogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const [isPending, startTransition] = useTransition();

  // Reflect externally-supplied logs when a host re-fetches (board modal). On
  // the workspace page `initialLogs` is stable between self-refreshes, so this
  // never fights the built-in fetch below.
  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  function refresh() {
    if (onRefresh) {
      // Drive the host re-fetch inside the transition so the button shows the
      // same pending affordance it does for the built-in fetch below.
      startTransition(async () => {
        await onRefresh();
      });
      return;
    }
    startTransition(async () => {
      const result = await getRuleExecutionLogAction({ workspaceId });
      if (!result.success) {
        notify(result.error, "error");
        return;
      }
      setLogs(result.logs);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Execution log{logs.length > 0 ? ` (${logs.length})` : ""}
        </h2>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={isPending}>
          <HugeiconsIcon icon={RefreshIcon} className="size-4" aria-hidden="true" />
          {isPending ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {logs.length > 0 ? (
          <div className="divide-y">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{log.ruleName}</span>
                    {/* The rule survives in the log after deletion (ruleId goes
                        null); flag it so the name here — which has no matching
                        row in the rules list above — is explained. */}
                    {log.ruleId === null ? (
                      <span className="text-xs text-muted-foreground">(deleted)</span>
                    ) : null}
                    <Badge variant={statusVariant(log.status)} className="capitalize">
                      {log.status}
                    </Badge>
                    {log.chainDepth > 0 ? (
                      <span className="text-xs text-muted-foreground">chain depth {log.chainDepth}</span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {triggerLabel(log.triggerType)} → {actionLabel(log.actionType)}
                  </p>
                  {log.error ? (
                    <p className="truncate text-xs text-destructive">{log.error}</p>
                  ) : null}
                </div>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={log.executedAt}>
                  {new Date(log.executedAt).toLocaleString()}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <HugeiconsIcon icon={TimelineListIcon} className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No execution logs yet</p>
              <p className="text-sm text-muted-foreground">
                Runs appear here as rules fire.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
