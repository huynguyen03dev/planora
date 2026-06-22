/**
 * Pure presentation helpers for the analytics dashboard.
 *
 * These translate raw engine values into display decisions (trend direction,
 * good/bad coloring, formatting) without touching the metric computation. They
 * live here — rather than inline in the React components — so they can be unit
 * tested (the components have no test harness).
 */

// Whether a rising value is an improvement for a given metric. Lead time,
// remaining hours, overdue, completed-late and reopen rate are all "higher is
// worse"; only estimation coverage improves as it rises.
export type Polarity = "higherIsBetter" | "higherIsWorse";

// Below this absolute percentage we treat a period-over-period delta as flat,
// so floating-point noise and genuine no-ops don't read as progress/regression.
export const FLAT_CHANGE_THRESHOLD = 0.05;

export type TrendDisplay =
  | { kind: "new" } // current period has a value but the prior period was zero
  | { kind: "flat" } // no meaningful change
  | { kind: "delta"; rising: boolean; isImprovement: boolean; magnitude: number };

export function resolveTrend(
  value: { current: number; previous: number; change: number },
  polarity: Polarity,
): TrendDisplay {
  // No prior-period baseline: a percentage change here would be fabricated
  // (the engine reports +100% for 0 -> n), so surface it as "new" instead.
  if (value.previous === 0 && value.current > 0) {
    return { kind: "new" };
  }

  if (Math.abs(value.change) < FLAT_CHANGE_THRESHOLD) {
    return { kind: "flat" };
  }

  const rising = value.change > 0;
  const isImprovement = polarity === "higherIsBetter" ? rising : !rising;

  return {
    kind: "delta",
    rising,
    isImprovement,
    magnitude: Math.abs(value.change),
  };
}

// Remaining hours is a running total, not a duration, so keep it in hours with a
// unit rather than rolling over into days the way a lead-time duration would.
export function formatHourTotal(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}
