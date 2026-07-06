"use client";

import { useState, useTransition } from "react";
import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { getRuleExecutionLogAction } from "@/app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TriggerType } from "@/lib/schemas/automation";

import { ACTION_TYPE_LABELS, TRIGGER_LABELS, type ActionType } from "./rule-descriptors";
import type { NotifyFn } from "./types";

export type LogEntry = {
  id: string;
  ruleId: string;
  ruleName: string | null;
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

export function ExecutionLogPanel({ workspaceId, initialLogs, notify }: ExecutionLogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const [isPending, startTransition] = useTransition();

  function refresh() {
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
          <HugeiconsIcon icon={RefreshIcon} className="size-4" />
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
                    <span className="truncate text-sm font-medium">
                      {log.ruleName ?? "Deleted rule"}
                    </span>
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
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No rule executions yet. Runs appear here as rules fire.
          </p>
        )}
      </div>
    </section>
  );
}
