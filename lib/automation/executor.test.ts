import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Prisma } from "@/app/generated/prisma/client";

import type { ActionStep } from "@/lib/schemas/automation";

import type { RuleEventPayload } from "./types";
import { RuleExecutionError } from "./types";
import { CARD_POSITION_GAP } from "@/lib/ordering";

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock("@/lib/card", () => ({
  updateCardPriority: vi.fn().mockResolvedValue({}),
  setCardCompletion: vi.fn().mockResolvedValue({
    card: { id: "card-1", listId: "list-1" },
    transitioned: true,
  }),
  moveCardInTransaction: vi.fn(),
}));

vi.mock("@/lib/label", () => ({
  addCardLabel: vi.fn().mockResolvedValue({ changed: true }),
  removeCardLabel: vi.fn().mockResolvedValue({ changed: true }),
}));

vi.mock("@/lib/card-member", () => ({
  assignMemberToCard: vi.fn().mockResolvedValue({
    member: { id: "user-1", name: "User", image: null, email: "u@e.com" },
    changed: true,
  }),
  removeMemberFromCard: vi.fn().mockResolvedValue({ changed: true }),
}));

vi.mock("@/lib/card-history", () => ({
  buildCardMoveLifecycleEvents: vi.fn().mockReturnValue([
    {
      workspaceId: "ws-1",
      boardId: "board-1",
      cardId: "card-1",
      eventType: "CARD_MOVED",
      metadata: { fromListId: "list-1", toListId: "list-2", memberIds: [], estimateHours: null },
    },
  ]),
  buildCardCompletedEvent: vi.fn().mockReturnValue({
    workspaceId: "ws-1",
    boardId: "board-1",
    cardId: "card-1",
    eventType: "CARD_COMPLETED",
    metadata: {},
  }),
  buildCardReopenedEvent: vi.fn().mockReturnValue({
    workspaceId: "ws-1",
    boardId: "board-1",
    cardId: "card-1",
    eventType: "CARD_REOPENED",
    metadata: {},
  }),
  buildCardMemberAssignedEvent: vi.fn().mockReturnValue({
    workspaceId: "ws-1",
    boardId: "board-1",
    cardId: "card-1",
    eventType: "CARD_MEMBER_ASSIGNED",
    metadata: {},
  }),
  buildCardMemberUnassignedEvent: vi.fn().mockReturnValue({
    workspaceId: "ws-1",
    boardId: "board-1",
    cardId: "card-1",
    eventType: "CARD_MEMBER_UNASSIGNED",
    metadata: {},
  }),
  recordCardHistoryEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/automation/resolver", () => ({
  resolveRecipient: vi.fn().mockResolvedValue(["user-1"]),
  resolveRemoveScope: vi.fn().mockResolvedValue(["user-1"]),
  // Decision 0030: the executor maps this into a structured
  // MEMBER_NOT_IN_WORKSPACE RuleExecutionError — tests construct it from the
  // mocked module so instanceof checks inside the executor match.
  CrossWorkspaceTargetError: class CrossWorkspaceTargetError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "CrossWorkspaceTargetError";
    }
  },
}));

// ─── Imports (after mocks) ───────────────────────────────────────────

import { executeRuleActions } from "./executor";
import {
  updateCardPriority,
  setCardCompletion,
  moveCardInTransaction,
} from "@/lib/card";
import { addCardLabel, removeCardLabel } from "@/lib/label";
import { assignMemberToCard, removeMemberFromCard } from "@/lib/card-member";
import {
  buildCardMoveLifecycleEvents,
  buildCardCompletedEvent,
  buildCardMemberAssignedEvent,
  buildCardMemberUnassignedEvent,
  recordCardHistoryEvents,
} from "@/lib/card-history";
import { resolveRecipient, resolveRemoveScope, CrossWorkspaceTargetError } from "./resolver";

// ─── Helpers ─────────────────────────────────────────────────────────

