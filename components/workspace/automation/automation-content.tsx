"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AiMagicIcon, Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ExecutionLogPanel, type LogEntry } from "./execution-log-panel";
import { RuleBuilderDialog } from "./rule-builder-dialog";
import { RuleRow, type RuleRowData } from "./rule-row";
import { type NameLookups } from "./rule-descriptors";
import type { AutomationOptions, NotifyFn, NotifyVariant } from "./types";

type Toast = { message: string; variant: NotifyVariant };

export type AutomationContentProps = {
  workspaceId: string;
  canManage: boolean;
  rules: RuleRowData[];
  options: AutomationOptions;
  logs: LogEntry[];
  lastRunByRule: Record<string, { status: string; executedAt: string }>;
  // Board-level modal (US-067): preset the "New rule" builder's board scope and
  // re-fetch the host's lazily-loaded data after each successful mutation. Both
  // are omitted on the workspace page, which relies on router.refresh() alone.
  defaultBoardId?: string;
  onMutated?: () => void | Promise<void>;
};

/**
 * The shared automation surface — the rule count, the "New rule" builder, the
 * rules list, the execution log, and the toast host. Rendered both by the
 * workspace page (`AutomationManagement`) and the board-level modal
 * (`BoardAutomationDialog`), so the two entry points stay in lockstep.
 *
 * Returns a fragment: the caller's flex container governs vertical spacing.
 */
export function AutomationContent({
  workspaceId,
  canManage,
  rules,
  options,
  logs,
  lastRunByRule,
  defaultBoardId,
  onMutated,
}: AutomationContentProps) {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    // A cycle-loop warning stays until dismissed; errors/confirmations fade.
    if (!toast || toast.variant === "warning") return;
    const timeoutId = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const notify = useCallback<NotifyFn>((message, variant) => {
    setToast({ message, variant });
  }, []);

  // Id → human name maps for the trigger/action summaries.
  const lookups = useMemo<NameLookups>(() => {
    const boards = new Map(options.boards.map((b) => [b.id, b.title]));
    const lists = new Map(options.lists.map((l) => [l.id, l.title]));
    const labels = new Map(options.labels.map((l) => [l.id, l.name]));
    const members = new Map(options.members.map((m) => [m.userId, m.name]));
    return {
      board: (id) => (id ? boards.get(id) ?? "a board" : "a board"),
      list: (id) => (id ? lists.get(id) ?? "a list" : "a list"),
      label: (id) => (id ? labels.get(id) ?? "a label" : "a label"),
      member: (id) => (id ? members.get(id) ?? "a member" : "a member"),
    };
  }, [options]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rules.length} {rules.length === 1 ? "rule" : "rules"}
          {canManage
            ? " · rules run automatically when their trigger fires"
            : " · only workspace admins can manage rules"}
        </p>
        {canManage ? (
          <RuleBuilderDialog
            workspaceId={workspaceId}
            options={options}
            notify={notify}
            defaultBoardId={defaultBoardId}
            onMutated={onMutated}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={PlusSignIcon} className="size-4" aria-hidden="true" />
                New rule
              </Button>
            }
          />
        ) : null}
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        {rules.length > 0 ? (
          <div className="divide-y">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                workspaceId={workspaceId}
                rule={rule}
                options={options}
                lookups={lookups}
                canManage={canManage}
                lastRun={lastRunByRule[rule.id] ?? null}
                notify={notify}
                onMutated={onMutated}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <HugeiconsIcon icon={AiMagicIcon} className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No automation rules yet</p>
              <p className="text-sm text-muted-foreground">
                {canManage
                  ? "Create a rule to run actions automatically when cards change."
                  : "A workspace admin can create rules to automate card actions."}
              </p>
            </div>
          </div>
        )}
      </section>

      <ExecutionLogPanel
        workspaceId={workspaceId}
        initialLogs={logs}
        notify={notify}
        onRefresh={onMutated}
      />

      {toast ? (
        <div
          // Errors interrupt (assertive); info/warning announce politely.
          role={toast.variant === "error" ? "alert" : "status"}
          aria-live={toast.variant === "error" ? "assertive" : "polite"}
          className={cn(
            "fixed right-4 bottom-4 z-[60] flex max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg",
            toast.variant === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-border bg-card text-foreground",
          )}
        >
          {toast.variant === "warning" ? (
            <span className="mt-0.5 shrink-0 font-medium">Heads up:</span>
          ) : null}
          <span className="min-w-0">{toast.message}</span>
          {toast.variant === "warning" ? (
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss warning"
              className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
