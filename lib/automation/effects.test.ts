import { describe, it, expect, vi, beforeEach } from "vitest";

import { fireDeferredEffects } from "./effects";

vi.mock("@/lib/prisma", () => ({
  default: {
    card: {
      findUnique: vi.fn(async () => ({
        title: "My Card",
        completedAt: new Date("2026-07-06T00:00:00.000Z"),
        listId: "l2",
        position: 100,
        moveRevision: 7,
      })),
    },
  },
}));
vi.mock("@/lib/label", () => ({
  getCardLabels: vi.fn(async () => [{ id: "lab1", boardId: "b1", name: "Bug", color: "red" }]),
}));
vi.mock("@/lib/card-member", () => ({
  getCardMembers: vi.fn(async () => [{ id: "u1", name: "Ada", image: null, email: "a@x.io" }]),
}));
vi.mock("@/lib/notification", () => ({
  notifyAutomation: vi.fn(async () => {}),
}));
vi.mock("@/lib/realtime/server", () => ({
  emitCardMoved: vi.fn(),
  emitCardUpdated: vi.fn(),
  emitCardLabelsUpdated: vi.fn(),
  emitCardMembersUpdated: vi.fn(),
  emitCardCompletionUpdated: vi.fn(),
}));

import {
  emitCardMoved,
  emitCardUpdated,
  emitCardLabelsUpdated,
  emitCardMembersUpdated,
  emitCardCompletionUpdated,
} from "@/lib/realtime/server";
import { notifyAutomation } from "@/lib/notification";

beforeEach(() => vi.clearAllMocks());

describe("fireDeferredEffects — descriptor → emitter mapping", () => {
  it("card-moved re-reads the card's COMMITTED list/position/moveRevision and emits the canonical snapshot (decision 0032)", async () => {
    await fireDeferredEffects([
      {
        kind: "card-moved",
        boardId: "b1",
        cardId: "c1",
        listId: "l2",
        position: 100,
        moveRevision: 7,
      },
    ]);
    // The descriptor is only a trigger hint; the echo carries the committed
    // values (a later rule step may have moved the card again) + the revision.
    expect(emitCardMoved).toHaveBeenCalledWith("b1", {
      cardId: "c1",
      listId: "l2",
      position: 100,
      moveRevision: 7,
    });
  });

  it("labels-updated re-reads the card's labels and emits the snapshot", async () => {
    await fireDeferredEffects([{ kind: "labels-updated", boardId: "b1", cardId: "c1" }]);
    expect(emitCardLabelsUpdated).toHaveBeenCalledWith("b1", {
      cardId: "c1",
      labels: [{ id: "lab1", name: "Bug", color: "red" }],
    });
  });

  it("members-updated re-reads members and emits the snapshot", async () => {
    await fireDeferredEffects([{ kind: "members-updated", boardId: "b1", cardId: "c1" }]);
    expect(emitCardMembersUpdated).toHaveBeenCalledWith("b1", {
      cardId: "c1",
      members: [{ id: "u1", name: "Ada", image: null, email: "a@x.io" }],
    });
  });

  it("completion-updated re-reads completedAt and emits the ISO string", async () => {
    await fireDeferredEffects([
      { kind: "completion-updated", boardId: "b1", cardId: "c1", completed: true },
    ]);
    expect(emitCardCompletionUpdated).toHaveBeenCalledWith("b1", {
      cardId: "c1",
      completedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("card-updated re-reads the title and emits it", async () => {
    await fireDeferredEffects([{ kind: "card-updated", boardId: "b1", cardId: "c1" }]);
    expect(emitCardUpdated).toHaveBeenCalledWith("b1", { cardId: "c1", title: "My Card" });
  });

  it("notify-member delivers an automation notification", async () => {
    await fireDeferredEffects([
      { kind: "notify-member", recipientId: "u1", cardId: "c1", message: "heads up", actorId: "sys" },
    ]);
    expect(notifyAutomation).toHaveBeenCalledWith({
      recipientUserId: "u1",
      cardId: "c1",
      message: "heads up",
    });
  });

  it("is best-effort: one failing effect does not prevent the others", async () => {
    vi.mocked(emitCardMoved).mockImplementationOnce(() => {
      throw new Error("socket down");
    });
    await fireDeferredEffects([
      {
        kind: "card-moved",
        boardId: "b1",
        cardId: "c1",
        listId: "l2",
        position: 1,
        moveRevision: 7,
      },
      { kind: "card-updated", boardId: "b1", cardId: "c2" },
    ]);
    // The second effect still fired despite the first throwing.
    expect(emitCardUpdated).toHaveBeenCalledWith("b1", { cardId: "c2", title: "My Card" });
  });
});
