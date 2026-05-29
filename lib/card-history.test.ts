import type { Prisma } from "@/app/generated/prisma/client";
import { describe, it, expect, vi } from "vitest";
import {
  buildCardHistoryEvent,
  buildCardCreatedEvent,
  buildCardMovedEvent,
  buildCardCompletedEvent,
  buildEstimateChangedEvent,
  buildCardMoveLifecycleEvents,
  recordCardHistoryEvents,
  CardHistoryEventType,
  type BuildCardHistoryEventInput,
  type CardCreatedMetadata,
  type CardMovedMetadata,
  type CardCompletedMetadata,
  type EstimateChangedMetadata,
} from "./card-history";

describe("card-history", () => {
  describe("buildCardHistoryEvent", () => {
    it("should build a valid history event", () => {
      const input = {
        workspaceId: "ws-1",
        boardId: "board-1",
        cardId: "card-1",
        actorId: "user-1",
        eventType: CardHistoryEventType.CARD_CREATED,
        metadata: {
          listId: "list-1",
          listIsDone: false,
          estimateHours: 4,
          dueDate: null,
          memberIds: ["user-1"],
          archivedAt: null,
          deletedAt: null,
        },
      };

      const result = buildCardHistoryEvent(input);

      expect(result.workspaceId).toBe("ws-1");
      expect(result.boardId).toBe("board-1");
      expect(result.cardId).toBe("card-1");
      expect(result.actorId).toBe("user-1");
      expect(result.eventType).toBe(CardHistoryEventType.CARD_CREATED);
      expect(result.metadata).toEqual(input.metadata);
    });
  });

  describe("recordCardHistoryEvents", () => {
    it("should skip createMany when there are no events", async () => {
      const tx = {
        cardHistoryEvent: {
          createMany: vi.fn(),
        },
      } as unknown as Prisma.TransactionClient;

      await recordCardHistoryEvents(tx, []);

      expect(tx.cardHistoryEvent.createMany).not.toHaveBeenCalled();
    });

    it("should append multiple events in one createMany call", async () => {
      const tx = {
        cardHistoryEvent: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      } as unknown as Prisma.TransactionClient;

      const events: BuildCardHistoryEventInput[] = [
        {
          workspaceId: "ws-1",
          boardId: "board-1",
          cardId: "card-1",
          eventType: CardHistoryEventType.CARD_CREATED,
          metadata: {
            listId: "list-1",
            listIsDone: false,
            estimateHours: 4,
            dueDate: null,
            memberIds: ["user-1"],
            archivedAt: null,
            deletedAt: null,
          },
        },
        {
          workspaceId: "ws-1",
          boardId: "board-1",
          cardId: "card-1",
          eventType: CardHistoryEventType.ESTIMATE_CHANGED,
          metadata: {
            previousEstimateHours: 2,
            nextEstimateHours: 4,
            memberIds: ["user-1"],
          },
        },
      ];

      await recordCardHistoryEvents(tx, events);

      const mockFn = tx.cardHistoryEvent.createMany as unknown as ReturnType<typeof vi.fn>;
      expect(mockFn).toHaveBeenCalledTimes(1);
      const firstCallData = mockFn.mock.calls[0]?.[0]?.data;
      expect(firstCallData).toBeDefined();
      expect(Array.isArray(firstCallData) ? firstCallData : [firstCallData]).toHaveLength(2);
    });

    it("should throw when metadata is missing", () => {
      expect(() =>
        buildCardHistoryEvent({
          workspaceId: "ws-1",
          boardId: "board-1",
          cardId: "card-1",
          eventType: CardHistoryEventType.CARD_CREATED,
          metadata: null,
        } as unknown as BuildCardHistoryEventInput),
      ).toThrow("Card history event metadata is required");
    });
  });

  describe("event builders", () => {
    it("should build CARD_CREATED event", () => {
      const result = buildCardCreatedEvent(
        "ws-1",
        "board-1",
        "card-1",
        {
          listId: "list-1",
          listIsDone: false,
          estimateHours: 8,
          dueDate: null,
          memberIds: [],
          archivedAt: null,
          deletedAt: null,
        },
        "user-1",
      );

      expect(result.eventType).toBe(CardHistoryEventType.CARD_CREATED);
      const meta = result.metadata as CardCreatedMetadata;
      expect(meta.estimateHours).toBe(8);
    });

    it("should build CARD_MOVED event", () => {
      const result = buildCardMovedEvent(
        "ws-1",
        "board-1",
        "card-1",
        {
          fromListId: "list-1",
          toListId: "list-2",
          fromListIsDone: false,
          toListIsDone: true,
          memberIds: ["user-1"],
          estimateHours: 4,
        },
        "user-1",
      );

      expect(result.eventType).toBe(CardHistoryEventType.CARD_MOVED);
      const meta = result.metadata as CardMovedMetadata;
      expect(meta.toListIsDone).toBe(true);
      expect(meta.fromListIsDone).toBe(false);
    });

    it("should build CARD_COMPLETED event with firstCompletion flag", () => {
      const result = buildCardCompletedEvent(
        "ws-1",
        "board-1",
        "card-1",
        {
          listId: "list-2",
          estimateHours: 4,
          dueDate: null,
          memberIds: ["user-1"],
          firstCompletion: true,
        },
        "user-1",
      );

      expect(result.eventType).toBe(CardHistoryEventType.CARD_COMPLETED);
      const meta = result.metadata as CardCompletedMetadata;
      expect(meta.firstCompletion).toBe(true);
    });

    it("should build ESTIMATE_CHANGED event with before/after values", () => {
      const result = buildEstimateChangedEvent(
        "ws-1",
        "board-1",
        "card-1",
        {
          previousEstimateHours: 2,
          nextEstimateHours: 4,
          memberIds: ["user-1"],
        },
        "user-1",
      );

      expect(result.eventType).toBe(CardHistoryEventType.ESTIMATE_CHANGED);
      const meta = result.metadata as EstimateChangedMetadata;
      expect(meta.previousEstimateHours).toBe(2);
      expect(meta.nextEstimateHours).toBe(4);
    });

    it("should build only CARD_MOVED for active-to-active moves", () => {
      const result = buildCardMoveLifecycleEvents({
        workspaceId: "ws-1",
        boardId: "board-1",
        cardId: "card-1",
        actorId: "user-1",
        fromListId: "todo",
        toListId: "doing",
        fromListIsDone: false,
        toListIsDone: false,
        estimateHours: 4,
        dueDate: null,
        memberIds: ["user-1"],
        completedAtBeforeMove: null,
      });

      expect(result.map((event) => event.eventType)).toEqual([
        CardHistoryEventType.CARD_MOVED,
      ]);
    });

    it("should build CARD_MOVED and first CARD_COMPLETED for active-to-done moves", () => {
      const result = buildCardMoveLifecycleEvents({
        workspaceId: "ws-1",
        boardId: "board-1",
        cardId: "card-1",
        actorId: "user-1",
        fromListId: "doing",
        toListId: "done",
        fromListIsDone: false,
        toListIsDone: true,
        estimateHours: 8,
        dueDate: "2026-01-03T00:00:00.000Z",
        memberIds: ["user-1"],
        completedAtBeforeMove: null,
      });

      expect(result.map((event) => event.eventType)).toEqual([
        CardHistoryEventType.CARD_MOVED,
        CardHistoryEventType.CARD_COMPLETED,
      ]);
      expect(result[1].metadata).toEqual({
        listId: "done",
        estimateHours: 8,
        dueDate: "2026-01-03T00:00:00.000Z",
        memberIds: ["user-1"],
        firstCompletion: true,
      });
    });

    it("should build CARD_MOVED with non-first completion when a completed card moves back into done", () => {
      const result = buildCardMoveLifecycleEvents({
        workspaceId: "ws-1",
        boardId: "board-1",
        cardId: "card-1",
        actorId: "user-1",
        fromListId: "doing",
        toListId: "done",
        fromListIsDone: false,
        toListIsDone: true,
        estimateHours: 8,
        dueDate: null,
        memberIds: ["user-1"],
        completedAtBeforeMove: new Date("2026-01-01T00:00:00.000Z"),
      });

      expect(result.map((event) => event.eventType)).toEqual([
        CardHistoryEventType.CARD_MOVED,
        CardHistoryEventType.CARD_COMPLETED,
      ]);
      expect(result[1].metadata).toEqual({
        listId: "done",
        estimateHours: 8,
        dueDate: null,
        memberIds: ["user-1"],
        firstCompletion: false,
      });
    });

    it("should build only CARD_MOVED for done-to-done moves", () => {
      const result = buildCardMoveLifecycleEvents({
        workspaceId: "ws-1",
        boardId: "board-1",
        cardId: "card-1",
        actorId: "user-1",
        fromListId: "review-done",
        toListId: "done",
        fromListIsDone: true,
        toListIsDone: true,
        estimateHours: 4,
        dueDate: null,
        memberIds: ["user-1"],
        completedAtBeforeMove: new Date("2026-01-01T00:00:00.000Z"),
      });

      expect(result.map((event) => event.eventType)).toEqual([
        CardHistoryEventType.CARD_MOVED,
      ]);
    });

    it("should build CARD_MOVED and CARD_REOPENED for done-to-active moves", () => {
      const result = buildCardMoveLifecycleEvents({
        workspaceId: "ws-1",
        boardId: "board-1",
        cardId: "card-1",
        actorId: "user-1",
        fromListId: "done",
        toListId: "doing",
        fromListIsDone: true,
        toListIsDone: false,
        estimateHours: 4,
        dueDate: "2026-01-03T00:00:00.000Z",
        memberIds: ["user-1"],
        completedAtBeforeMove: new Date("2026-01-01T00:00:00.000Z"),
      });

      expect(result.map((event) => event.eventType)).toEqual([
        CardHistoryEventType.CARD_MOVED,
        CardHistoryEventType.CARD_REOPENED,
      ]);
      expect(result[1].metadata).toEqual({
        listId: "doing",
        dueDate: "2026-01-03T00:00:00.000Z",
        memberIds: ["user-1"],
      });
    });
  });

  describe("event type enum", () => {
    it("should have all required event types", () => {
      expect(CardHistoryEventType.CARD_CREATED).toBe("CARD_CREATED");
      expect(CardHistoryEventType.CARD_MOVED).toBe("CARD_MOVED");
      expect(CardHistoryEventType.CARD_COMPLETED).toBe("CARD_COMPLETED");
      expect(CardHistoryEventType.CARD_REOPENED).toBe("CARD_REOPENED");
      expect(CardHistoryEventType.ESTIMATE_SET).toBe("ESTIMATE_SET");
      expect(CardHistoryEventType.ESTIMATE_CHANGED).toBe("ESTIMATE_CHANGED");
      expect(CardHistoryEventType.DUE_DATE_SET).toBe("DUE_DATE_SET");
      expect(CardHistoryEventType.DUE_DATE_CHANGED).toBe("DUE_DATE_CHANGED");
      expect(CardHistoryEventType.DUE_DATE_CLEARED).toBe("DUE_DATE_CLEARED");
      expect(CardHistoryEventType.CARD_MEMBER_ASSIGNED).toBe("CARD_MEMBER_ASSIGNED");
      expect(CardHistoryEventType.CARD_MEMBER_UNASSIGNED).toBe("CARD_MEMBER_UNASSIGNED");
      expect(CardHistoryEventType.CARD_ARCHIVED).toBe("CARD_ARCHIVED");
      expect(CardHistoryEventType.CARD_RESTORED).toBe("CARD_RESTORED");
      expect(CardHistoryEventType.CARD_DELETED).toBe("CARD_DELETED");
      expect(CardHistoryEventType.BASELINE_CAPTURED).toBe("BASELINE_CAPTURED");
    });
  });
});
