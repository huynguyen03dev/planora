/**
 * Tests for the scheduled-rule orchestration (lib/automation/scheduled.ts).
 *
 * Covers:
 * - maxApproachWindowMinutes: returns the max beforeMinutes among enabled rules
 * - evaluateScheduledCard: Tier 1 (RuleExecutionLog.dedupKey) + Tier 2 (CardReminder) dedup
 * - R3 notification dedup: built-in already claimed DUE_SOON → rule's notify-member skipped
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  rule: { findMany: vi.fn() },
  card: { findMany: vi.fn() },
  ruleExecutionLog: { create: vi.fn() },
  cardReminder: { create: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));

const mockEvaluateRules = vi.hoisted(() => vi.fn());
const mockFireDeferredEffects = vi.hoisted(() => vi.fn());
const mockLogRuleExecutionError = vi.hoisted(() => vi.fn());
const mockNotifyAutomation = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ default: mockDb, db: mockDb }));
vi.mock("@/lib/automation/evaluator", () => ({
  evaluateRules: mockEvaluateRules,
  RuleExecutionError: class RuleExecutionError extends Error {
    readonly context: Record<string, unknown>;
    constructor(message: string, context: Record<string, unknown>) {
      super(message);
      this.name = "RuleExecutionError";
      this.context = context;
    }
  },
}));
vi.mock("@/lib/automation/effects", () => ({
  fireDeferredEffects: mockFireDeferredEffects,
  logRuleExecutionError: mockLogRuleExecutionError,
}));
vi.mock("@/lib/notification", () => ({
  notifyAutomation: mockNotifyAutomation,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date("2026-01-15T10:00:00Z");

const scheduledCard = {
  id: "card-1",
  workspaceId: "ws-1",
  boardId: "board-1",
  listId: "list-1",
  priority: "MEDIUM" as const,
  dueDate: new Date("2026-01-15T11:00:00Z"), // now + 60min
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: $transaction calls the callback with a fake tx client
  mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn({});
  });
});

// ── maxApproachWindowMinutes ─────────────────────────────────────────────────

describe("maxApproachWindowMinutes", () => {
  it("returns null when no due-date-approaching rules exist", async () => {
    mockDb.rule.findMany.mockResolvedValue([]);
    const { maxApproachWindowMinutes } = await import("@/lib/automation/scheduled");
    expect(await maxApproachWindowMinutes()).toBeNull();
  });

  it("returns the max beforeMinutes across enabled rules", async () => {
    mockDb.rule.findMany.mockResolvedValue([
      { triggerConfig: { beforeMinutes: 60 } },
      { triggerConfig: { beforeMinutes: 180 } },
      { triggerConfig: { beforeMinutes: 120 } },
    ]);
    const { maxApproachWindowMinutes } = await import("@/lib/automation/scheduled");
    expect(await maxApproachWindowMinutes()).toBe(180);
  });

  it("returns null when rules exist but none have beforeMinutes", async () => {
    mockDb.rule.findMany.mockResolvedValue([
      { triggerConfig: {} },
      { triggerConfig: { priority: "HIGH" } },
    ]);
    const { maxApproachWindowMinutes } = await import("@/lib/automation/scheduled");
    expect(await maxApproachWindowMinutes()).toBeNull();
  });
});

// ── evaluateScheduledCard ────────────────────────────────────────────────────

describe("evaluateScheduledCard — Tier 1 + Tier 2 dedup", () => {
  it("card inside a rule's window → rule action fires, notify-member results in notifyAutomation + CardReminder claim", async () => {
    mockEvaluateRules.mockResolvedValue({
      effects: [
        { kind: "card-updated", boardId: "board-1", cardId: "card-1" },
        { kind: "notify-member", recipientId: "user-1", cardId: "card-1", message: "Due soon!", actorId: "actor-1" },
      ],
    });
    mockDb.cardReminder.create.mockResolvedValue({ id: "r1" });
    mockNotifyAutomation.mockResolvedValue(undefined);
    mockFireDeferredEffects.mockResolvedValue(undefined);

    const { evaluateScheduledCard, SCHEDULED_MILESTONE } = await import("@/lib/automation/scheduled");
    const result = await evaluateScheduledCard({ card: scheduledCard, now: NOW });

    expect(result.applied).toBe(1);
    expect(result.notified).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);

    // Non-notify effects should be fired via fireDeferredEffects
    expect(mockFireDeferredEffects).toHaveBeenCalledWith([
      { kind: "card-updated", boardId: "board-1", cardId: "card-1" },
    ]);

    // Tier 2: CardReminder claim for DUE_SOON
    expect(mockDb.cardReminder.create).toHaveBeenCalledWith({
      data: { cardId: "card-1", userId: "user-1", milestone: SCHEDULED_MILESTONE },
    });

    // Notification sent
    expect(mockNotifyAutomation).toHaveBeenCalledWith({
      recipientUserId: "user-1",
      cardId: "card-1",
      message: "Due soon!",
    });
  });

  it("card OUTSIDE the window → no rule action, no notifyAutomation", async () => {
    // evaluateRules returns empty effects (window gate skipped the rule)
    mockEvaluateRules.mockResolvedValue({ effects: [] });

    const { evaluateScheduledCard } = await import("@/lib/automation/scheduled");
    const result = await evaluateScheduledCard({ card: scheduledCard, now: NOW });

    expect(result.applied).toBe(1);
    expect(result.notified).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(mockFireDeferredEffects).toHaveBeenCalledWith([]);
    expect(mockNotifyAutomation).not.toHaveBeenCalled();
  });

  it("R3 dedup: CardReminder.create P2002 → notifyAutomation NOT called, skipped increments", async () => {
    mockEvaluateRules.mockResolvedValue({
      effects: [
        { kind: "notify-member", recipientId: "user-1", cardId: "card-1", message: "Due soon!", actorId: "actor-1" },
      ],
    });

    // Tier 2 claim-first with P2002 (built-in already claimed DUE_SOON)
    const p2002Error = new Error("Unique constraint");
    (p2002Error as unknown as Record<string, unknown>).code = "P2002";
    mockDb.cardReminder.create.mockRejectedValue(p2002Error);
    mockFireDeferredEffects.mockResolvedValue(undefined);

    const { evaluateScheduledCard } = await import("@/lib/automation/scheduled");
    const result = await evaluateScheduledCard({ card: scheduledCard, now: NOW });

    expect(result.applied).toBe(1);
    expect(result.notified).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(0);

    // notifyAutomation must NOT be called (member already got built-in reminder)
    expect(mockNotifyAutomation).not.toHaveBeenCalled();
  });

  it("evaluateRules throws RuleExecutionError → logRuleExecutionError called, errors increments", async () => {
    const { RuleExecutionError } = await import("@/lib/automation/evaluator");
    const ruleError = new RuleExecutionError("rule failed", {
      ruleId: "r1",
      ruleName: "Rule 1",
      chainId: "chain-1",
      chainDepth: 0,
      cardId: "card-1",
      triggerType: "due-date-approaching",
      cause: new Error("boom"),
    });
    mockEvaluateRules.mockRejectedValue(ruleError);

    const { evaluateScheduledCard } = await import("@/lib/automation/scheduled");
    const result = await evaluateScheduledCard({ card: scheduledCard, now: NOW });

    expect(result.applied).toBe(0);
    expect(result.errors).toBe(1);
    expect(mockLogRuleExecutionError).toHaveBeenCalledWith(ruleError);
  });

  it("notifyAutomation fails → CardReminder claim rolled back, errors increments", async () => {
    mockEvaluateRules.mockResolvedValue({
      effects: [
        { kind: "notify-member", recipientId: "user-1", cardId: "card-1", message: "Due soon!", actorId: "actor-1" },
      ],
    });
    mockDb.cardReminder.create.mockResolvedValue({ id: "r1" });
    mockNotifyAutomation.mockRejectedValue(new Error("notify failed"));
    mockDb.cardReminder.deleteMany.mockResolvedValue({ count: 1 });
    mockFireDeferredEffects.mockResolvedValue(undefined);

    const { evaluateScheduledCard } = await import("@/lib/automation/scheduled");
    const result = await evaluateScheduledCard({ card: scheduledCard, now: NOW });

    expect(result.applied).toBe(1);
    expect(result.notified).toBe(0);
    expect(result.errors).toBe(1);

    // Claim should be rolled back
    expect(mockDb.cardReminder.deleteMany).toHaveBeenCalledWith({
      where: { cardId: "card-1", userId: "user-1", milestone: "DUE_SOON" },
    });
  });
});
