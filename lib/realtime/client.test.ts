import { describe, expect, it } from "vitest";

import { shouldReconnectOnce } from "./client";

describe("shouldReconnectOnce (A3 — one retry per server kick)", () => {
  it("reconnects on a server-initiated disconnect that has not been retried", () => {
    expect(shouldReconnectOnce("io server disconnect", false)).toBe(true);
  });

  it("never retries a second time after the first attempt (no reconnect loop)", () => {
    expect(shouldReconnectOnce("io server disconnect", true)).toBe(false);
  });

  it("does NOT reconnect on a client-initiated disconnect (logout/unmount)", () => {
    expect(shouldReconnectOnce("io client disconnect", false)).toBe(false);
    expect(shouldReconnectOnce("io client disconnect", true)).toBe(false);
  });

  it("does NOT reconnect on transport-level drops (normal auto-reconnect handles them)", () => {
    expect(shouldReconnectOnce("transport close", false)).toBe(false);
    expect(shouldReconnectOnce("ping timeout", false)).toBe(false);
    expect(shouldReconnectOnce("transport error", false)).toBe(false);
  });
});
