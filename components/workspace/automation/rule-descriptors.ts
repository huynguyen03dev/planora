// Shared, presentation-only descriptors for the automation UI: human labels for
// trigger/action types and small summarizers that turn a rule's stored
// triggerConfig / actions JSON into short readable strings. Pure (no JSX, no
// DB) so both the rule row and the builder can share the same vocabulary.

import type { ActionStep, TriggerType } from "@/lib/schemas/automation";

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  "card-created": "Card is created",
  "card-moved-to-list": "Card is moved to a list",
  "card-completed": "Card is completed",
  "card-reopened": "Card is reopened",
  "label-added-to-card": "Label is added to a card",
  "member-assigned": "Member is assigned to a card",
  "due-date-approaching": "Due date is approaching",
};

export const TRIGGER_OPTIONS = Object.entries(TRIGGER_LABELS).map(
  ([value, label]) => ({ value: value as TriggerType, label }),
);

export type ActionType = ActionStep["type"];

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  "move-card-to-list": "Move card to list",
  "set-priority": "Set priority",
  "add-label": "Add label",
  "remove-label": "Remove label",
  "assign-member": "Assign member",
  "remove-member": "Remove member",
  "set-completion": "Set completion",
  "notify-member": "Notify member",
};

export const ACTION_TYPE_OPTIONS = Object.entries(ACTION_TYPE_LABELS).map(
  ([value, label]) => ({ value: value as ActionType, label }),
);

export const PRIORITY_OPTIONS = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

// Dynamic recipient tokens (decision 0022 R2). A specific workspace member is
// represented by their user id; these are the non-id tokens.
export const RECIPIENT_TOKEN_OPTIONS = [
  { value: "card-creator", label: "The card's creator" },
  { value: "card-assignees", label: "The card's assignees" },
] as const;

export const REMOVE_SCOPE_ALL = { value: "all", label: "All assignees" } as const;

/** Lookup maps the summarizers use to resolve ids to human names. */
export type NameLookups = {
  board: (id: string | null | undefined) => string;
  list: (id: string | null | undefined) => string;
  label: (id: string | null | undefined) => string;
  member: (id: string | null | undefined) => string;
};

function recipientLabel(token: string, lookups: NameLookups): string {
  if (token === "card-creator") return "the card's creator";
  if (token === "card-assignees") return "the card's assignees";
  return lookups.member(token);
}

/** One-line human summary of a single action step. */
export function summarizeActionStep(step: ActionStep, lookups: NameLookups): string {
  switch (step.type) {
    case "move-card-to-list":
      return `Move card to “${lookups.list(step.targetListId)}”`;
    case "set-priority":
      return `Set priority to ${step.priority.charAt(0) + step.priority.slice(1).toLowerCase()}`;
    case "add-label":
      return `Add label “${lookups.label(step.labelId)}”`;
    case "remove-label":
      return `Remove label “${lookups.label(step.labelId)}”`;
    case "assign-member":
      return `Assign ${recipientLabel(step.recipient, lookups)}`;
    case "remove-member":
      return step.scope === "all"
        ? "Remove all assignees"
        : `Remove ${lookups.member(step.scope)}`;
    case "set-completion":
      return step.completed ? "Mark card complete" : "Reopen card";
    case "notify-member":
      return `Notify ${recipientLabel(step.recipient, lookups)}`;
    default:
      return "Unknown action";
  }
}

/** Short comma-joined summary of a rule's ordered action list. */
export function summarizeActions(actions: ActionStep[], lookups: NameLookups): string {
  if (actions.length === 0) return "No actions";
  return actions.map((step) => summarizeActionStep(step, lookups)).join(" · ");
}

const PRIORITY_LABEL: Record<string, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

/**
 * Short summary of a trigger + its stored config filters, e.g.
 * "Card is moved to a list · in “Done”". `triggerConfig` is the raw JSON stored
 * on the rule (unknown shape at read time).
 */
export function summarizeTrigger(
  triggerType: TriggerType,
  triggerConfig: unknown,
  lookups: NameLookups,
): string {
  const config = (triggerConfig ?? {}) as Record<string, unknown>;
  const parts: string[] = [TRIGGER_LABELS[triggerType]];

  if (typeof config.listId === "string") {
    const verb = triggerType === "card-moved-to-list" ? "to" : "in";
    parts.push(`${verb} “${lookups.list(config.listId)}”`);
  }
  if (typeof config.fromListId === "string") {
    parts.push(`from “${lookups.list(config.fromListId)}”`);
  }
  if (typeof config.labelId === "string") {
    parts.push(`label “${lookups.label(config.labelId)}”`);
  }
  if (typeof config.priority === "string" && PRIORITY_LABEL[config.priority]) {
    parts.push(`priority ${PRIORITY_LABEL[config.priority]}`);
  }
  if (typeof config.beforeMinutes === "number") {
    parts.push(`${config.beforeMinutes} min before`);
  }

  return parts.join(" · ");
}

/** Which triggerConfig filter fields are meaningful for a given trigger type. */
export function triggerConfigFields(triggerType: TriggerType): {
  list: boolean;
  fromList: boolean;
  label: boolean;
  priority: boolean;
  beforeMinutes: boolean;
} {
  return {
    list: true,
    fromList: triggerType === "card-moved-to-list",
    label: triggerType === "label-added-to-card",
    priority: true,
    beforeMinutes: triggerType === "due-date-approaching",
  };
}
