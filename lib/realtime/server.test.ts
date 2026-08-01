import { afterEach, describe, expect, it, vi } from "vitest";

import { ROOMS } from "./events";
import { emitInvitationNew } from "./server";

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
  const to = vi.fn(() => ({ emit }));
  const io = { to };
  (globalThis as { io?: unknown }).io = io;
  return { io, to, emit };
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
