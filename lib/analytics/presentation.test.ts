import { describe, expect, it } from "vitest";

import { formatHourTotal, resolveTrend } from "./presentation";

describe("resolveTrend", () => {
  it("reports 'new' when the prior period was zero (no fabricated +100%)", () => {
    // The engine reports change=100 for 0 -> n; presentation must not show that.
    expect(resolveTrend({ current: 5, previous: 0, change: 100 }, "higherIsWorse")).toEqual({
      kind: "new",
    });
  });

  it("treats a zero change as flat, not as progress", () => {
    expect(resolveTrend({ current: 8, previous: 8, change: 0 }, "higherIsWorse")).toEqual({
      kind: "flat",
    });
  });

  it("treats sub-threshold noise as flat", () => {
    expect(
      resolveTrend({ current: 10, previous: 10, change: 0.01 }, "higherIsBetter").kind,
    ).toBe("flat");
  });

  it("marks a rising 'higher is worse' metric as a regression", () => {
    // Overdue cards doubling must NOT read as green/good.
    const trend = resolveTrend({ current: 10, previous: 5, change: 100 }, "higherIsWorse");
    expect(trend).toEqual({ kind: "delta", rising: true, isImprovement: false, magnitude: 100 });
  });

  it("marks a falling 'higher is worse' metric as an improvement", () => {
    // Overdue dropping to zero is good.
    const trend = resolveTrend({ current: 0, previous: 5, change: -100 }, "higherIsWorse");
    expect(trend).toEqual({ kind: "delta", rising: false, isImprovement: true, magnitude: 100 });
  });

  it("marks a rising 'higher is better' metric as an improvement", () => {
    // Estimation coverage going up is good.
    const trend = resolveTrend({ current: 80, previous: 50, change: 60 }, "higherIsBetter");
    expect(trend).toEqual({ kind: "delta", rising: true, isImprovement: true, magnitude: 60 });
  });

  it("marks a falling 'higher is better' metric as a regression", () => {
    const trend = resolveTrend({ current: 40, previous: 80, change: -50 }, "higherIsBetter");
    expect(trend).toEqual({ kind: "delta", rising: false, isImprovement: false, magnitude: 50 });
  });

  it("does not report 'new' when both periods are zero", () => {
    expect(resolveTrend({ current: 0, previous: 0, change: 0 }, "higherIsWorse").kind).toBe(
      "flat",
    );
  });
});

describe("formatHourTotal", () => {
  it("keeps an integer total clean and unit-bearing", () => {
    expect(formatHourTotal(8)).toBe("8h");
  });

  it("shows one decimal for fractional totals", () => {
    expect(formatHourTotal(127.5)).toBe("127.5h");
  });

  it("rounds to the nearest tenth", () => {
    expect(formatHourTotal(8.04)).toBe("8h");
    expect(formatHourTotal(8.06)).toBe("8.1h");
  });

  it("renders zero as 0h rather than an unlabeled 0", () => {
    expect(formatHourTotal(0)).toBe("0h");
  });
});
