"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Delete02Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  deleteRuleAction,
  toggleRuleEnabledAction,
} from "@/app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { TriggerType } from "@/lib/schemas/automation";

import { RuleBuilderDialog, type EditableRule } from "./rule-builder-dialog";
import { summarizeActions, summarizeTrigger, type NameLookups } from "./rule-descriptors";
import type { AutomationOptions, NotifyFn } from "./types";

export type RuleRowData = EditableRule & { boardTitle: string | null };

type RuleRowProps = {
  workspaceId: string;
  rule: RuleRowData;
  options: AutomationOptions;
  lookups: NameLookups;
  canManage: boolean;
  lastRun: { status: string; executedAt: string } | null;
  notify: NotifyFn;
  // Called after a successful toggle/edit/delete in addition to router.refresh(),
  // so a lazily-loaded host (the board modal) can re-fetch its own data.
  onMutated?: () => void | Promise<void>;
};

const STATUS_TONE: Record<string, string> = {
  success: "text-foreground",
  skipped: "text-muted-foreground",
  halted: "text-muted-foreground",
  error: "text-destructive",
};

export function RuleRow({
  workspaceId,
  rule,
  options,
  lookups,
  canManage,
  lastRun,
  notify,
  onMutated,
}: RuleRowProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Reflect the toggle immediately; useOptimistic auto-reconciles to the server
  // prop once the transition (and its router.refresh) settles.
  const [optimisticEnabled, setOptimisticEnabled] = useOptimistic(rule.enabled);

  const actions = Array.isArray(rule.actions) ? rule.actions : [];

  function handleToggle(next: boolean) {
    startTransition(async () => {
      setOptimisticEnabled(next);
      const result = await toggleRuleEnabledAction({ id: rule.id, enabled: next });
      if (!result.success) {
        notify(result.error, "error");
      }
      router.refresh();
      onMutated?.();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteRuleAction({ id: rule.id });
      if (!result.success) {
        notify(result.error, "error");
        return;
      }
      setConfirmOpen(false);
      notify("Rule deleted", "info");
      router.refresh();
      onMutated?.();
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{rule.name}</span>
          {rule.boardTitle ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              {rule.boardTitle}
            </span>
          ) : null}
          {!optimisticEnabled ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              Disabled
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">When</span>{" "}
          {summarizeTrigger(rule.triggerType as TriggerType, rule.triggerConfig, lookups)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">Then</span>{" "}
          {summarizeActions(actions, lookups)}
        </p>
        {lastRun ? (
          <p className="text-xs text-muted-foreground">
            Last run{" "}
            <span className={STATUS_TONE[lastRun.status] ?? "text-muted-foreground"}>
              {lastRun.status}
            </span>{" "}
            · {new Date(lastRun.executedAt).toLocaleString()}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/70">Never run</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Switch
          checked={optimisticEnabled}
          onCheckedChange={handleToggle}
          disabled={!canManage || isPending}
          aria-label={optimisticEnabled ? "Disable rule" : "Enable rule"}
        />
        {canManage ? (
          <>
            <RuleBuilderDialog
              workspaceId={workspaceId}
              options={options}
              initialRule={rule}
              notify={notify}
              onMutated={onMutated}
              trigger={
                <Button variant="ghost" size="icon" aria-label={`Edit ${rule.name}`}>
                  <HugeiconsIcon icon={PencilEdit01Icon} className="size-4" aria-hidden="true" />
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${rule.name}`}
              onClick={() => setConfirmOpen(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" aria-hidden="true" />
            </Button>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
                  <AlertDialogDescription>
                    “{rule.name}” will stop firing and its configuration is removed. Past
                    execution-log entries are kept. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete();
                    }}
                    disabled={isPending}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    {isPending ? "Deleting..." : "Delete rule"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
      </div>
    </div>
  );
}
