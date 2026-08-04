import { afterEach, describe, expect, it, vi } from "vitest";

import { ROOMS } from "./events";
import {
  emitBoardArchived,
  emitBoardDeleted,
  emitCardMetaUpdated,
  emitInvitationNew,
  kickUserSockets,
} from "./server";

/**
 * US-083 W2 — `invitation:new` emitter room scoping.
 *
 * The live-arrival signal must reach ONLY the invitee's own user room. Any
 * wider target (workspace/board/global) would leak invitation arrival across
 * users — the W2 denial contract (Carol must observe no badge change).
 * `getIO()` reads `global.io`, so the fake is installed there.
 */
function installFakeIo() {
  const emit = vi.fn();
  const disconnectSockets = vi.fn();
  const to = vi.fn(() => ({ emit }));
  const inRoom = vi.fn(() => ({ disconnectSockets }));
  const io = { to, in: inRoom };
  (globalThis as { io?: unknown }).io = io;
  return { io, to, emit, inRoom, disconnectSockets };
}

describe("emitInvitationNew (US-083 W2)", () => {
  afterEach(() => {
    delete (globalThis as { io?: unknown }).io;
  });

  it("targets only the invitee's user room", () => {
    const { to } = installFakeIo();

    emitInvitationNew("invitee-user-1", { invitationId: "inv-1" });

    expect(to).toHaveBeenCalledWith(ROOMS.user("invitee-user-1"));
  });

  it("emits the minimal non-sensitive payload on the typed event", () => {
    const { emit } = installFakeIo();

    emitInvitationNew("invitee-user-1", { invitationId: "inv-1" });

    expect(emit).toHaveBeenCalledWith("invitation:new", { invitationId: "inv-1" });
  });

  it("never touches a board or workspace room", () => {
    const { to } = installFakeIo();

    emitInvitationNew("invitee-user-1", { invitationId: "inv-1" });

    expect(to).not.toHaveBeenCalledWith(ROOMS.board(expect.any(String)));
    expect(to).not.toHaveBeenCalledWith(ROOMS.workspace(expect.any(String)));
    expect(to).toHaveBeenCalledTimes(1);
  });

  it("is a silent no-op when IO is not initialized", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => emitInvitationNew("invitee-user-1", { invitationId: "inv-1" })).not.toThrow();

    errorSpy.mockRestore();
  });
});

describe("emitCardMetaUpdated (F3)", () => {
  afterEach(() => {
    delete (globalThis as { io?: unknown }).io;
  });

  it("targets the board room with the cardId + partial fields payload", () => {
    const { to, emit } = installFakeIo();

    emitCardMetaUpdated("board-1", {
      cardId: "card-1",
      fields: { dueDate: "2026-08-15T12:00:00.000Z", priority: "URGENT" },
    });

    expect(to).toHaveBeenCalledWith(ROOMS.board("board-1"));
    expect(emit).toHaveBeenCalledWith("card:meta-updated", {
      boardId: "board-1",
      cardId: "card-1",
      fields: { dueDate: "2026-08-15T12:00:00.000Z", priority: "URGENT" },
    });
  });

  it("carries the full partial-patch shape (estimate + cover)", () => {
    const { emit } = installFakeIo();

    emitCardMetaUpdated("board-1", {
      cardId: "card-1",
      fields: { estimateHours: 4, coverImage: null },
    });

    expect(emit).toHaveBeenCalledWith(
      "card:meta-updated",
      expect.objectContaining({
        fields: { estimateHours: 4, coverImage: null },
      }),
    );
  });

  it("is a silent no-op when IO is not initialized", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      emitCardMetaUpdated("board-1", { cardId: "card-1", fields: { priority: null } }),
    ).not.toThrow();

    errorSpy.mockRestore();
  });
});

describe("emitBoardArchived / emitBoardDeleted (F10)", () => {
  afterEach(() => {
    delete (globalThis as { io?: unknown }).io;
  });

  it("emitBoardArchived targets the board room with boardId + ISO archivedAt", () => {
    const { to, emit } = installFakeIo();

    emitBoardArchived("board-1", "2026-08-05T00:00:00.000Z");

    expect(to).toHaveBeenCalledWith(ROOMS.board("board-1"));
    expect(emit).toHaveBeenCalledWith("board:archived", {
      boardId: "board-1",
      archivedAt: "2026-08-05T00:00:00.000Z",
    });
  });

  it("emitBoardDeleted targets the board room with boardId", () => {
    const { to, emit } = installFakeIo();

    emitBoardDeleted("board-1");

    expect(to).toHaveBeenCalledWith(ROOMS.board("board-1"));
    expect(emit).toHaveBeenCalledWith("board:deleted", { boardId: "board-1" });
  });

  it("both are silent no-ops when IO is not initialized", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => emitBoardArchived("board-1", "2026-08-05T00:00:00.000Z")).not.toThrow();
    expect(() => emitBoardDeleted("board-1")).not.toThrow();

    errorSpy.mockRestore();
  });
});

describe("kickUserSockets (F2)", () => {
  afterEach(() => {
    delete (globalThis as { io?: unknown }).io;
  });

  it("disconnects every socket in the target user's user room (close = true)", () => {
    const { inRoom, disconnectSockets } = installFakeIo();

    kickUserSockets("target-user-1");

    expect(inRoom).toHaveBeenCalledWith(ROOMS.user("target-user-1"));
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it("is a silent no-op when IO is not initialized", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => kickUserSockets("target-user-1")).not.toThrow();

    errorSpy.mockRestore();
  });
});
