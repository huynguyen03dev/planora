import { describe, it, expect, vi, beforeEach } from "vitest";

import { evaluateRules } from "./evaluator";
import { RuleExecutionError } from "./types";
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
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => {
    void args;
    return { id: "log" };
  });
  const update = vi.fn(async () => ({ id: "log" }));
  const findMany = vi.fn(async () => rules);
  const workspaceGate = vi.fn(async () => []);
  const client = {
    rule: { findMany },
    ruleExecutionLog: { create, update },
    $queryRaw: workspaceGate,
  };
  return {
    client: client as never,
    logCreate: create,
    logUpdate: update,
    findMany,
    workspaceGate,
  };
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
  mockExecute.mockResolvedValue({ effects: [], producedEvents: [], stepOutcomes: [] });
});

describe("evaluateRules — matching + logging", () => {
  it("takes the workspace gate before reading or executing a rule sequence", async () => {
    const { client, findMany, workspaceGate } = makeClient([rule()]);

    await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "card-created",
      event: baseEvent,
    });

    expect(workspaceGate).toHaveBeenCalledTimes(1);
    expect(workspaceGate.mock.invocationCallOrder[0]).toBeLessThan(
      findMany.mock.invocationCallOrder[0],
    );
  });

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
      stepOutcomes: [{ stepIndex: 0, actionType: "set-priority", status: "success" }],
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
      expect.objectContaining({
        // workspaceId + ruleName are denormalized onto the log so it survives
        // rule deletion (SetNull) with a usable workspace scope + display name.
        data: expect.objectContaining({
          status: "success",
          ruleId: "ruleA",
          ruleName: "Rule A",
          workspaceId: "ws",
        }),
      }),
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
      stepOutcomes: [{ stepIndex: 0, actionType: "set-priority", status: "success" }],
    });
    const { client, logCreate, workspaceGate } = makeClient([rule()]);
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
    expect(workspaceGate).toHaveBeenCalledTimes(2);
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
        stepOutcomes: [{ stepIndex: 0, actionType: "set-priority", status: "success" }],
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
    expect(mockExecute.mock.calls.every(([params]) => params.client === client)).toBe(true);
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

describe("evaluateRules — failure isolation status + audit (decision 0030)", () => {
  it("some steps failed → logs partially_failed with per-step metadata (codes + stale target ids)", async () => {
    mockExecute.mockResolvedValue({
      effects: [{ kind: "card-updated", boardId: "b1", cardId: "c0" }],
      producedEvents: [],
      stepOutcomes: [
        { stepIndex: 0, actionType: "set-priority", status: "success" },
        {
          stepIndex: 1,
          actionType: "move-card-to-list",
          status: "failed",
          code: "TARGET_LIST_ARCHIVED",
          targetId: "stale-list",
          message: "move-card-to-list: target list \"stale-list\" is archived",
        },
        { stepIndex: 2, actionType: "set-completion", status: "success" },
      ],
    });
    const { client, logCreate } = makeClient([rule()]);

    await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "card-created",
      event: baseEvent,
    });

    // The rule ran to completion (best-effort) — effects from succeeded steps
    // still propagate (invariant #5: no effect for the isolated-failed step).
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "partially_failed",
          error: "1 of 3 action steps failed",
          metadata: {
            steps: expect.arrayContaining([
              expect.objectContaining({
                stepIndex: 1,
                status: "failed",
                code: "TARGET_LIST_ARCHIVED",
                targetId: "stale-list",
              }),
            ]),
          },
        }),
      }),
    );
  });

  it("ALL steps failed → status failed, metadata carries every failure, no throw", async () => {
    mockExecute.mockResolvedValue({
      effects: [],
      producedEvents: [],
      stepOutcomes: [
        {
          stepIndex: 0,
          actionType: "move-card-to-list",
          status: "failed",
          code: "TARGET_LIST_NOT_FOUND",
          targetId: "gone",
          message: "not found",
        },
        {
          stepIndex: 1,
          actionType: "add-label",
          status: "failed",
          code: "LABEL_NOT_FOUND",
          targetId: "gone-label",
          message: "not found",
        },
      ],
    });
    const { client, logCreate } = makeClient([rule()]);

    // Invariant #1: no RuleExecutionError escapes — the primary mutation commits.
    await expect(
      evaluateRules({ client, workspaceId: "ws", triggerType: "card-created", event: baseEvent }),
    ).resolves.toBeDefined();

    const log = logCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(log.data.status).toBe("failed");
    expect(log.data.error).toBe("2 of 2 action steps failed");
    expect(log.data.metadata).toEqual({
      steps: [
        expect.objectContaining({ code: "TARGET_LIST_NOT_FOUND", targetId: "gone" }),
        expect.objectContaining({ code: "LABEL_NOT_FOUND", targetId: "gone-label" }),
      ],
    });
  });

  it("no step failed → plain success log, no metadata, no error", async () => {
    mockExecute.mockResolvedValue({
      effects: [],
      producedEvents: [],
      stepOutcomes: [
        { stepIndex: 0, actionType: "set-priority", status: "success" },
        { stepIndex: 1, actionType: "notify-member", status: "success" },
      ],
    });
    const { client, logCreate } = makeClient([rule()]);

    await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "card-created",
      event: baseEvent,
    });

    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "success", error: null }),
      }),
    );
    const log = logCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(log.data).not.toHaveProperty("metadata");
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
      $queryRaw: vi.fn(async () => []),
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
      stepOutcomes: [{ stepIndex: 0, actionType: "set-priority", status: "success" }],
    });
    const { client, logCreate, logUpdate } = makeClient([rule()]);

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
    // All steps succeeded → nothing to finalize, no claim-row update.
    expect(logUpdate).not.toHaveBeenCalled();
  });

  it("claim-first + PARTIAL failure → the claim row is KEPT and updated to partially_failed with per-step metadata (invariant #6)", async () => {
    mockExecute.mockResolvedValue({
      effects: [],
      producedEvents: [],
      stepOutcomes: [
        { stepIndex: 0, actionType: "set-priority", status: "success" },
        {
          stepIndex: 1,
          actionType: "move-card-to-list",
          status: "failed",
          code: "TARGET_LIST_NOT_FOUND",
          targetId: "stale-list",
          message: "target list not found",
        },
      ],
    });
    const { client, logCreate, logUpdate } = makeClient([rule()]);

    await evaluateRules({
      client,
      workspaceId: "ws",
      triggerType: "card-created",
      event: baseEvent,
      dedupKey: "card-1:DUE_SOON",
    });

    // Exactly one row (the claim) — it survives, so no retry can double-apply
    // the succeeded step 0 (invariant #6).
    expect(logCreate).toHaveBeenCalledTimes(1);
    // …and its status + per-step audit are finalized in place.
    expect(logUpdate).toHaveBeenCalledWith({
      where: { id: "log" },
      data: expect.objectContaining({
        status: "partially_failed",
        error: "1 of 2 action steps failed",
        metadata: {
          steps: expect.arrayContaining([
            expect.objectContaining({
              stepIndex: 1,
              status: "failed",
              code: "TARGET_LIST_NOT_FOUND",
              targetId: "stale-list",
            }),
          ]),
        },
      }),
    });
  });
});
