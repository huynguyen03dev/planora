import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Prisma } from "@/app/generated/prisma/client";

import type { ActionStep } from "@/lib/schemas/automation";

import type { RuleEventPayload } from "./types";
import { CARD_POSITION_GAP } from "@/lib/ordering";

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock("@/lib/card", () => ({
  updateCardPriority: vi.fn().mockResolvedValue({}),
  setCardCompletion: vi.fn().mockResolvedValue({
    card: { id: "card-1", listId: "list-1" },
    transitioned: true,
  }),
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
}));

// ─── Imports (after mocks) ───────────────────────────────────────────

import { executeRuleActions } from "./executor";
import { updateCardPriority, setCardCompletion } from "@/lib/card";
import { addCardLabel, removeCardLabel } from "@/lib/label";
import { assignMemberToCard, removeMemberFromCard } from "@/lib/card-member";
import {
  buildCardMoveLifecycleEvents,
  buildCardCompletedEvent,
  buildCardMemberAssignedEvent,
  buildCardMemberUnassignedEvent,
  recordCardHistoryEvents,
} from "@/lib/card-history";
import { resolveRecipient, resolveRemoveScope } from "./resolver";

// ─── Helpers ─────────────────────────────────────────────────────────

function makeClient(): Prisma.TransactionClient {
  return {
    card: {
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    cardMember: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    cardHistoryEvent: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as Prisma.TransactionClient;
}

const baseRule = {
  id: "rule-1",
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
    });

    expect(callOrder).toEqual(["updateCardPriority", "addCardLabel"]);
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
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;
      const cardFindFirst = client.card.findFirst as ReturnType<typeof vi.fn>;
      const cardUpdate = client.card.update as ReturnType<typeof vi.fn>;
      const cardMemberFindMany = client.cardMember.findMany as ReturnType<typeof vi.fn>;

      cardFindUniqueOrThrow.mockResolvedValue({
        listId: "list-1",
        estimateHours: 5,
      });
      cardMemberFindMany.mockResolvedValue([{ userId: "user-a" }]);
      cardFindFirst.mockResolvedValue({ position: 32768 });

      const actions: ActionStep[] = [{ type: "move-card-to-list", targetListId: "list-2" }];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
      });

      expect(cardFindFirst).toHaveBeenCalledWith({
        where: { listId: "list-2", archivedAt: null, deletedAt: null },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      expect(cardUpdate).toHaveBeenCalledWith({
        where: { id: "card-1" },
        data: { listId: "list-2", position: 32768 + CARD_POSITION_GAP },
      });
      expect(result.effects).toContainEqual({
        kind: "card-moved",
        boardId: "board-1",
        cardId: "card-1",
        listId: "list-2",
        position: 32768 + CARD_POSITION_GAP,
      });
      expect(result.producedEvents).toContainEqual({
        triggerType: "card-moved-to-list",
        payload: { cardId: "card-1", boardId: "board-1", listIdFrom: "list-1", listIdTo: "list-2" },
      });
    });

    it("appends with CARD_POSITION_GAP when target list is empty", async () => {
      const client = makeClient();
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;
      const cardFindFirst = client.card.findFirst as ReturnType<typeof vi.fn>;
      const cardUpdate = client.card.update as ReturnType<typeof vi.fn>;
      const cardMemberFindMany = client.cardMember.findMany as ReturnType<typeof vi.fn>;

      cardFindUniqueOrThrow.mockResolvedValue({
        listId: "list-1",
        estimateHours: null,
      });
      cardMemberFindMany.mockResolvedValue([]);
      cardFindFirst.mockResolvedValue(null);

      const actions: ActionStep[] = [{ type: "move-card-to-list", targetListId: "list-empty" }];

      const result = await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
      });

      expect(cardUpdate).toHaveBeenCalledWith({
        where: { id: "card-1" },
        data: { listId: "list-empty", position: CARD_POSITION_GAP },
      });
      expect(result.effects).toContainEqual(
        expect.objectContaining({ position: CARD_POSITION_GAP }),
      );
    });

    it("records move history event with ruleId", async () => {
      const client = makeClient();
      const cardFindUniqueOrThrow = client.card.findUniqueOrThrow as ReturnType<typeof vi.fn>;
      const cardFindFirst = client.card.findFirst as ReturnType<typeof vi.fn>;
      const cardMemberFindMany = client.cardMember.findMany as ReturnType<typeof vi.fn>;

      cardFindUniqueOrThrow.mockResolvedValue({
        listId: "list-1",
        estimateHours: 3,
      });
      cardMemberFindMany.mockResolvedValue([{ userId: "user-a" }]);
      cardFindFirst.mockResolvedValue(null);

      const actions: ActionStep[] = [{ type: "move-card-to-list", targetListId: "list-2" }];

      await executeRuleActions({
        client,
        rule: { ...baseRule, actions },
        event: baseEvent,
        actorId: ACTOR,
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
    });

    expect(result.effects).toEqual([
      { kind: "notify-member", recipientId: "user-a", cardId: "card-1", actorId: ACTOR },
    ]);
  });
});
