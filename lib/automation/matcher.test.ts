import { describe, expect, it } from "vitest";

import type { TriggerType } from "@/lib/schemas/automation";

import { matchTrigger, evaluateConditions } from "./matcher";
import type { RuleEventPayload } from "./types";

describe("matchTrigger", () => {
  it("returns true for equal trigger types", () => {
    expect(matchTrigger("card-created", "card-created")).toBe(true);
    expect(
      matchTrigger("card-moved-to-list", "card-moved-to-list"),
    ).toBe(true);
  });

  it("returns false for different trigger types", () => {
    expect(matchTrigger("card-created", "card-moved-to-list")).toBe(false);
    expect(
      matchTrigger("card-moved-to-list", "label-added-to-card"),
    ).toBe(false);
  });
});

describe("evaluateConditions", () => {
  // Helper: a minimal payload with sensible defaults for most tests.
  const base: RuleEventPayload = {
    cardId: "card-1",
    boardId: "board-1",
    listId: "list-1",
    labelId: "label-1",
    priority: "HIGH",
    memberId: "member-1",
  };

  // Non-move trigger used in most condition tests (avoids listId→listIdTo
  // special-casing unless the test explicitly exercises it).
  const nonMove: TriggerType = "card-created";

  // --- boardId ---
  it("matches when boardId equals the payload", () => {
    expect(
      evaluateConditions(nonMove, { boardId: "board-1" }, base),
    ).toBe(true);
  });

  it("does not match when boardId differs", () => {
    expect(
      evaluateConditions(nonMove, { boardId: "board-2" }, base),
    ).toBe(false);
  });

  // --- listId (non-move) ---
  it("matches listId against payload.listId for non-move triggers", () => {
    expect(
      evaluateConditions(nonMove, { listId: "list-1" }, base),
    ).toBe(true);
  });

  it("does not match listId when payload.listId differs", () => {
    expect(
      evaluateConditions(nonMove, { listId: "list-2" }, base),
    ).toBe(false);
  });

  // --- labelId ---
  it("matches when labelId equals the payload", () => {
    expect(
      evaluateConditions(nonMove, { labelId: "label-1" }, base),
    ).toBe(true);
  });

  it("does not match when labelId differs", () => {
    expect(
      evaluateConditions(nonMove, { labelId: "label-2" }, base),
    ).toBe(false);
  });

  // --- priority ---
  it("matches when priority equals the payload", () => {
    expect(
      evaluateConditions(nonMove, { priority: "HIGH" }, base),
    ).toBe(true);
  });

  it("does not match when priority differs", () => {
    expect(
      evaluateConditions(nonMove, { priority: "LOW" }, base),
    ).toBe(false);
  });

  // --- combined (AND semantics) ---
  it("matches when all present conditions are satisfied (AND)", () => {
    expect(
      evaluateConditions(
        nonMove,
        { boardId: "board-1", listId: "list-1", priority: "HIGH" },
        base,
      ),
    ).toBe(true);
  });

  it("does not match when any one condition fails (AND)", () => {
    expect(
      evaluateConditions(
        nonMove,
        { boardId: "board-1", listId: "list-1", priority: "LOW" },
        base,
      ),
    ).toBe(false);
  });

  // --- empty config ---
  it("matches everything when triggerConfig is empty", () => {
    expect(evaluateConditions(nonMove, {}, base)).toBe(true);
  });

  // --- undefined payload field ---
  it("returns false when the filtered field is undefined in the payload", () => {
    const noLabel: RuleEventPayload = { ...base, labelId: undefined };
    expect(
      evaluateConditions(nonMove, { labelId: "label-1" }, noLabel),
    ).toBe(false);
  });

  describe("card-moved-to-list trigger", () => {
    const moveTrigger: TriggerType = "card-moved-to-list";
    const movePayload: RuleEventPayload = {
      cardId: "card-1",
      boardId: "board-1",
      listIdFrom: "list-done",
      listIdTo: "list-archived",
    };

    it("matches listId against payload.listIdTo (destination)", () => {
      expect(
        evaluateConditions(
          moveTrigger,
          { listId: "list-archived" },
          movePayload,
        ),
      ).toBe(true);
    });

    it("does not match listId when it differs from listIdTo", () => {
      expect(
        evaluateConditions(
          moveTrigger,
          { listId: "list-other" },
          movePayload,
        ),
      ).toBe(false);
    });

    it("matches fromListId against payload.listIdFrom", () => {
      expect(
        evaluateConditions(
          moveTrigger,
          { fromListId: "list-done" },
          movePayload,
        ),
      ).toBe(true);
    });

    it("does not match fromListId when it differs from listIdFrom", () => {
      expect(
        evaluateConditions(
          moveTrigger,
          { fromListId: "list-other" },
          movePayload,
        ),
      ).toBe(false);
    });
  });

  // --- fromListId on non-move triggers (stricter: present → no match) ---

  it("returns false when fromListId is set on a non-move trigger", () => {
    expect(
      evaluateConditions(
        nonMove,
        { fromListId: "list-1" },
        base,
      ),
    ).toBe(false);
  });
});
