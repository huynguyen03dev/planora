import { describe, it, expect, vi, beforeEach } from "vitest";

import { evaluateRules, RuleExecutionError } from "./evaluator";
import { executeRuleActions } from "./executor";
import type { RuleEventPayload } from "./types";

// The evaluator's job is orchestration: match → loop-guard → execute → recurse →
// log. We drive the REAL matcher + loop-guard + evaluator and stub only the
// executor so we can control what events each rule "produces".
vi.mock("./executor", () => ({
  executeRuleActions: vi.fn(),
}));

const mockExecute = vi.mocked(executeRuleActions);

type RuleRow = {
  id: string;
  name: string;
  boardId: string | null;
  triggerConfig: unknown;
  actions: unknown;
};

function makeClient(rules: RuleRow[]) {
  const create = vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: "log" }));
  const client = {
    rule: { findMany: vi.fn(async () => rules) },
    ruleExecutionLog: { create },
  };
  return { client: client as never, logCreate: create };
}

const VALID_ACTIONS = [{ type: "set-priority", priority: "HIGH" }];

function rule(overrides: Partial<RuleRow> = {}): RuleRow {
  return {
    id: "ruleA",
    name: "Rule A",
    boardId: null,
    triggerConfig: {},
    actions: VALID_ACTIONS,
    ...overrides,
  };
}

const baseEvent: RuleEventPayload = { cardId: "c0", boardId: "b1", listId: "l1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue({ effects: [], producedEvents: [] });
});

describe("evaluateRules — matching + logging", () => {
  it("no enabled rules → no execution, no logs, no effects", async () => {
    const { client, logCreate } = makeClient([]);
    const result = await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "card-created",
      event: baseEvent,
    });
    expect(mockExecute).not.toHaveBeenCalled();
    expect(logCreate).not.toHaveBeenCalled();
    expect(result.effects).toEqual([]);
  });

  it("a matching rule executes, propagates effects, and logs success", async () => {
    mockExecute.mockResolvedValue({
      effects: [{ kind: "card-updated", boardId: "b1", cardId: "c0" }],
      producedEvents: [],
    });
    const { client, logCreate } = makeClient([rule()]);
    const result = await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "card-created",
      event: baseEvent,
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(result.effects).toHaveLength(1);
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "success", ruleId: "ruleA" }) }),
    );
  });

  it("a rule whose conditions do not match is skipped entirely (executor not called)", async () => {
    const { client, logCreate } = makeClient([rule({ triggerConfig: { priority: "URGENT" } })]);
    await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "card-created",
      event: { ...baseEvent, priority: "LOW" },
    });
    expect(mockExecute).not.toHaveBeenCalled();
    expect(logCreate).not.toHaveBeenCalled();
  });

  it("a rule with a malformed actions payload is logged error and skipped (no tx abort)", async () => {
    const { client, logCreate } = makeClient([rule({ actions: [{ type: "not-a-real-action" }] })]);
    await expect(
      evaluateRules({ client, workspaceId: "ws", triggerType: "card-created", event: baseEvent }),
    ).resolves.toBeDefined();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "error" }) }),
    );
  });
});

describe("evaluateRules — loop prevention", () => {
  it("dedups the same (rule, card) within a chain: fires once, logs the re-fire as skipped", async () => {
    // Rule A produces an event that would re-match Rule A on the SAME card.
    mockExecute.mockResolvedValue({
      effects: [],
      producedEvents: [{ triggerType: "card-created", payload: { cardId: "c0", boardId: "b1" } }],
    });
    const { client, logCreate } = makeClient([rule()]);
    await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "card-created",
      event: baseEvent,
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const statuses = logCreate.mock.calls.map(
      (c) => (c[0] as unknown as { data: { status: string } }).data.status,
    );
    expect(statuses).toContain("success");
    expect(statuses).toContain("skipped");
  });

  it("halts a cascade at the depth cap (5): executes 5 levels, then logs halted", async () => {
    // Each fire produces an event on a NEW card so dedup never triggers — only
    // the depth cap can stop it.
    let counter = 0;
    mockExecute.mockImplementation(async () => {
      counter += 1;
      return {
        effects: [],
        producedEvents: [{ triggerType: "card-created", payload: { cardId: `c${counter}`, boardId: "b1" } }],
      };
    });
    const { client, logCreate } = makeClient([rule()]);
    await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "card-created",
      event: baseEvent,
    });
    // Depths 0..4 execute (5 fires); depth 5 is at the cap → halted, no execute.
    expect(mockExecute).toHaveBeenCalledTimes(5);
    const halted = logCreate.mock.calls
      .map((c) => c[0] as unknown as { data: { status: string; chainDepth: number } })
      .filter((d) => d.data.status === "halted");
    expect(halted).toHaveLength(1);
    expect(halted[0].data.chainDepth).toBe(5);
  });
});

