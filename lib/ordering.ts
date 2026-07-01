import "server-only";

/**
 * Renumber ordered rows onto a fresh, evenly-spaced positive sequence
 * (`gap`, `2*gap`, …) WITHOUT ever transiently violating a `(scope, position)`
 * unique index.
 *
 * A naive in-place renumber assigns row A a value row B still holds; under a
 * non-deferrable unique index that aborts mid-transaction even when the final
 * state is unique and even when the writes are ordered (reproduced on PG17).
 * We therefore renumber in two passes: first move every row into a disjoint
 * negative staging band (strictly below every current position and below zero,
 * so it collides with neither the current values nor the positive finals), then
 * compact to the final sequence. No intermediate state ever holds a duplicate.
 *
 * Must run inside the caller's transaction — the staging values are only safe
 * until commit. `rows` MUST already be in the desired final order, and
 * `updatePosition` MUST be issued sequentially against the same transaction
 * client (this function awaits each write in turn; do not parallelize them).
 */
export async function renumberPositions(
  rows: readonly { id: string; position: number }[],
  gap: number,
  updatePosition: (id: string, position: number) => Promise<unknown>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const minPosition = Math.min(...rows.map((row) => row.position));
  // Staging values sit strictly below every current position AND below zero,
  // so pass 1 never collides with a current value and pass 2's positive finals
  // never collide with a still-staged (negative) row.
  const stagingBase = Math.min(minPosition, 0) - gap;

  for (let i = 0; i < rows.length; i += 1) {
    await updatePosition(rows[i].id, stagingBase - i * gap);
  }

  for (let i = 0; i < rows.length; i += 1) {
    await updatePosition(rows[i].id, gap * (i + 1));
  }
}
