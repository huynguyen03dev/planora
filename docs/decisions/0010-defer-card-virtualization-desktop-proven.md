# 0010 Defer card-list virtualization — desktop drag perf proven adequate

Date: 2026-06-26

## Status

Accepted

## Context

IN-01 Theme D reserves a high-risk story (candidate "US-027", originally the
US-020 row before that ID was reused for the due-date scheduler) for **card-list
virtualization to bring DnD INP under 200ms on large boards**. Its only
justification was US-004's single synthetic data point: ~435ms drop INP on a
90-card board, with virtualization named as the deferred lever.

Before opening a high-risk story whose fix (windowing) fights the
`@hello-pangea/dnd` index-space invariant that the entire drop path and US-013's
filter depend on, we measured the actual **INP-vs-board-size curve** across
device classes (2026-06-26). Protocol: prod build, realistic cards (2 labels +
priority each), 5 lists, the US-004 keyboard-drag sequence (lift → 3× move →
cross-list → drop), Event Timing API capture, 3-run median. Harness left in repo:
`scripts/seed-perf-board.ts` + `scripts/perf-measure.ts`
(`PERF_CPU=<n> npx tsx --env-file=.env scripts/perf-measure.ts`).

Measured median INP (ms); CWV bands good ≤200 / needs-improvement ≤500 / poor >500:

| Cards | Desktop (1×) | Mid laptop (4×) | Phone-class (6×) |
| ----: | :----------: | :-------------: | :--------------: |
| 30  | 96 good  | 208 ni  | 240 ni  |
| 60  | 128 good | 240 ni  | 320 ni  |
| 100 | 160 good | 352 ni  | 448 ni  |
| 150 | 184 good | 472 ni  | 680 poor |

The 4× column (~352ms at 100 cards) reproduces US-004's independently
trace-measured 435ms at 90 cards — two methods agree. US-004's box was simply
~4× slower than current high-end desktop hardware. The worst interaction is
always the drop, then the lift; both are DOM-size / forced-reflow bound.

## Decision

**Defer card-list virtualization. Do not open it as a desktop large-board story.**

1. On current desktop hardware, drag is in the "good" band (<200ms) at **every**
   realistic board size up to 150 cards. For a desktop-first product there is no
   perf problem to fix.
2. The need is real only on mid-tier/mobile hardware (needs-improvement from ~30
   cards; poor on phones by ~150). The story is therefore **re-scoped and coupled
   to US-021 (mobile/responsive board, already planned)** — not standalone scale
   work. Trigger to revisit: when drag ships on mobile, re-measure on a real
   device with the harness above.
3. When it is pursued, **try the cheap lever first**: `content-visibility:auto` +
   `contain-intrinsic-size` on off-screen cards. It cuts off-screen layout cost
   without unmounting cards, preserving the `@hello-pangea/dnd` index-space
   invariant. Escalate to the fragile `mode="virtual"` windowing rewrite only if
   that proves insufficient.

## Alternatives Considered

1. **Open the high-risk windowing story now** (the IN-01 reservation as written).
   Rejected: optimizes a problem desktop users do not have; commits to the
   highest-risk lever in the initiative on one synthetic data point.
2. **Cut the story entirely.** Rejected: the mobile/mid-tier need is real and
   becomes live with US-021; cutting would lose the measured context.

## Consequences

Positive:

- A high-risk, invariant-threatening change is not undertaken without proven need.
- The next agent inherits the curve and the re-measure command, not a TODO.

Tradeoffs:

- Desktop users on older/throttled hardware (or background CPU load) can still
  see needs-improvement INP on large boards; accepted as not worth the risk now.
- Re-scoping defers the decision rather than closing it; it must be re-checked at
  US-021, or the regression reaches mobile users unmeasured.

## Follow-Up

- At US-021: re-run `scripts/perf-measure.ts` against a real mobile device/profile;
  if drag is needs-improvement/poor, cut the virtualization child, cheap lever first.
- Keep `scripts/seed-perf-board.ts` + `scripts/perf-measure.ts` as the measurement
  protocol (currently uncommitted; commit with the US-021 perf work).
