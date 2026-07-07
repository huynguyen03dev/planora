/**
 * In-memory chain loop-prevention for the automation rules engine.
 *
 * Every rule-fire cascade gets a ChainTracker.  The tracker carries a
 * monotonic `depth` counter (capped at MAX_CHAIN_DEPTH) and a shared
 * dedup Set so the same (rule, card) pair cannot fire twice anywhere
 * in the same chain — even across depth increments.
 *
 * No DB, no async — pure in-memory state.
 */

export const MAX_CHAIN_DEPTH = 5;

export class ChainTracker {
  readonly chainId: string;
  readonly depth: number;
  private readonly fired: Set<string>;

  private constructor(chainId: string, depth: number, fired: Set<string>) {
    this.chainId = chainId;
    this.depth = depth;
    this.fired = fired;
  }

  /** Root chain: fresh UUID, depth 0, empty dedup set. */
  static root(): ChainTracker {
    return new ChainTracker(
      globalThis.crypto.randomUUID(),
      0,
      new Set(),
    );
  }

  /**
   * Rehydrate from an event payload's `_chainId` / `_chainDepth`.
   * Fresh dedup set (dedup is per-process-chain, not persisted).
   */
  static from(chainId: string, depth: number): ChainTracker {
    return new ChainTracker(chainId, depth, new Set());
  }

  /** `true` when the chain has reached or exceeded the depth cap. */
  atDepthCap(): boolean {
    return this.depth >= MAX_CHAIN_DEPTH;
  }

  /** Check whether (ruleId, cardId) has already fired in this chain. */
  hasFired(ruleId: string, cardId: string): boolean {
    return this.fired.has(`${ruleId}::${cardId}`);
  }

  /** Record that (ruleId, cardId) has fired in this chain. */
  markFired(ruleId: string, cardId: string): void {
    this.fired.add(`${ruleId}::${cardId}`);
  }

  /**
   * Derive a child tracker: depth + 1, same chainId,
   * SHARES the same dedup Set by reference.
   */
  child(): ChainTracker {
    return new ChainTracker(this.chainId, this.depth + 1, this.fired);
  }
}
