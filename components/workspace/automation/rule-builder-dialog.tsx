"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown01Icon, ArrowUp01Icon, Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  createRuleAction,
  updateRuleAction,
} from "@/app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ActionStep, TriggerType } from "@/lib/schemas/automation";

import {
  ACTION_TYPE_LABELS,
  ACTION_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  RECIPIENT_TOKEN_OPTIONS,
  REMOVE_SCOPE_ALL,
  TRIGGER_OPTIONS,
  triggerConfigFields,
  type ActionType,
} from "./rule-descriptors";
import type { AutomationOptions, NotifyFn } from "./types";

// Radix Select forbids an empty-string item value, so "no filter" uses a
// sentinel that we translate back to `undefined` when building the payload.
const ANY = "__any__";

type ConfigDraft = {
  listId: string;
  fromListId: string;
  labelId: string;
  priority: string;
  beforeMinutes: string;
};

type Draft = {
  name: string;
  description: string;
  enabled: boolean;
  boardId: string;
  triggerType: TriggerType;
  config: ConfigDraft;
  actions: ActionStep[];
};

export type EditableRule = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  boardId: string | null;
  triggerType: string;
  triggerConfig: unknown;
  actions: unknown;
};

type RuleBuilderDialogProps = {
  workspaceId: string;
  options: AutomationOptions;
  trigger: ReactNode;
  initialRule?: EditableRule;
  notify: NotifyFn;
};

function emptyConfig(): ConfigDraft {
  return { listId: ANY, fromListId: ANY, labelId: ANY, priority: ANY, beforeMinutes: "" };
}

function defaultStep(type: ActionType, options: AutomationOptions): ActionStep {
  switch (type) {
    case "move-card-to-list":
      return { type, targetListId: options.lists[0]?.id ?? "" };
    case "set-priority":
      return { type, priority: "MEDIUM" };
    case "add-label":
      return { type, labelId: options.labels[0]?.id ?? "" };
    case "remove-label":
      return { type, labelId: options.labels[0]?.id ?? "" };
    case "assign-member":
      return { type, recipient: "card-creator" };
    case "remove-member":
      return { type, scope: "all" };
    case "set-completion":
      return { type, completed: true };
    case "notify-member":
      return { type, recipient: "card-creator", message: "" };
  }
}

function draftFromRule(rule: EditableRule): Draft {
  const config = (rule.triggerConfig ?? {}) as Record<string, unknown>;
  return {
    name: rule.name,
    description: rule.description ?? "",
    enabled: rule.enabled,
    boardId: rule.boardId ?? "",
    triggerType: rule.triggerType as TriggerType,
    config: {
      listId: typeof config.listId === "string" ? config.listId : ANY,
      fromListId: typeof config.fromListId === "string" ? config.fromListId : ANY,
      labelId: typeof config.labelId === "string" ? config.labelId : ANY,
      priority: typeof config.priority === "string" ? config.priority : ANY,
      beforeMinutes:
        typeof config.beforeMinutes === "number" ? String(config.beforeMinutes) : "",
    },
    actions: Array.isArray(rule.actions) ? (rule.actions as ActionStep[]) : [],
  };
}

function freshDraft(options: AutomationOptions): Draft {
  return {
    name: "",
    description: "",
    enabled: true,
    boardId: "",
    triggerType: "card-created",
    config: emptyConfig(),
    actions: [defaultStep("set-priority", options)],
  };
}

