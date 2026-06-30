# IN-03 Design-System Conformance to the DESIGN.md North-Star

## Status

**planned — opened 2026-06-30.** Decomposes into child stories US-048–US-055
(below). Each child re-enters `docs/FEATURE_INTAKE.md` on its own and gets its
own lane at implementation time.

## Type

Initiative (umbrella). Successor wave to **IN-02** (closed 2026-06-29). Where
IN-02 consolidated the UI toward *internal* consistency, IN-03 measures the UI
against the **`DESIGN.md` north-star spec** (established after IN-02) and closes
the remaining gaps.

## Lane (aggregate)

normal — heaviest flags are **existing behavior** (recolors / restructures
already-shipped UI), **weak proof** (React components remain unit/E2E-untested;
proof is manual QA, the IN-01/IN-02 residual), **multi-domain** (board +
analytics + shell + shadcn primitives), and one **design-token-contract** touch
(US-050 adds semantic status tokens → decision **0013**; US-051 adds 8 label-hue
token pairs → decision **0014**). **No hard gate:** no
auth, authorization, data migration/new table, external-provider, or
validation-weakening change. Children range tiny → normal; none is high-risk
unless it grows a persisted field.

## Problem Statement

A UI review on **2026-06-30** audited the codebase against `DESIGN.md` (the
north-star adapted from Linear's shell + Notion's document surface, mapped onto
the shadcn/oklch token system). The foundation is strong: `app/globals.css`
implements the full token system — surface ladder, scarce brand-blue accent,
selection tints, AA-noted contrast — and the shell/sidebar/board-tile chrome and
the priority/due meta-chips use those tokens with real discipline. The
divergences cluster in three places:

1. **Depth is carried by drop shadows, not the surface ladder.** `DESIGN.md`
   §95/§273 is explicit: depth = surface lift + 1px `border-border` hairline,
   **not** shadow (shadow only on genuinely floating layers — modals/popovers).
   The base `components/ui/card.tsx:15` ships `rounded-xl shadow-xs ring-1
   ring-foreground/10`, which propagates a resting shadow to every Card consumer;
   tiles (`list-card-item.tsx:219`), `card-placeholder.tsx:11`,
   `board-card.tsx:61`, and form controls (`input.tsx`/`textarea.tsx`) add more.

2. **Raw / ad-hoc colors where a token exists — or should.** Analytics charts
   hard-code hex (`burndown-chart.tsx:14`, `flow-chart.tsx:16-17`) instead of the
   `--chart-*` tokens that already exist. KPI/lead-time/data-quality use ad-hoc
   `green/red/amber` for which **no semantic token exists** (the spec defines only
   `destructive`). Label chips render `text-white` on a raw `backgroundColor`
   (`card-labels-section.tsx`, `label-mark.tsx`) — failing AA on light hues —
   instead of the spec's tint + deeper same-hue text. A decorative
   `bg-gradient-to-br from-sky-600 to-blue-800` workspace badge (`styles.ts:1`)
   introduces a second chromatic accent the spec forbids.

3. **The card-detail document structure is incomplete.** US-043 made it a
   centered modal (good), but it is a wide ~1120px two-column layout with **boxed
   sub-card sections** (`rounded-lg border bg-muted/20 p-4`) at 24px padding and
   14px body — the spec wants a ~720px reading column, **hairline-divided stacked
   sections** (not boxes), 32px padding, and 16px / 1.55 body (Notion document).

Plus minor conformance nits: button hover is an opacity step not a tonal tint
(`button.tsx:12`); radius literals (`checkbox.tsx:18` `rounded-[4px]`); and an
unread-notification dot conveys state by color alone.

## Goal / Definition of Done

Every surface reads as one design system measured against `DESIGN.md`: depth by
surface + hairline (shadow only on floating layers), every color a token (with
new semantic tokens defined in both themes and AA-noted where needed), and the
card detail as a true Notion document. "Done" for the initiative = US-048–US-052
shipped with manual-QA proof recorded in the story packets and
`docs/TEST_MATRIX.md`; US-053–US-055 (cleanup/a11y nits) shipped or explicitly
deferred.

## Non-Goals

- A rebrand or re-choosing tokens. `DESIGN.md` is the fixed target; tokens get
  *applied/added*, not re-picked.
- New card features, schema changes, or new card actions. This is presentation +
  token conformance only.
- An RTL / component test harness. The untested-component residual stands; proof
  is manual browser QA per the IN-01/IN-02 precedent.
- The per-board background gradients (`boardTheme`, `lib/constants.ts`) — those
  are the Trello board-background analogue and are intentionally out of scope (as
  ratified in US-036/US-042).

## False positives excluded from the audit

Recorded so the next agent does not re-chase them:

- **No gradients on the landing page or auth forms** — grep confirmed none; an
  early audit pass hallucinated them.
- **Card detail is not a drawer** — it is a centered dialog
  (`max-w-[min(96vw,1120px)]`, `card-detail-sheet.tsx:218`); the structure gap is
  width + boxed sections, not the overlay model.
- **Modal/popover/dialog/sheet/dropdown shadows are conformant** — those are
  elevation level 2 (floating layers); the spec permits shadow there. Only
  *resting-surface* shadows are in scope.

## Workstreams → Child Stories

IDs are committed reservations. Each child carries its own lane + intake.

