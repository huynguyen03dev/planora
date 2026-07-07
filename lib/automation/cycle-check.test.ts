/**
 * Unit tests for the pure save-time static cycle warning (advisory only).
 * No DB, no mocks — the action supplies the workspace rule set.
 */
import { describe, expect, it } from "vitest";

import type { ActionStep } from "@/lib/schemas/automation";
import {
  producedTriggerType,
  producedTriggerTypes,
  detectStaticCycleWarnings,
  type CandidateRule,
} from "./cycle-check";

describe("producedTriggerType — mirrors the executor's producedEvents mapping", () => {
  it("move-card-to-list → card-moved-to-list", () => {
    expect(producedTriggerType({ type: "move-card-to-list", targetListId: "l" } as ActionStep)).toBe(
      "card-moved-to-list",
    );
  });

  it("add-label → label-added-to-card", () => {
    expect(producedTriggerType({ type: "add-label", labelId: "x" } as ActionStep)).toBe(
      "label-added-to-card",
    );
  });

  it("assign-member → member-assigned", () => {
    expect(
      producedTriggerType({ type: "assign-member", recipient: "card-creator" } as ActionStep),
    ).toBe("member-assigned");
  });

  it("set-completion honors the completed flag", () => {
    expect(producedTriggerType({ type: "set-completion", completed: true } as ActionStep)).toBe(
      "card-completed",
    );
    expect(producedTriggerType({ type: "set-completion", completed: false } as ActionStep)).toBe(
      "card-reopened",
    );
  });

  it("non-event-producing actions → null", () => {
    expect(producedTriggerType({ type: "set-priority", priority: "HIGH" } as ActionStep)).toBeNull();
    expect(producedTriggerType({ type: "remove-label", labelId: "x" } as ActionStep)).toBeNull();
    expect(producedTriggerType({ type: "remove-member", scope: "all" } as ActionStep)).toBeNull();
    expect(
      producedTriggerType({ type: "notify-member", recipient: "card-creator" } as ActionStep),
    ).toBeNull();
  });
});

describe("producedTriggerTypes — distinct set", () => {
  it("dedups repeated produced types", () => {
    const actions = [
      { type: "add-label", labelId: "a" },
      { type: "add-label", labelId: "b" },
      { type: "set-priority", priority: "LOW" },
    ] as ActionStep[];
    expect(producedTriggerTypes(actions)).toEqual(["label-added-to-card"]);
  });

  it("empty when nothing produces an event", () => {
    const actions = [
      { type: "set-priority", priority: "LOW" },
      { type: "notify-member", recipient: "card-creator" },
    ] as ActionStep[];
    expect(producedTriggerTypes(actions)).toEqual([]);
  });
});

describe("detectStaticCycleWarnings", () => {
  it("flags a SELF-cycle: action re-produces the rule's own trigger", () => {
    const warnings = detectStaticCycleWarnings({
      selfTriggerType: "card-moved-to-list",
      actions: [{ type: "move-card-to-list", targetListId: "l" }] as ActionStep[],
      workspaceRules: [],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("its own trigger");
  });

  it("flags a cross-rule chain against another ENABLED rule", () => {
    const others: CandidateRule[] = [
      { id: "r2", name: "Notify on move", enabled: true, triggerType: "card-moved-to-list" },
    ];
    const warnings = detectStaticCycleWarnings({
      selfTriggerType: "card-completed",
      actions: [{ type: "move-card-to-list", targetListId: "l" }] as ActionStep[],
      workspaceRules: others,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('rule "Notify on move"');
  });

  it("ignores DISABLED rules", () => {
    const others: CandidateRule[] = [
      { id: "r2", name: "Disabled", enabled: false, triggerType: "card-moved-to-list" },
    ];
    const warnings = detectStaticCycleWarnings({
      selfTriggerType: "card-completed",
      actions: [{ type: "move-card-to-list", targetListId: "l" }] as ActionStep[],
      workspaceRules: others,
    });
    expect(warnings).toEqual([]);
  });

  it("does not double-count the rule being updated against itself", () => {
    // The rule being updated (selfId = r1) triggers on card-moved-to-list and
    // its own action produces card-moved-to-list. That's one SELF-cycle warning,
    // NOT also a cross-rule warning against its own persisted row.
    const others: CandidateRule[] = [
      { id: "r1", name: "Me", enabled: true, triggerType: "card-moved-to-list" },
    ];
    const warnings = detectStaticCycleWarnings({
      selfId: "r1",
      selfTriggerType: "card-moved-to-list",
      actions: [{ type: "move-card-to-list", targetListId: "l" }] as ActionStep[],
      workspaceRules: others,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("its own trigger");
  });

  it("returns no warnings when no produced event matches any trigger", () => {
    const others: CandidateRule[] = [
      { id: "r2", name: "Other", enabled: true, triggerType: "card-created" },
    ];
    const warnings = detectStaticCycleWarnings({
      selfTriggerType: "card-completed",
      actions: [{ type: "set-priority", priority: "HIGH" }] as ActionStep[],
      workspaceRules: others,
    });
    expect(warnings).toEqual([]);
  });
});