export function RuleBuilderDialog({
  workspaceId,
  options,
  trigger,
  initialRule,
  notify,
}: RuleBuilderDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() =>
    initialRule ? draftFromRule(initialRule) : freshDraft(options),
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isEdit = Boolean(initialRule);
  const fields = triggerConfigFields(draft.triggerType);

  // When the rule is scoped to a board, only that board's lists/labels are
  // offered — a filter or action target on another board would make the rule
  // un-fireable (trigger) or a surprise cross-board write (action). With no
  // board scope ("all boards"), every workspace list/label is available.
  const scopedOptions = useMemo<AutomationOptions>(() => {
    if (!draft.boardId) return options;
    return {
      boards: options.boards,
      lists: options.lists.filter((l) => l.boardId === draft.boardId),
      labels: options.labels.filter((l) => l.boardId === draft.boardId),
      members: options.members,
    };
  }, [options, draft.boardId]);

  function resetDraft() {
    setDraft(initialRule ? draftFromRule(initialRule) : freshDraft(options));
    setError("");
  }

  function update(patch: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setError("");
  }

  function updateConfig(patch: Partial<ConfigDraft>) {
    setDraft((prev) => ({ ...prev, config: { ...prev.config, ...patch } }));
    setError("");
  }

  // Changing board scope reconciles any now-off-board selections: config
  // list/label filters reset to "any", and action targets that left the scope
  // fall back to a valid on-board default (or empty → caught at submit).
  function handleBoardChange(boardId: string) {
    setDraft((prev) => {
      const lists = boardId ? options.lists.filter((l) => l.boardId === boardId) : options.lists;
      const labels = boardId ? options.labels.filter((l) => l.boardId === boardId) : options.labels;
      const listIds = new Set(lists.map((l) => l.id));
      const labelIds = new Set(labels.map((l) => l.id));

      const config: ConfigDraft = {
        ...prev.config,
        listId:
          prev.config.listId !== ANY && !listIds.has(prev.config.listId)
            ? ANY
            : prev.config.listId,
        fromListId:
          prev.config.fromListId !== ANY && !listIds.has(prev.config.fromListId)
            ? ANY
            : prev.config.fromListId,
        labelId:
          prev.config.labelId !== ANY && !labelIds.has(prev.config.labelId)
            ? ANY
            : prev.config.labelId,
      };

      const actions = prev.actions.map((step) => {
        if (step.type === "move-card-to-list" && !listIds.has(step.targetListId)) {
          return { ...step, targetListId: lists[0]?.id ?? "" };
        }
        if ((step.type === "add-label" || step.type === "remove-label") && !labelIds.has(step.labelId)) {
          return { ...step, labelId: labels[0]?.id ?? "" };
        }
        return step;
      });

      return { ...prev, boardId, config, actions };
    });
    setError("");
  }

  function setStep(index: number, step: ActionStep) {
    setDraft((prev) => ({
      ...prev,
      actions: prev.actions.map((s, i) => (i === index ? step : s)),
    }));
    setError("");
  }

  function addStep() {
    setDraft((prev) => ({
      ...prev,
      actions: [...prev.actions, defaultStep("set-priority", options)],
    }));
  }

  function removeStep(index: number) {
    setDraft((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    setDraft((prev) => {
      if (target < 0 || target >= prev.actions.length) return prev;
      const next = [...prev.actions];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, actions: next };
    });
  }

  /** Assemble the clean payload, or return an error string. */
  function buildPayload(): { payload: Record<string, unknown> } | { error: string } {
    if (draft.name.trim().length === 0) return { error: "Name is required" };
    if (draft.actions.length === 0) return { error: "Add at least one action" };

    // Guard the id-bearing steps the schema only shape-checks.
    for (const step of draft.actions) {
      if (step.type === "move-card-to-list" && !step.targetListId) {
        return { error: "Choose a destination list for the move action" };
      }
      if ((step.type === "add-label" || step.type === "remove-label") && !step.labelId) {
        return { error: "Choose a label for the label action" };
      }
    }

    const triggerConfig: Record<string, unknown> = {};
    if (fields.list && draft.config.listId !== ANY) triggerConfig.listId = draft.config.listId;
    if (fields.fromList && draft.config.fromListId !== ANY) {
      triggerConfig.fromListId = draft.config.fromListId;
    }
    if (fields.label && draft.config.labelId !== ANY) triggerConfig.labelId = draft.config.labelId;
    if (fields.priority && draft.config.priority !== ANY) {
      triggerConfig.priority = draft.config.priority;
    }
    if (fields.beforeMinutes) {
      const minutes = Number.parseInt(draft.config.beforeMinutes, 10);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return { error: "Enter how many minutes before the due date to trigger" };
      }
      triggerConfig.beforeMinutes = minutes;
    }

    // Strip an empty notify message so the optional field stays absent.
    const actions = draft.actions.map((step) =>
      step.type === "notify-member" && !step.message?.trim()
        ? { type: step.type, recipient: step.recipient }
        : step,
    );

    const base = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      enabled: draft.enabled,
      boardId: draft.boardId || undefined,
      triggerType: draft.triggerType,
      triggerConfig,
      actions,
    };

    return {
      payload: isEdit ? { id: initialRule!.id, ...base } : { workspaceId, ...base },
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateRuleAction(built.payload)
        : await createRuleAction(built.payload);

      if (!result.success) {
        setError(result.error);
        return;
      }

      const warnings = result.warnings ?? [];
      setOpen(false);
      router.refresh();
      if (warnings.length > 0) {
        notify(warnings.join("  •  "), "warning");
      } else {
        notify(isEdit ? "Rule updated" : "Rule created", "info");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        setOpen(next);
        if (next) {
          resetDraft();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit rule" : "New automation rule"}</DialogTitle>
          <DialogDescription>
            When the trigger fires, the actions run in order. Chains are capped at depth 5.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          <ScrollArea className="min-h-0 flex-1 pr-4">
            <div className="space-y-5">
              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              {/* Name + description */}
              <div className="space-y-2">
                <Label htmlFor="rule-name">Name</Label>
                <Input
                  id="rule-name"
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="e.g. When done, notify the creator"
                  disabled={isPending}
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-description">Description (optional)</Label>
                <Textarea
                  id="rule-description"
                  value={draft.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="What this rule does and why"
                  disabled={isPending}
                  rows={2}
                />
              </div>

              {/* Scope */}
              <div className="space-y-2">
                <Label htmlFor="rule-board">Board scope</Label>
                <Select
                  value={draft.boardId || ANY}
                  onValueChange={(v) => handleBoardChange(v === ANY ? "" : v)}
                  disabled={isPending}
                >
                  <SelectTrigger id="rule-board" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>All boards in this workspace</SelectItem>
                    {options.boards.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Trigger */}
              <div className="space-y-3 rounded-lg border bg-card p-4">
                <div className="space-y-2">
                  <Label htmlFor="rule-trigger" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    When
                  </Label>
                  <Select
                    value={draft.triggerType}
                    onValueChange={(v) =>
                      update({ triggerType: v as TriggerType, config: emptyConfig() })
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger id="rule-trigger" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {fields.list ? (
                    <ConfigListSelect
                      label={draft.triggerType === "card-moved-to-list" ? "Destination list" : "In list"}
                      value={draft.config.listId}
                      lists={scopedOptions.lists}
                      onChange={(v) => updateConfig({ listId: v })}
                      disabled={isPending}
                    />
                  ) : null}
                  {fields.fromList ? (
                    <ConfigListSelect
                      label="Moved from list"
                      value={draft.config.fromListId}
                      lists={scopedOptions.lists}
                      onChange={(v) => updateConfig({ fromListId: v })}
                      disabled={isPending}
                    />
                  ) : null}
                  {fields.label ? (
                    <div className="space-y-2">
                      <Label className="text-sm">Label added</Label>
                      <Select
                        value={draft.config.labelId}
                        onValueChange={(v) => updateConfig({ labelId: v })}
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANY}>Any label</SelectItem>
                          {scopedOptions.labels.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.name} · {l.boardTitle}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {fields.priority ? (
                    <div className="space-y-2">
                      <Label className="text-sm">Priority is</Label>
                      <Select
                        value={draft.config.priority}
                        onValueChange={(v) => updateConfig({ priority: v })}
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANY}>Any priority</SelectItem>
                          {PRIORITY_OPTIONS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {fields.beforeMinutes ? (
                    <div className="space-y-2">
                      <Label htmlFor="rule-before" className="text-sm">
                        Minutes before due
                      </Label>
                      <Input
                        id="rule-before"
                        type="number"
                        min={1}
                        value={draft.config.beforeMinutes}
                        onChange={(e) => updateConfig({ beforeMinutes: e.target.value })}
                        placeholder="e.g. 60"
                        disabled={isPending}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Then (in order)
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addStep}
                    disabled={isPending || draft.actions.length >= 20}
                  >
                    <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
                    Add action
                  </Button>
                </div>

                <div className="space-y-2">
                  {draft.actions.map((step, index) => (
                    <ActionStepEditor
                      key={index}
                      step={step}
                      index={index}
                      total={draft.actions.length}
                      options={scopedOptions}
                      disabled={isPending}
                      onChange={(s) => setStep(index, s)}
                      onRemove={() => removeStep(index)}
                      onMove={(dir) => moveStep(index, dir)}
                    />
                  ))}
                </div>
              </div>

              {/* Enabled */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="rule-enabled">Enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    A disabled rule is saved but never fires.
                  </p>
                </div>
                <Switch
                  id="rule-enabled"
                  checked={draft.enabled}
                  onCheckedChange={(checked) => update({ enabled: checked })}
                  disabled={isPending}
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEdit ? "Save changes" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function ConfigListSelect({
  label,
  value,
  lists,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  lists: AutomationOptions["lists"];
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any list</SelectItem>
          {lists.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.title} · {l.boardTitle}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ActionStepEditor({
  step,
  index,
  total,
  options,
  disabled,
  onChange,
  onRemove,
  onMove,
}: {
  step: ActionStep;
  index: number;
  total: number;
  options: AutomationOptions;
  disabled: boolean;
  onChange: (step: ActionStep) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-background p-3">
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onMove(-1)}
          disabled={disabled || index === 0}
          aria-label="Move action up"
          className="text-muted-foreground"
        >
          <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onMove(1)}
          disabled={disabled || index === total - 1}
          aria-label="Move action down"
          className="text-muted-foreground"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
        </Button>
      </div>

      <div className="grid flex-1 gap-2 sm:grid-cols-2">
        <Select
          value={step.type}
          onValueChange={(v) => onChange(defaultStep(v as ActionType, options))}
          disabled={disabled}
        >
          <SelectTrigger className="w-full" aria-label="Action type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ActionStepParam step={step} options={options} disabled={disabled} onChange={onChange} />
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled || total === 1}
        aria-label={`Remove ${ACTION_TYPE_LABELS[step.type]} action`}
        title={total === 1 ? "A rule needs at least one action" : "Remove action"}
        className="pt-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-30"
      >
        <HugeiconsIcon icon={Delete02Icon} className="size-4" />
      </button>
    </div>
  );
}

/** The per-type parameter control for one action step. */
function ActionStepParam({
  step,
  options,
  disabled,
  onChange,
}: {
  step: ActionStep;
  options: AutomationOptions;
  disabled: boolean;
  onChange: (step: ActionStep) => void;
}) {
  switch (step.type) {
    case "move-card-to-list":
      return (
        <Select
          value={step.targetListId || undefined}
          onValueChange={(v) => onChange({ ...step, targetListId: v })}
          disabled={disabled}
        >
          <SelectTrigger className="w-full" aria-label="Destination list">
            <SelectValue placeholder="Choose a list" />
          </SelectTrigger>
          <SelectContent>
            {options.lists.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.title} · {l.boardTitle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "set-priority":
      return (
        <Select
          value={step.priority}
          onValueChange={(v) => onChange({ ...step, priority: v as typeof step.priority })}
          disabled={disabled}
        >
          <SelectTrigger className="w-full" aria-label="Priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "add-label":
    case "remove-label":
      return (
        <Select
          value={step.labelId || undefined}
          onValueChange={(v) => onChange({ ...step, labelId: v })}
          disabled={disabled}
        >
          <SelectTrigger className="w-full" aria-label="Label">
            <SelectValue placeholder="Choose a label" />
          </SelectTrigger>
          <SelectContent>
            {options.labels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name} · {l.boardTitle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "assign-member":
    case "notify-member":
      return (
        <div className="space-y-2">
          <Select
            value={step.recipient}
            onValueChange={(v) => onChange({ ...step, recipient: v })}
            disabled={disabled}
          >
            <SelectTrigger className="w-full" aria-label="Recipient">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECIPIENT_TOKEN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
              {options.members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {step.type === "notify-member" ? (
            <Input
              value={step.message ?? ""}
              onChange={(e) => onChange({ ...step, message: e.target.value })}
              placeholder="Optional message"
              disabled={disabled}
              aria-label="Notification message"
            />
          ) : null}
        </div>
      );
    case "remove-member":
      return (
        <Select
          value={step.scope}
          onValueChange={(v) => onChange({ ...step, scope: v })}
          disabled={disabled}
        >
          <SelectTrigger className="w-full" aria-label="Remove scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={REMOVE_SCOPE_ALL.value}>{REMOVE_SCOPE_ALL.label}</SelectItem>
            {options.members.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "set-completion":
      return (
        <Select
          value={step.completed ? "complete" : "reopen"}
          onValueChange={(v) => onChange({ ...step, completed: v === "complete" })}
          disabled={disabled}
        >
          <SelectTrigger className="w-full" aria-label="Completion state">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="complete">Mark complete</SelectItem>
            <SelectItem value="reopen">Reopen</SelectItem>
          </SelectContent>
        </Select>
      );
    default:
      return null;
  }
}
