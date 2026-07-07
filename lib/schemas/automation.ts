// lib/schemas/automation.ts
import { z } from "zod";

import { workspaceIdSchema } from "./invitation";

// Better Auth generates 32-char alphanumeric IDs (nanoid-style), not UUIDs, so
// user ids are bounded by length rather than parsed as a UUID. The action
// resolves the id to a workspace member within scope, which is the real
// isolation check — this is defense-in-depth against malformed input.
const userIdSchema = z
  .string({ message: "Member is required" })
  .trim()
  .min(1, "Member is required")
  .max(255);

// ─── Trigger types ────────────────────────────────────────────────

export const TRIGGER_TYPES = [
  "card-created",
  "card-moved-to-list",
  "card-completed",
  "card-reopened",
  "label-added-to-card",
  "member-assigned",
  "due-date-approaching",
] as const;

export const triggerTypeSchema = z.enum(TRIGGER_TYPES);

export type TriggerType = z.infer<typeof triggerTypeSchema>;

// ─── Trigger config (all optional; empty object = match everything) ──

const priorityValues = z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]);

export const triggerConfigSchema = z.object({
  boardId: z.string().uuid("Invalid board ID").optional(),
  listId: z.string().uuid("Invalid list ID").optional(),
  fromListId: z.string().uuid("Invalid list ID").optional(),
  labelId: z.string().uuid("Invalid label ID").optional(),
  priority: priorityValues.optional(),
  beforeMinutes: z.number().int().positive("beforeMinutes must be a positive integer").optional(),
});

export type TriggerConfig = z.infer<typeof triggerConfigSchema>;

// ─── Dynamic target tokens (decision 0022 R2) ─────────────────────

const recipientTokenSchema = z.union([
  z.literal("card-assignees"),
  z.literal("card-creator"),
  userIdSchema,
]);

const removeScopeSchema = z.union([
  z.literal("all"),
  userIdSchema,
]);

// ─── Action steps (discriminated union on `type`) ──────────────────

const moveCardToListStepSchema = z.object({
  type: z.literal("move-card-to-list"),
  targetListId: z.string().uuid("Invalid list ID"),
});

const setPriorityStepSchema = z.object({
  type: z.literal("set-priority"),
  priority: priorityValues,
});

const addLabelStepSchema = z.object({
  type: z.literal("add-label"),
  labelId: z.string().uuid("Invalid label ID"),
});

const removeLabelStepSchema = z.object({
  type: z.literal("remove-label"),
  labelId: z.string().uuid("Invalid label ID"),
});

const assignMemberStepSchema = z.object({
  type: z.literal("assign-member"),
  recipient: recipientTokenSchema,
});

const removeMemberStepSchema = z.object({
  type: z.literal("remove-member"),
  scope: removeScopeSchema,
});

const setCompletionStepSchema = z.object({
  type: z.literal("set-completion"),
  completed: z.boolean(),
});

const notifyMemberStepSchema = z.object({
  type: z.literal("notify-member"),
  recipient: recipientTokenSchema,
  message: z.string().max(2000, "Message must be 2000 characters or less").optional(),
});

export const actionStepSchema = z.discriminatedUnion("type", [
  moveCardToListStepSchema,
  setPriorityStepSchema,
  addLabelStepSchema,
  removeLabelStepSchema,
  assignMemberStepSchema,
  removeMemberStepSchema,
  setCompletionStepSchema,
  notifyMemberStepSchema,
]);

export type ActionStep = z.infer<typeof actionStepSchema>;

// ─── Actions array (R1: ordered non-empty sequence) ────────────────

export const actionsSchema = z
  .array(actionStepSchema)
  .min(1, "A rule must have at least one action")
  .max(20, "A rule cannot have more than 20 actions");

export type Actions = z.infer<typeof actionsSchema>;

// ─── Create / Update Rule inputs ───────────────────────────────────

const MAX_RULE_NAME_LENGTH = 200;
const MAX_RULE_DESCRIPTION_LENGTH = 2000;

const baseRuleFields = {
  name: z
    .string({ message: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(MAX_RULE_NAME_LENGTH, `Name must be ${MAX_RULE_NAME_LENGTH} characters or less`),
  description: z
    .string()
    .max(MAX_RULE_DESCRIPTION_LENGTH, `Description must be ${MAX_RULE_DESCRIPTION_LENGTH} characters or less`)
    .optional(),
  enabled: z.boolean().optional(),
  boardId: z.string().uuid("Invalid board ID").optional(),
  triggerType: triggerTypeSchema,
  triggerConfig: triggerConfigSchema,
  actions: actionsSchema,
};

export const createRuleSchema = z.object({
  ...baseRuleFields,
  workspaceId: workspaceIdSchema,
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>;

export const updateRuleSchema = z.object({
  id: z.string().uuid("Invalid rule ID"),
  ...baseRuleFields,
});

export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

// ─── Rule id-only / query inputs ───────────────────────────────────

export const deleteRuleSchema = z.object({
  id: z.string().uuid("Invalid rule ID"),
});

export type DeleteRuleInput = z.infer<typeof deleteRuleSchema>;

export const toggleRuleEnabledSchema = z.object({
  id: z.string().uuid("Invalid rule ID"),
  enabled: z.boolean(),
});

export type ToggleRuleEnabledInput = z.infer<typeof toggleRuleEnabledSchema>;

export const listRulesSchema = z.object({
  workspaceId: workspaceIdSchema,
});

export type ListRulesInput = z.infer<typeof listRulesSchema>;

export const ruleExecutionLogSchema = z.object({
  workspaceId: workspaceIdSchema,
  ruleId: z.string().uuid("Invalid rule ID").optional(),
});

export type RuleExecutionLogInput = z.infer<typeof ruleExecutionLogSchema>;

// Board-scoped automation view (US-067): the board id is the only input; the
// action derives the workspace from it and re-gates membership server-side.
export const boardAutomationDataSchema = z.object({
  boardId: z.string().uuid("Invalid board ID"),
});

export type BoardAutomationDataInput = z.infer<typeof boardAutomationDataSchema>;

// ─── Dry-run input ─────────────────────────────────────────────────
// Mirrors the RuleEventPayload fields a user can plausibly supply to preview
// which enabled rules would fire (no mutation). All event fields are optional;
// the matcher decides based on what's present.

export const dryRunEventSchema = z.object({
  cardId: z.string().uuid("Invalid card ID").optional(),
  boardId: z.string().uuid("Invalid board ID").optional(),
  listId: z.string().uuid("Invalid list ID").optional(),
  listIdFrom: z.string().uuid("Invalid list ID").optional(),
  listIdTo: z.string().uuid("Invalid list ID").optional(),
  labelId: z.string().uuid("Invalid label ID").optional(),
  priority: priorityValues.optional(),
});

export const dryRunRulesSchema = z.object({
  workspaceId: workspaceIdSchema,
  triggerType: triggerTypeSchema,
  event: dryRunEventSchema,
});

export type DryRunRulesInput = z.infer<typeof dryRunRulesSchema>;