| ID | Story | Lane (est.) | Cluster |
| --- | --- | --- | --- |
| US-048 | Depth by surface ladder, not drop shadow — base `card.tsx` `rounded-xl`+shadow → `rounded-lg`+`border-border`; strip resting shadows on card tiles / placeholder / board-card / inputs; drag affordance = soft shadow + slight scale; keep floating-layer shadows | normal | 1 |
| US-049 | Tokenize chart colors (burndown → `--chart-1`; flow completed → `--success-foreground`, created → `--chart-2`) — **depends on US-050**: the `--chart-*` ramp is monochrome-blue, so completed reuses US-050's deep-green token | tiny | 2 |
| US-050 | Define `--success` / `--warning` semantic token pairs (both themes, AA-noted) and sweep ad-hoc green/red/amber across KPI / lead-time / data-quality / deltas — **decision 0013** | normal | 2 |
| US-051 | Tokenize label-chip colors to tint + deeper same-hue text (fixes `text-white` AA failure across 4 sites; 8 `BOARD_COLORS` hues × 2 themes = 32 measured pairs) — **decision 0014** | normal | 2 |
| US-052 | Card-detail document structure pass — ~720px reading column, de-box sub-sections to hairline-divided stack, 32px padding, 16px / 1.55 body (follow-up to US-043) | normal | 3 |
| US-053 | Remove decorative gradient + second chromatic accent in chrome (workspace badge `styles.ts`; review the card-cover scrim) | tiny | 2 |
| US-054 | shadcn primitive conformance — button tonal hover (not opacity); radius-literal cleanup (`rounded-[4px]`/`rounded-[min()]` → tokens); arbitrary-px width sweep where a token fits | tiny | misc |
| US-055 | Non-color signal for unread-notification state (pair the dot with a count/label) — WCAG 1.4.1 | tiny | a11y |

`tabs.tsx` (spec defines `tab-default`/`tab-selected`, no primitive exists) is
**backlogged**, not a story — nothing uses tabs yet; add it when a tabbed surface
needs it.

## Recommended Sequencing

1. **US-048 first** — fixing base `card.tsx` is the highest leverage (one file
   corrects depth across every Card consumer); the per-component shadow strips
   follow.
2. **US-050 then US-049** (strict order) — US-050 defines `--success`/`--warning`
   (decision 0013); US-049's completed-series consumes `--success`, so it cannot
   land first.
3. **US-051** — label-chip tints (an a11y fix as much as a token fix; decision 0014).
4. **US-052** — card-detail structure, the biggest felt-quality jump; self-contained
   (sequence after US-048 so de-boxed sections inherit correct depth).
5. **US-053 / US-054 / US-055** — cleanup + a11y nits, lowest stakes, batchable.

**Shared-edit hotspots (avoid merge collisions):**
- `app/globals.css` `:root`/`.dark`/`@theme inline` — **US-049, US-050, US-051,
  US-054** all add tokens here. Land them in dependency order (US-050 → US-049;
  US-051; US-054) and rebase, don't parallelize.
- `components/ui/button.tsx` — **US-048** (outline `shadow-xs`) and **US-054**
  (default hover, radius literals). Fold both into US-048, or rebase US-054.
- `components/boards/card-detail-sheet.tsx` — **US-052** (structure) and US-053
  (cover scrim review); US-052 is the large edit, do the scrim with/after it.

## Relevant Product Docs

- `DESIGN.md` (repo root) — the north-star contract these stories are measured
  against (colors §193+, elevation §273, components §307+, do/don't §369+).
- `docs/product/boards-and-cards.md` — card-detail + card-face presentation (no
  contract change expected; presentation only).
- `docs/product/analytics.md` — chart/KPI presentation (US-049/US-050).
- `docs/TEST_MATRIX.md` — each shipped child records its manual-QA proof row.

## Decomposition Guidance (for the next agent)

- Pull **one** row, run it through `docs/FEATURE_INTAKE.md`, create its artifact
  from `docs/templates/story.md`. None is high-risk unless it grows a persisted
  field or weakens validation.
- US-050 and US-051 add to the token contract → record/confirm decisions **0013**
  (semantic status) and **0014** (label-hue pairs) in the same stories (both
  stubbed, status Proposed); add the new tokens to **both** themes in
  `globals.css` with a measured contrast comment (DESIGN.md §383).
- US-049 cannot pick two distinct colors from the monochrome `--chart-*` ramp —
  it reuses `--success-foreground` for "completed" (decision: option b, reuse over widening
  the ramp; recorded in the US-049 story). If a future chart needs ≥3 categorical
  series, widening `--chart-*` becomes its own decision.
- US-049/US-050/US-051/US-053 are all token-application; US-048 touches the
  shadcn-managed `card.tsx`/`button.tsx`/`input.tsx` — annotate customizations
  (`// customized:`) per AGENTS.md and avoid re-syncing.
- Proof is manual browser QA (Chrome DevTools MCP) with DOM-verified token values
  + light/dark screenshots, per the IN-02 precedent.

## Harness Delta

- None to harness core. Reuses `docs/stories/initiatives/` and the existing
  `E01-analytics` / `E02-board-experience` epics — no new epic.

## Evidence

Initiative-level proof is the union of its children's proofs. Source review:
2026-06-30 audit of the codebase against `DESIGN.md` (three parallel
file-by-file passes, findings verified by grep; false positives recorded above).
