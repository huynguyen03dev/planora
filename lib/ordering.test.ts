import { describe, expect, it } from "vitest";

import { renumberPositions } from "./ordering";

const GAP = 16384;

/**
 * Simulate a non-deferrable `(scope, position)` unique index over a single
 * scope: each write rejects (like Postgres P2002) if another row already holds
 * the target position at the moment of the write. `renumberPositions` must
 * complete over ANY input without ever tripping this.
 */
function runUnderUniqueIndex(
  rows: { id: string; position: number }[],
): Promise<Map<string, number>> {
  const state = new Map(rows.map((r) => [r.id, r.position]));

  const updatePosition = async (id: string, position: number): Promise<void> => {
    for (const [otherId, otherPos] of state) {
      if (otherId !== id && otherPos === position) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
    }
    state.set(id, position);
  };

  return renumberPositions(rows, GAP, updatePosition).then(() => state);
}

describe("renumberPositions", () => {
  it("is a no-op for an empty list", async () => {
    const state = await runUnderUniqueIndex([]);
    expect(state.size).toBe(0);
  });

  it("compacts to an evenly-spaced positive sequence in the given order", async () => {
    const rows = [
      { id: "a", position: 100 },
      { id: "b", position: 250 },
      { id: "c", position: 999 },
    ];
    const state = await runUnderUniqueIndex(rows);
    expect(state.get("a")).toBe(GAP * 1);
    expect(state.get("b")).toBe(GAP * 2);
    expect(state.get("c")).toBe(GAP * 3);
  });

  it("never trips the unique index even when every input position collides", async () => {
    // All four rows share the same starting position — the exact duplicate
    // state the dedupe pass repairs, and the worst case for an in-place renumber.
    const rows = [
      { id: "a", position: 16384 },
      { id: "b", position: 16384 },
      { id: "c", position: 16384 },
      { id: "d", position: 16384 },
    ];
    // Would throw P2002 mid-run under a naive in-place renumber.
    const state = await runUnderUniqueIndex(rows);
    expect([...state.values()].sort((x, y) => x - y)).toEqual([
      GAP * 1,
      GAP * 2,
      GAP * 3,
      GAP * 4,
    ]);
  });

  it("is safe when a final target equals a current position (in-place overlap)", async () => {
    // b already sits on its future slot (GAP*2); a naive pass that moves a→GAP*1
    // then b→GAP*2 is fine, but c→GAP*3 over b's old GAP*2 etc. can collide.
    const rows = [
      { id: "a", position: 5 },
      { id: "b", position: GAP * 2 },
      { id: "c", position: GAP * 1 },
    ];
    const state = await runUnderUniqueIndex(rows);
    expect(state.get("a")).toBe(GAP * 1);
    expect(state.get("b")).toBe(GAP * 2);
    expect(state.get("c")).toBe(GAP * 3);
  });

  it("stages below zero, so negative/zero current positions do not collide", async () => {
    // Repeated 'insert before first' can drive positions to 0 and below.
    const rows = [
      { id: "a", position: -GAP },
      { id: "b", position: 0 },
      { id: "c", position: GAP },
    ];
    const state = await runUnderUniqueIndex(rows);
    expect(state.get("a")).toBe(GAP * 1);
    expect(state.get("b")).toBe(GAP * 2);
    expect(state.get("c")).toBe(GAP * 3);
  });

  it("performs a full two-pass renumber (2N writes) that stages before compacting", async () => {
    const writes: Array<{ id: string; position: number }> = [];
    const rows = [
      { id: "a", position: 10 },
      { id: "b", position: 20 },
    ];
    await renumberPositions(rows, GAP, async (id, position) => {
      writes.push({ id, position });
    });
    expect(writes).toHaveLength(rows.length * 2);
    // Pass 1: every row parked in the disjoint negative staging band.
    expect(writes.slice(0, 2).every((w) => w.position < 0)).toBe(true);
    // Pass 2: compacted to the final positive sequence.
    expect(writes.slice(2)).toEqual([
      { id: "a", position: GAP * 1 },
      { id: "b", position: GAP * 2 },
    ]);
  });
});