describe("evaluateRules — error semantics", () => {
  it("a failing action throws RuleExecutionError and does NOT write an in-tx error log", async () => {
    mockExecute.mockRejectedValue(new Error("boom"));
    const { client, logCreate } = makeClient([rule()]);
    await expect(
      evaluateRules({ client, workspaceId: "ws", triggerType: "card-created", event: baseEvent }),
    ).rejects.toBeInstanceOf(RuleExecutionError);

    // The error row is written post-rollback by the caller, never in-tx — so the
    // evaluator must not have logged a status:error row on the tx client.
    const errorLogs = logCreate.mock.calls
      .map((c) => c[0] as unknown as { data: { status: string } })
      .filter((d) => d.data.status === "error");
    expect(errorLogs).toHaveLength(0);
  });

  it("the thrown RuleExecutionError carries the failing rule's identity", async () => {
    mockExecute.mockRejectedValue(new Error("boom"));
    const { client } = makeClient([rule({ id: "r-fail", name: "Break things" })]);
    await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "card-created",
      event: baseEvent,
    }).catch((e: unknown) => {
      expect(e).toBeInstanceOf(RuleExecutionError);
      const ctx = (e as RuleExecutionError).context;
      expect(ctx.ruleId).toBe("r-fail");
      expect(ctx.ruleName).toBe("Break things");
      expect(ctx.triggerType).toBe("card-created");
    });
    expect.assertions(4);
  });
});

describe("evaluateRules — scheduled window gate (due-date-approaching)", () => {
  const dueDateApproachingRule = rule({
    triggerConfig: { beforeMinutes: 120 },
  });

  it("window MATCH: event.dueDate = now+60min with beforeMinutes=120 → executes", async () => {
    const now = new Date("2026-01-15T10:00:00Z");
    const dueDate = new Date("2026-01-15T11:00:00Z"); // now + 60min
    const { client, logCreate } = makeClient([dueDateApproachingRule]);

    await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "due-date-approaching",
      event: {
        ...baseEvent,
        dueDate: dueDate.toISOString(),
        now: now.toISOString(),
      },
    });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "success" }) }),
    );
  });

  it("window MISS: event.dueDate = now+180min with beforeMinutes=120 → NOT executed, no log", async () => {
    const now = new Date("2026-01-15T10:00:00Z");
    const dueDate = new Date("2026-01-15T13:00:00Z"); // now + 180min — outside window
    const { client, logCreate } = makeClient([dueDateApproachingRule]);

    await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "due-date-approaching",
      event: {
        ...baseEvent,
        dueDate: dueDate.toISOString(),
        now: now.toISOString(),
      },
    });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(logCreate).not.toHaveBeenCalled();
  });
});

describe("evaluateRules — dedupKey claim-first mode", () => {
  it("dedupKey P2002 claim: ruleExecutionLog.create rejects → rule skipped, executor NOT called, no throw", async () => {
    const p2002Error = new Error("Unique constraint");
    (p2002Error as unknown as Record<string, unknown>).code = "P2002";

    const create = vi.fn(async (args: { data: Record<string, unknown> }) => {
      if (args.data.dedupKey) throw p2002Error;
      return { id: "log" };
    });
    const client = {
      rule: { findMany: vi.fn(async () => [rule()]) },
      ruleExecutionLog: { create },
    };

    const result = await evaluateRules({
      client: client as never,
      workspaceId: "ws",
      triggerType: "card-created",
      event: baseEvent,
      dedupKey: "card-1:DUE_SOON",
    });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(result.effects).toEqual([]);
  });

  it("dedupKey present + success → the success row is the claim row (create called once with dedupKey), NOT a second post-execute success row", async () => {
    mockExecute.mockResolvedValue({
      effects: [{ kind: "card-updated", boardId: "b1", cardId: "c0" }],
      producedEvents: [],
    });
    const { client, logCreate } = makeClient([rule()]);

    await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "card-created",
      event: baseEvent,
      dedupKey: "card-1:DUE_SOON",
    });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    // The claim row (with dedupKey) is written before execute.
    // The post-execute success log must NOT be written (only one create call total).
    expect(logCreate).toHaveBeenCalledTimes(1);
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "success",
          dedupKey: "card-1:DUE_SOON",
        }),
      }),
    );
  });
});