function makeClient(targetListOverrides?: {
  archivedAt?: Date | null;
  workspaceId?: string;
  /** When true, list.findUnique resolves to null (list not found). */
  notFound?: boolean;
}): Prisma.TransactionClient {
  const target = targetListOverrides ?? { archivedAt: null, workspaceId: "ws-1" };
  return {
    card: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "card-1",
        listId: "list-1",
        title: "Card",
        description: null,
        position: 1,
        priority: null,
        dueDate: null,
        estimateHours: null,
        completedAt: null,
        deletedAt: null,
        coverImage: null,
        archivedAt: null,
        createdById: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    cardMember: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    cardHistoryEvent: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    list: {
      findUnique: vi.fn().mockResolvedValue(
        target.notFound
          ? null
          : { archivedAt: target.archivedAt ?? null, board: { workspaceId: target.workspaceId } },
      ),
    },
    label: {
      // Decision 0030 label guard: default = a label inside the rule workspace.
      findUnique: vi.fn().mockResolvedValue({ board: { workspaceId: "ws-1" } }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  } as unknown as Prisma.TransactionClient;
}

const baseRule = {
  id: "rule-1",
  name: "Test Rule",
  workspaceId: "ws-1",
  boardId: "board-1",
};

const baseEvent: RuleEventPayload = {
  cardId: "card-1",
  boardId: "board-1",
};

const ACTOR = "00000000-0000-4000-8000-000000000a11";

// ─── Tests ───────────────────────────────────────────────────────────

describe("executeRuleActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Validation ─────────────────────────────────────────────────────

  it("throws when event.cardId is missing", async () => {
    const client = makeClient();
    await expect(
      executeRuleActions({
        client,
        rule: { ...baseRule, actions: [{ type: "set-priority", priority: "HIGH" }] },
        event: { boardId: "board-1" },
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      }),
    ).rejects.toThrow("event.cardId is required");
  });

  it("throws when event.boardId is missing", async () => {
    const client = makeClient();
    await expect(
      executeRuleActions({
        client,
        rule: { ...baseRule, actions: [{ type: "set-priority", priority: "HIGH" }] },
        event: { cardId: "card-1" },
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      }),
    ).rejects.toThrow("event.boardId is required");
  });

  // ── Ordered execution ──────────────────────────────────────────────

  it("executes steps in order (set-priority then add-label)", async () => {
    const client = makeClient();
    const callOrder: string[] = [];

    vi.mocked(updateCardPriority).mockImplementation(async () => {
      callOrder.push("updateCardPriority");
      return {} as never;
    });
    vi.mocked(addCardLabel).mockImplementation(async () => {
      callOrder.push("addCardLabel");
      return { changed: true };
    });

    const actions: ActionStep[] = [
      { type: "set-priority", priority: "HIGH" },
      { type: "add-label", labelId: "label-1" },
    ];

    await executeRuleActions({
      client,
      rule: { ...baseRule, actions },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "",
      chainDepth: 0,
    });

    expect(callOrder).toEqual(["updateCardPriority", "addCardLabel"]);
  });

  it("holds the workspace gate before set-priority can race into a move step", async () => {
    const client = makeClient();
    const callOrder: string[] = [];
    let releaseGate: () => void = () => {};
    let signalGateEntered: () => void = () => {};
    const gateEntered = new Promise<void>((resolve) => {
      signalGateEntered = resolve;
    });
    const gateRelease = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const queryRaw = client.$queryRaw as unknown as ReturnType<typeof vi.fn>;

    queryRaw.mockImplementation(async () => {
      callOrder.push("workspace-gate");
      signalGateEntered();
      await gateRelease;
      return [];
    });
    vi.mocked(updateCardPriority).mockImplementation(async () => {
      callOrder.push("set-priority");
      return {} as never;
    });
    vi.mocked(moveCardInTransaction).mockImplementation(async () => {
      callOrder.push("move-card-to-list");
      return {
        card: {
          listId: "list-2",
          position: CARD_POSITION_GAP,
          moveRevision: 1,
          estimateHours: null,
        } as never,
        fromListId: "list-1",
        fromBoardId: "board-1",
        targetBoardId: "board-1",
      };
    });

    const running = executeRuleActions({
      client,
      rule: {
        ...baseRule,
        actions: [
          { type: "set-priority", priority: "HIGH" },
          { type: "move-card-to-list", targetListId: "list-2" },
        ],
      },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "chain-1",
      chainDepth: 0,
    });

    await gateEntered;
    expect(updateCardPriority).not.toHaveBeenCalled();
    expect(moveCardInTransaction).not.toHaveBeenCalled();

    releaseGate();
    await running;
    expect(callOrder).toEqual(["workspace-gate", "set-priority", "move-card-to-list"]);
    expect(moveCardInTransaction).toHaveBeenCalledWith(client, {
      workspaceId: "ws-1",
      cardId: "card-1",
      targetListId: "list-2",
      intent: "end",
    });
  });

  // ── First-failing-step aborts ──────────────────────────────────────

  it("aborts on first failing step and does not run later steps", async () => {
    const client = makeClient();

    vi.mocked(addCardLabel).mockRejectedValue(new Error("DB error"));
    const removeSpy = vi.mocked(removeCardLabel);

    const actions: ActionStep[] = [
      { type: "add-label", labelId: "label-1" },
      { type: "remove-label", labelId: "label-2" },
    ];

    await expect(
      executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      }),
    ).rejects.toThrow("DB error");

    expect(removeSpy).not.toHaveBeenCalled();
  });

  // ── set-priority ───────────────────────────────────────────────────

  it("set-priority: emits card-updated, no producedEvent, no history", async () => {
    const client = makeClient();
    const actions: ActionStep[] = [{ type: "set-priority", priority: "URGENT" }];

    const result = await executeRuleActions({
      client,
      rule: { ...baseRule, actions },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "",
      chainDepth: 0,
    });

    expect(updateCardPriority).toHaveBeenCalledWith("card-1", "URGENT", client);
    expect(result.effects).toEqual([{ kind: "card-updated", boardId: "board-1", cardId: "card-1" }]);
    expect(result.producedEvents).toEqual([]);
    expect(recordCardHistoryEvents).not.toHaveBeenCalled();
  });

  // ── move-card-to-list ──────────────────────────────────────────────

  describe("move-card-to-list", () => {
    it("appends to end of target list (last card exists)", async () => {
      const client = makeClient();
      const cardMemberFindMany = client.cardMember.findMany as ReturnType<typeof vi.fn>;

      cardMemberFindMany.mockResolvedValue([{ userId: "user-a" }]);
      vi.mocked(moveCardInTransaction).mockResolvedValue({
        card: {
          listId: "list-2",
          position: 32768 + CARD_POSITION_GAP,
          moveRevision: 1,
          estimateHours: 5,
        } as never,
        fromListId: "list-1",
        fromBoardId: "board-1",
        targetBoardId: "board-1",
      });

      const actions: ActionStep[] = [{ type: "move-card-to-list", targetListId: "list-2" }];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      });

      expect(moveCardInTransaction).toHaveBeenCalledWith(client, {
        workspaceId: "ws-1",
        cardId: "card-1",
        targetListId: "list-2",
        intent: "end",
      });
      expect(result.effects).toContainEqual({
        kind: "card-moved",
        boardId: "board-1",
        cardId: "card-1",
        listId: "list-2",
        position: 32768 + CARD_POSITION_GAP,
        moveRevision: 1,
      });
      expect(result.producedEvents).toContainEqual({
        triggerType: "card-moved-to-list",
        payload: { cardId: "card-1", boardId: "board-1", listIdFrom: "list-1", listIdTo: "list-2" },
      });
    });

    it("appends with CARD_POSITION_GAP when target list is empty", async () => {
      const client = makeClient();
      const cardMemberFindMany = client.cardMember.findMany as ReturnType<typeof vi.fn>;

      cardMemberFindMany.mockResolvedValue([]);
      vi.mocked(moveCardInTransaction).mockResolvedValue({
        card: {
          listId: "list-empty",
          position: CARD_POSITION_GAP,
          moveRevision: 1,
          estimateHours: null,
        } as never,
        fromListId: "list-1",
        fromBoardId: "board-1",
        targetBoardId: "board-1",
      });

      const actions: ActionStep[] = [{ type: "move-card-to-list", targetListId: "list-empty" }];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      });

      expect(moveCardInTransaction).toHaveBeenCalledWith(client, {
        workspaceId: "ws-1",
        cardId: "card-1",
        targetListId: "list-empty",
        intent: "end",
      });
      expect(result.effects).toContainEqual(
        expect.objectContaining({ position: CARD_POSITION_GAP, moveRevision: 1 }),
      );
    });

    it("records move history event with ruleId", async () => {
      const client = makeClient();
      const cardMemberFindMany = client.cardMember.findMany as ReturnType<typeof vi.fn>;

      cardMemberFindMany.mockResolvedValue([{ userId: "user-a" }]);
      vi.mocked(moveCardInTransaction).mockResolvedValue({
        card: {
          listId: "list-2",
          position: CARD_POSITION_GAP,
          moveRevision: 1,
          estimateHours: 3,
        } as never,
        fromListId: "list-1",
        fromBoardId: "board-1",
        targetBoardId: "board-1",
      });

      const actions: ActionStep[] = [{ type: "move-card-to-list", targetListId: "list-2" }];

      await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      });

      expect(buildCardMoveLifecycleEvents).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        boardId: "board-1",
        cardId: "card-1",
        actorId: ACTOR,
        fromListId: "list-1",
        toListId: "list-2",
        estimateHours: 3,
        memberIds: ["user-a"],
      });
      expect(recordCardHistoryEvents).toHaveBeenCalledWith(
        client,
        expect.arrayContaining([expect.objectContaining({ ruleId: "rule-1" })]),
      );
    });

    it("emits both board rooms and recurses from the canonical destination board", async () => {
      const client = makeClient();
      vi.mocked(moveCardInTransaction).mockResolvedValue({
        card: {
          listId: "list-on-board-2",
          position: CARD_POSITION_GAP,
          moveRevision: 4,
          estimateHours: null,
        } as never,
        fromListId: "list-1",
        fromBoardId: "board-1",
        targetBoardId: "board-2",
      });

      const result = await executeRuleActions({
        client,
        rule: {
          ...baseRule,
          actions: [{ type: "move-card-to-list", targetListId: "list-on-board-2" }],
        },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      });

      expect(result.effects).toEqual([
        {
          kind: "card-moved",
          boardId: "board-2",
          cardId: "card-1",
          listId: "list-on-board-2",
          position: CARD_POSITION_GAP,
          moveRevision: 4,
        },
        {
          kind: "card-moved",
          boardId: "board-1",
          cardId: "card-1",
          listId: "list-on-board-2",
          position: CARD_POSITION_GAP,
          moveRevision: 4,
        },
      ]);
      expect(result.producedEvents).toEqual([
        {
          triggerType: "card-moved-to-list",
          payload: {
            cardId: "card-1",
            boardId: "board-2",
            listIdFrom: "list-1",
            listIdTo: "list-on-board-2",
          },
        },
      ]);
      expect(buildCardMoveLifecycleEvents).toHaveBeenCalledWith(
        expect.objectContaining({ boardId: "board-2" }),
      );
    });

    // ── Target-list validation (US-074 Slice B2 + decision 0030) ───

    it("ISOLATES a missing target list: no throw, failed stepOutcome with TARGET_LIST_NOT_FOUND + target id", async () => {
      const client = makeClient({ notFound: true });
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;
      cardFindUniqueOrThrow.mockResolvedValue({
        listId: "list-1",
        estimateHours: null,
      });

      const actions: ActionStep[] = [{ type: "move-card-to-list", targetListId: "list-missing" }];

      // Decision 0030: a structured stale-target error must NOT escape the
      // executor — the primary card mutation commits; the step is audited.
      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      });

      expect(result.stepOutcomes).toHaveLength(1);
      expect(result.stepOutcomes[0]).toMatchObject({
        stepIndex: 0,
        actionType: "move-card-to-list",
        status: "failed",
        code: "TARGET_LIST_NOT_FOUND",
        targetId: "list-missing",
      });
      expect(result.stepOutcomes[0]).toMatchObject({
        message: expect.stringContaining("not found"),
      });
      // The card must NOT be updated when the target is missing
      expect((client.card.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it("ISOLATES an archived target list: failed stepOutcome with TARGET_LIST_ARCHIVED", async () => {
      const client = makeClient({ archivedAt: new Date(), workspaceId: "ws-1" });
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;
      cardFindUniqueOrThrow.mockResolvedValue({
        listId: "list-1",
        estimateHours: null,
      });

      const actions: ActionStep[] = [{ type: "move-card-to-list", targetListId: "list-archived" }];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      });

      expect(result.stepOutcomes[0]).toMatchObject({
        status: "failed",
        code: "TARGET_LIST_ARCHIVED",
        targetId: "list-archived",
      });
      expect(result.stepOutcomes[0]).toMatchObject({
        message: expect.stringContaining("archived"),
      });
      expect((client.card.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it("ISOLATES a target list outside the rule workspace: TARGET_LIST_FOREIGN_WORKSPACE", async () => {
      const client = makeClient({ archivedAt: null, workspaceId: "ws-foreign" });
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;
      cardFindUniqueOrThrow.mockResolvedValue({
        listId: "list-1",
        estimateHours: null,
      });

      const actions: ActionStep[] = [{ type: "move-card-to-list", targetListId: "list-foreign" }];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      });

      expect(result.stepOutcomes[0]).toMatchObject({
        status: "failed",
        code: "TARGET_LIST_FOREIGN_WORKSPACE",
        targetId: "list-foreign",
      });
      expect(result.stepOutcomes[0]).toMatchObject({
        message: expect.stringContaining("outside the rule workspace"),
      });
      expect((client.card.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it("proves guard is live: archived-list rejection prevents card.update", async () => {
      // The guard rejects a move to an archived list. Under decision 0030 the
      // rejection is ISOLATED (no throw) — the proof is that the step failed
      // with TARGET_LIST_ARCHIVED and the card was never mutated.
      const client = makeClient({ archivedAt: new Date(), workspaceId: "ws-1" });
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;

      cardFindUniqueOrThrow.mockResolvedValue({
        listId: "list-1",
        estimateHours: null,
      });

      const actions: ActionStep[] = [{ type: "move-card-to-list", targetListId: "list-archived" }];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      });

      expect(result.stepOutcomes[0]).toMatchObject({
        status: "failed",
        code: "TARGET_LIST_ARCHIVED",
      });
      expect((client.card.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    // ── Audit payload proof (decision 0030) ───────────────────────

    it("failed stepOutcome carries the descriptive message (not \"null\") for the audit", async () => {
      // The per-step audit must describe what went wrong, not "null" — the
      // evaluator persists it into RuleExecutionLog.metadata.
      const client = makeClient({ notFound: true });
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;
      cardFindUniqueOrThrow.mockResolvedValue({
        listId: "list-1",
        estimateHours: null,
      });

      const actions: ActionStep[] = [{ type: "move-card-to-list", targetListId: "list-missing" }];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "due-date-approaching",
        chainId: "cascade-42",
        chainDepth: 2,
      });

      const failed = result.stepOutcomes[0] as Extract<typeof result.stepOutcomes[number], { status: "failed" }>;
      expect(failed.code).toBe("TARGET_LIST_NOT_FOUND");
      expect(failed.targetId).toBe("list-missing");
      expect(failed.message).toContain("not found");
      expect(failed.message).not.toBe("null");

      // No card update must have been attempted
      expect((client.card.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    // ── Decision 0030: best-effort continuation + two-class taxonomy ──

    it("best-effort: a stale middle step does not block independent siblings (steps 1+3 apply, step 2 audited)", async () => {
      const client = makeClient({ notFound: true });
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;
      cardFindUniqueOrThrow.mockResolvedValue({
        completedAt: null,
        listId: "list-1",
        estimateHours: null,
        dueDate: null,
      });

      const actions: ActionStep[] = [
        { type: "set-priority", priority: "HIGH" },
        { type: "move-card-to-list", targetListId: "list-stale" },
        { type: "set-completion", completed: true },
      ];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-created",
        chainId: "c-1",
        chainDepth: 0,
      });

      // Steps 1 + 3 committed (best-effort continuation, decision 0030)
      expect(updateCardPriority).toHaveBeenCalledWith("card-1", "HIGH", client);
      expect(setCardCompletion).toHaveBeenCalledWith(client, "card-1", true, null);
      // Step 2 never moved the card
      expect((client.card.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();

      expect(result.stepOutcomes).toHaveLength(3);
      expect(result.stepOutcomes[0]).toMatchObject({ stepIndex: 0, status: "success" });
      expect(result.stepOutcomes[1]).toMatchObject({
        stepIndex: 1,
        status: "failed",
        code: "TARGET_LIST_NOT_FOUND",
        targetId: "list-stale",
      });
      expect(result.stepOutcomes[2]).toMatchObject({ stepIndex: 2, status: "success" });

      // Effects + produced events come from succeeded steps ONLY (invariants
      // #5 and #7): no card-moved effect, no card-moved-to-list event.
      expect(result.effects).toEqual([
        { kind: "card-updated", boardId: "board-1", cardId: "card-1" },
        { kind: "completion-updated", boardId: "board-1", cardId: "card-1", completed: true },
      ]);
      expect(result.producedEvents).toEqual([
        {
          triggerType: "card-completed",
          payload: { cardId: "card-1", boardId: "board-1", listId: "list-1", completed: true },
        },
      ]);
    });

    it("an unexpected (non-RuleExecutionError) error still ABORTS — propagates, nothing isolated", async () => {
      const client = makeClient();
      // Once-only: the abort test must not leak its poisoned implementation
      // into later tests (clearAllMocks does not reset implementations).
      vi.mocked(updateCardPriority).mockRejectedValueOnce(new Error("db exploded"));

      const actions: ActionStep[] = [
        { type: "set-priority", priority: "HIGH" },
        { type: "set-priority", priority: "LOW" },
      ];

      // Decision 0030 class 2: unexpected errors retain pre-0030 behavior —
      // they escape the executor, abort the shared tx, and are logged
      // post-rollback by the caller.
      await expect(
        executeRuleActions({
          client,
          rule: { ...baseRule, actions },
          event: baseEvent,
          actorId: ACTOR,
          triggerType: "card-created",
          chainId: "",
          chainDepth: 0,
        }),
      ).rejects.toThrow("db exploded");
    });

    it("a CODE-LESS RuleExecutionError is the unexpected class: ABORTS (re-thrown unchanged), no isolation, no continuation", async () => {
      // Review hardening: the isolation predicate is `instanceof
      // RuleExecutionError && code != null`. A structured error WITHOUT a code
      // (e.g. a future guard that forgets its code) must NOT be isolated — it
      // aborts the shared tx like any unexpected error, preserving invariant
      // #4 by construction.
      const client = makeClient();
      vi.mocked(updateCardPriority).mockRejectedValueOnce(
        new RuleExecutionError("code-less boom", {
          workspaceId: "ws-1",
          ruleId: "rule-1",
          ruleName: "Test Rule",
          chainId: "",
          chainDepth: 0,
          cardId: "card-1",
          triggerType: "card-created",
          cause: new Error("code-less boom"),
        }),
      );

      const actions: ActionStep[] = [
        { type: "set-priority", priority: "HIGH" },
        { type: "set-completion", completed: true },
      ];

      const err = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-created",
        chainId: "",
        chainDepth: 0,
      }).catch((e: unknown) => e);

      // The code-less error propagates unchanged → the tx aborts (the action
      // layer logs it post-rollback via the unexpected path).
      expect(err).toBeInstanceOf(RuleExecutionError);
      expect((err as RuleExecutionError).code).toBeUndefined();
      expect((err as RuleExecutionError).message).toBe("code-less boom");
      // No best-effort continuation: the independent sibling step never ran.
      expect(setCardCompletion).not.toHaveBeenCalled();
    });

    it("ISOLATES a departed-member assign target as MEMBER_NOT_IN_WORKSPACE and continues", async () => {
      const client = makeClient();
      vi.mocked(resolveRecipient).mockRejectedValue(
        new CrossWorkspaceTargetError("User user-gone is not a member of workspace ws-1"),
      );

      const actions: ActionStep[] = [
        { type: "assign-member", recipient: "user-gone" },
        { type: "set-priority", priority: "HIGH" },
      ];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-created",
        chainId: "",
        chainDepth: 0,
      });

      expect(result.stepOutcomes[0]).toMatchObject({
        status: "failed",
        code: "MEMBER_NOT_IN_WORKSPACE",
        targetId: "user-gone",
      });
      expect(result.stepOutcomes[1]).toMatchObject({ status: "success" });
      expect(assignMemberToCard).not.toHaveBeenCalled();
    });

    it("ISOLATES a departed-member notify target as MEMBER_NOT_IN_WORKSPACE (no notification pushed)", async () => {
      const client = makeClient();
      vi.mocked(resolveRecipient).mockRejectedValue(
        new CrossWorkspaceTargetError("User user-gone is not a member of workspace ws-1"),
      );

      const actions: ActionStep[] = [{ type: "notify-member", recipient: "user-gone" }];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-created",
        chainId: "",
        chainDepth: 0,
      });

      expect(result.stepOutcomes[0]).toMatchObject({
        status: "failed",
        code: "MEMBER_NOT_IN_WORKSPACE",
        targetId: "user-gone",
      });
      expect(result.effects).toEqual([]); // invariant #5: no effect for the failed step
    });

    it("ISOLATES a deleted-label add target as LABEL_NOT_FOUND (no attach attempted)", async () => {
      const client = makeClient();
      (client.label.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const actions: ActionStep[] = [{ type: "add-label", labelId: "label-gone" }];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-created",
        chainId: "",
        chainDepth: 0,
      });

      expect(result.stepOutcomes[0]).toMatchObject({
        status: "failed",
        code: "LABEL_NOT_FOUND",
        targetId: "label-gone",
      });
      expect(addCardLabel).not.toHaveBeenCalled();
    });

    it("ISOLATES a foreign-workspace label as LABEL_NOT_FOUND (remove-label guard too)", async () => {
      const client = makeClient();
      (client.label.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        board: { workspaceId: "ws-foreign" },
      });

      const actions: ActionStep[] = [{ type: "remove-label", labelId: "label-foreign" }];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-created",
        chainId: "",
        chainDepth: 0,
      });

      expect(result.stepOutcomes[0]).toMatchObject({
        status: "failed",
        code: "LABEL_NOT_FOUND",
        targetId: "label-foreign",
      });
      expect(removeCardLabel).not.toHaveBeenCalled();
    });
  });

  // ── add-label ──────────────────────────────────────────────────────

  it("add-label changed=false → no emit, no producedEvent", async () => {
    const client = makeClient();
    vi.mocked(addCardLabel).mockResolvedValue({ changed: false });

    const result = await executeRuleActions({
      client,
      rule: { ...baseRule, actions: [{ type: "add-label", labelId: "label-1" }] },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "",
      chainDepth: 0,
    });

    expect(result.effects).toEqual([]);
    expect(result.producedEvents).toEqual([]);
  });

  it("add-label changed=true → emit labels-updated + producedEvent", async () => {
    const client = makeClient();
    vi.mocked(addCardLabel).mockResolvedValue({ changed: true });

    const result = await executeRuleActions({
      client,
      rule: { ...baseRule, actions: [{ type: "add-label", labelId: "label-1" }] },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "",
      chainDepth: 0,
    });

    expect(result.effects).toContainEqual({
      kind: "labels-updated",
      boardId: "board-1",
      cardId: "card-1",
    });
    expect(result.producedEvents).toContainEqual({
      triggerType: "label-added-to-card",
      payload: { cardId: "card-1", boardId: "board-1", labelId: "label-1" },
    });
  });

  // ── remove-label ───────────────────────────────────────────────────

  it("remove-label changed=true → emit labels-updated, no producedEvent", async () => {
    const client = makeClient();
    vi.mocked(removeCardLabel).mockResolvedValue({ changed: true });

    const result = await executeRuleActions({
      client,
      rule: { ...baseRule, actions: [{ type: "remove-label", labelId: "label-1" }] },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "",
      chainDepth: 0,
    });

    expect(result.effects).toContainEqual({
      kind: "labels-updated",
      boardId: "board-1",
      cardId: "card-1",
    });
    expect(result.producedEvents).toEqual([]);
  });

  // ── assign-member ──────────────────────────────────────────────────

  it("assign-member: resolver used, newly-assigned id yields producedEvent + emit", async () => {
    const client = makeClient();
    vi.mocked(resolveRecipient).mockResolvedValue(["user-42"]);
    vi.mocked(assignMemberToCard).mockResolvedValue({
      member: { id: "user-42", name: "User", image: null, email: "u@e.com" },
      changed: true,
    });

    const result = await executeRuleActions({
      client,
      rule: { ...baseRule, actions: [{ type: "assign-member", recipient: "card-assignees" }] },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "",
      chainDepth: 0,
    });

    expect(resolveRecipient).toHaveBeenCalledWith(client, "card-assignees", {
      cardId: "card-1",
      workspaceId: "ws-1",
    });
    expect(assignMemberToCard).toHaveBeenCalledWith({ cardId: "card-1", userId: "user-42" }, client);
    expect(buildCardMemberAssignedEvent).toHaveBeenCalledWith(
      "ws-1",
      "board-1",
      "card-1",
      { targetUserId: "user-42", memberIds: ["user-42"] },
      ACTOR,
    );
    expect(recordCardHistoryEvents).toHaveBeenCalledWith(
      client,
      expect.arrayContaining([expect.objectContaining({ ruleId: "rule-1" })]),
    );
    expect(result.producedEvents).toContainEqual({
      triggerType: "member-assigned",
      payload: { cardId: "card-1", boardId: "board-1", memberId: "user-42" },
    });
    expect(result.effects).toContainEqual({
      kind: "members-updated",
      boardId: "board-1",
      cardId: "card-1",
    });
  });

  it("assign-member: changed=false → no emit, no producedEvent, no history", async () => {
    const client = makeClient();
    vi.mocked(resolveRecipient).mockResolvedValue(["user-42"]);
    vi.mocked(assignMemberToCard).mockResolvedValue({
      member: { id: "user-42", name: "User", image: null, email: "u@e.com" },
      changed: false,
    });

    const result = await executeRuleActions({
      client,
      rule: { ...baseRule, actions: [{ type: "assign-member", recipient: "user-42" }] },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "",
      chainDepth: 0,
    });

    expect(result.effects).toEqual([]);
    expect(result.producedEvents).toEqual([]);
    expect(recordCardHistoryEvents).not.toHaveBeenCalled();
  });

  // ── remove-member ──────────────────────────────────────────────────

  it("remove-member: resolveRemoveScope used, removeMemberFromCard called per id", async () => {
    const client = makeClient();
    vi.mocked(resolveRemoveScope).mockResolvedValue(["user-a", "user-b"]);
    vi.mocked(removeMemberFromCard).mockResolvedValue({ changed: true });

    const result = await executeRuleActions({
      client,
      rule: { ...baseRule, actions: [{ type: "remove-member", scope: "all" }] },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "",
      chainDepth: 0,
    });

    expect(resolveRemoveScope).toHaveBeenCalledWith(client, "all", {
      cardId: "card-1",
      workspaceId: "ws-1",
    });
    expect(removeMemberFromCard).toHaveBeenCalledTimes(2);
    expect(removeMemberFromCard).toHaveBeenCalledWith({ cardId: "card-1", userId: "user-a" }, client);
    expect(removeMemberFromCard).toHaveBeenCalledWith({ cardId: "card-1", userId: "user-b" }, client);
    expect(buildCardMemberUnassignedEvent).toHaveBeenCalledTimes(2);
    expect(result.effects).toContainEqual({
      kind: "members-updated",
      boardId: "board-1",
      cardId: "card-1",
    });
  });

  it("remove-member: no changed → no emit", async () => {
    const client = makeClient();
    vi.mocked(resolveRemoveScope).mockResolvedValue(["user-a"]);
    vi.mocked(removeMemberFromCard).mockResolvedValue({ changed: false });

    const result = await executeRuleActions({
      client,
      rule: { ...baseRule, actions: [{ type: "remove-member", scope: "user-a" }] },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "",
      chainDepth: 0,
    });

    expect(result.effects).toEqual([]);
  });

  // ── set-completion ─────────────────────────────────────────────────

  describe("set-completion", () => {
    it("transitioned=true → emit + producedEvent + history", async () => {
      const client = makeClient();
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;
      const cardMemberFindMany = client.cardMember.findMany as ReturnType<typeof vi.fn>;

      cardFindUniqueOrThrow.mockResolvedValue({
        completedAt: null,
        listId: "list-1",
        estimateHours: 5,
        dueDate: new Date("2025-01-01"),
      });
      cardMemberFindMany.mockResolvedValue([{ userId: "user-a" }]);
      vi.mocked(setCardCompletion).mockResolvedValue({
        card: { id: "card-1", listId: "list-1" } as never,
        transitioned: true,
      });

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions: [{ type: "set-completion", completed: true }] },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      });

      expect(setCardCompletion).toHaveBeenCalledWith(
        client,
        "card-1",
        true,
        null,
      );
      expect(buildCardCompletedEvent).toHaveBeenCalledWith(
        "ws-1",
        "board-1",
        "card-1",
        expect.objectContaining({ listId: "list-1", firstCompletion: true }),
        ACTOR,
      );
      expect(recordCardHistoryEvents).toHaveBeenCalledWith(
        client,
        expect.arrayContaining([expect.objectContaining({ ruleId: "rule-1" })]),
      );
      expect(result.effects).toContainEqual({
        kind: "completion-updated",
        boardId: "board-1",
        cardId: "card-1",
        completed: true,
      });
      expect(result.producedEvents).toContainEqual({
        triggerType: "card-completed",
        payload: { cardId: "card-1", boardId: "board-1", listId: "list-1", completed: true },
      });
    });

    it("transitioned=false (no-op) → emits nothing, no producedEvent/history", async () => {
      const client = makeClient();
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;
      const cardMemberFindMany = client.cardMember.findMany as ReturnType<typeof vi.fn>;

      cardFindUniqueOrThrow.mockResolvedValue({
        completedAt: new Date(),
        listId: "list-1",
        estimateHours: null,
        dueDate: null,
      });
      cardMemberFindMany.mockResolvedValue([]);
      vi.mocked(setCardCompletion).mockResolvedValue({
        card: { id: "card-1", listId: "list-1" } as never,
        transitioned: false,
      });

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions: [{ type: "set-completion", completed: true }] },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      });

      // A no-op set-completion (card already in the requested state) must not
      // broadcast a redundant completion event.
      expect(result.effects).toEqual([]);
      expect(result.producedEvents).toEqual([]);
      expect(recordCardHistoryEvents).not.toHaveBeenCalled();
    });

    it("set-completion false (reopen) with transition → produces card-reopened event", async () => {
      const client = makeClient();
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;
      const cardMemberFindMany = client.cardMember.findMany as ReturnType<typeof vi.fn>;

      cardFindUniqueOrThrow.mockResolvedValue({
        completedAt: new Date(),
        listId: "list-1",
        estimateHours: null,
        dueDate: null,
      });
      cardMemberFindMany.mockResolvedValue([]);
      vi.mocked(setCardCompletion).mockResolvedValue({
        card: { id: "card-1", listId: "list-1" } as never,
        transitioned: true,
      });

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions: [{ type: "set-completion", completed: false }] },
        event: baseEvent,
        actorId: ACTOR,
        triggerType: "card-moved-to-list",
        chainId: "",
        chainDepth: 0,
      });

      expect(result.effects).toContainEqual({
        kind: "completion-updated",
        boardId: "board-1",
        cardId: "card-1",
        completed: false,
      });
      expect(result.producedEvents).toContainEqual({
        triggerType: "card-reopened",
        payload: { cardId: "card-1", boardId: "board-1", listId: "list-1", completed: false },
      });
    });
  });

  // ── notify-member ──────────────────────────────────────────────────

  it("notify-member: no mutation, pushes DeferredNotification per resolved recipient", async () => {
    const client = makeClient();
    vi.mocked(resolveRecipient).mockResolvedValue(["user-a", "user-b"]);

    const result = await executeRuleActions({
      client,
      rule: {
        ...baseRule,
        actions: [{ type: "notify-member", recipient: "card-assignees", message: "Hello!" }],
      },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "",
      chainDepth: 0,
    });

    expect(resolveRecipient).toHaveBeenCalledWith(client, "card-assignees", {
      cardId: "card-1",
      workspaceId: "ws-1",
    });
    expect(result.effects).toEqual([
      { kind: "notify-member", recipientId: "user-a", cardId: "card-1", message: "Hello!", actorId: ACTOR },
      { kind: "notify-member", recipientId: "user-b", cardId: "card-1", message: "Hello!", actorId: ACTOR },
    ]);
    expect(result.producedEvents).toEqual([]);
    // No DB mutations
    expect(updateCardPriority).not.toHaveBeenCalled();
    expect(addCardLabel).not.toHaveBeenCalled();
    expect(assignMemberToCard).not.toHaveBeenCalled();
    expect(recordCardHistoryEvents).not.toHaveBeenCalled();
  });

  it("notify-member: no message → DeferredNotification has undefined message", async () => {
    const client = makeClient();
    vi.mocked(resolveRecipient).mockResolvedValue(["user-a"]);

    const result = await executeRuleActions({
      client,
      rule: {
        ...baseRule,
        actions: [{ type: "notify-member", recipient: "user-a" }],
      },
      event: baseEvent,
      actorId: ACTOR,
      triggerType: "card-moved-to-list",
      chainId: "",
      chainDepth: 0,
    });

    expect(result.effects).toEqual([
      { kind: "notify-member", recipientId: "user-a", cardId: "card-1", actorId: ACTOR },
    ]);
  });
});
