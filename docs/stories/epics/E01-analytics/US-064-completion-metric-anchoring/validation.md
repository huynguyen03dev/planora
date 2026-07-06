# Validation — US-064 Analytics completion-metric anchoring

## Proof Strategy

The engine is already unit-tested (`lib/analytics/engine.test.ts`). Extend it with
a completion-streak matrix that pins the anchor across toggle sequences, plus
point-in-time replay correctness. Because the payload shape is unchanged, the
proof is value-correctness, not contract-shape.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | Streak anchor: (a) complete once → counted, cycle-time to that completion; (b) complete → reopen (not re-completed) → **not counted**, drops from throughput; (c) complete → reopen → complete → anchored at the **later** completion, cycle-time to it; (d) accidental complete → reopen same day → complete day 30 → cycle-time = 30d, not ~0; (e) point-in-time as-of a mid-sequence date returns the streak state at that date; (f) flow chart: complete d1 → reopen → complete d30 plots only d30. Overdue: reopened past-due card re-enters `computeOverdue`. **`reopenRate` (blocker): a complete → reopen (still open) card stays in the denominator (any-completion-in-range) and in the numerator (reopened-in-range) — the rate does NOT drop when the card is currently reopened.** |
| Integration | Dashboard analytics action returns corrected KPIs/rows for a fixture with multi-completion cards; CSV export reflects the same values. |
| E2E | n/a (no harness). |
| Platform | Manual dashboard check: complete a card, confirm throughput +1; reopen it, confirm it drops back; verify lead-time table shows the streak completion date. |
| Performance | Replay cost unchanged (same event pass); no extra queries. |
| Logs/Audit | n/a (read-only aggregation). |

## Fixtures

- Cards with event sequences (a)–(e) above (built from `CARD_COMPLETED` /
  `CARD_REOPENED` history).

## Commands

```text
npx vitest run lib/analytics/engine.test.ts
```

## Acceptance Evidence

Add test results + a dashboard before/after for a multi-completion fixture. Link
decision 0021.
