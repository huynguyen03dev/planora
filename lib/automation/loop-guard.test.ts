import { describe, expect, it } from "vitest";

import { ChainTracker, MAX_CHAIN_DEPTH } from "./loop-guard";

describe("ChainTracker", () => {
  // ─── root() ─────────────────────────────────────────────────────────

  describe("root", () => {
    it("returns depth 0", () => {
      const tracker = ChainTracker.root();
      expect(tracker.depth).toBe(0);
    });

    it("returns a nonempty chainId", () => {
      const tracker = ChainTracker.root();
      expect(tracker.chainId).toBeTruthy();
      expect(typeof tracker.chainId).toBe("string");
    });

    it("returns a unique chainId on each call", () => {
      const a = ChainTracker.root();
      const b = ChainTracker.root();
      expect(a.chainId).not.toBe(b.chainId);
    });
  });

  // ─── child() ────────────────────────────────────────────────────────

  describe("child", () => {
    it("increments depth by 1", () => {
      const parent = ChainTracker.root();
      const kid = parent.child();
      expect(kid.depth).toBe(parent.depth + 1);
    });

    it("keeps the same chainId", () => {
      const parent = ChainTracker.root();
      const kid = parent.child();
      expect(kid.chainId).toBe(parent.chainId);
    });

    it("shares the dedup set (mark on parent → hasFired on child)", () => {
      const parent = ChainTracker.root();
      const kid = parent.child();

      parent.markFired("rule-1", "card-1");
      expect(kid.hasFired("rule-1", "card-1")).toBe(true);
    });

    it("shares the dedup set (mark on child → hasFired on parent)", () => {
      const parent = ChainTracker.root();
      const kid = parent.child();

      kid.markFired("rule-2", "card-2");
      expect(parent.hasFired("rule-2", "card-2")).toBe(true);
    });
  });

  // ─── atDepthCap() ───────────────────────────────────────────────────

  describe("atDepthCap", () => {
    it("returns false when depth < MAX_CHAIN_DEPTH", () => {
      const tracker = ChainTracker.root();
      expect(tracker.atDepthCap()).toBe(false);
    });

    it("returns false at depth 4 (one below cap)", () => {
      let tracker = ChainTracker.root();
      for (let i = 0; i < 4; i++) tracker = tracker.child();
      expect(tracker.depth).toBe(4);
      expect(tracker.atDepthCap()).toBe(false);
    });

    it("returns true at depth 5 (at cap)", () => {
      let tracker = ChainTracker.root();
      for (let i = 0; i < 5; i++) tracker = tracker.child();
      expect(tracker.depth).toBe(5);
      expect(tracker.atDepthCap()).toBe(true);
    });

    it("returns true above cap", () => {
      let tracker = ChainTracker.root();
      for (let i = 0; i < 6; i++) tracker = tracker.child();
      expect(tracker.atDepthCap()).toBe(true);
    });
  });

  // ─── hasFired / markFired ───────────────────────────────────────────

  describe("hasFired / markFired", () => {
    it("returns false for a pair that has not fired", () => {
      const tracker = ChainTracker.root();
      expect(tracker.hasFired("rule-1", "card-1")).toBe(false);
    });

    it("returns true after markFired for the same pair", () => {
      const tracker = ChainTracker.root();
      tracker.markFired("rule-1", "card-1");
      expect(tracker.hasFired("rule-1", "card-1")).toBe(true);
    });

    it("different cardId = not fired", () => {
      const tracker = ChainTracker.root();
      tracker.markFired("rule-1", "card-1");
      expect(tracker.hasFired("rule-1", "card-2")).toBe(false);
    });

    it("different ruleId = not fired", () => {
      const tracker = ChainTracker.root();
      tracker.markFired("rule-1", "card-1");
      expect(tracker.hasFired("rule-2", "card-1")).toBe(false);
    });
  });

  // ─── from() ─────────────────────────────────────────────────────────

  describe("from", () => {
    it("round-trips chainId and depth", () => {
      const tracker = ChainTracker.from("my-chain-id", 3);
      expect(tracker.chainId).toBe("my-chain-id");
      expect(tracker.depth).toBe(3);
    });

    it("starts with a fresh dedup set", () => {
      const tracker = ChainTracker.from("my-chain-id", 2);
      expect(tracker.hasFired("rule-1", "card-1")).toBe(false);
    });
  });

  // ─── MAX_CHAIN_DEPTH ────────────────────────────────────────────────

  it("MAX_CHAIN_DEPTH is 5", () => {
    expect(MAX_CHAIN_DEPTH).toBe(5);
  });
});
