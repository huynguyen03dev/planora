# 0024 Input touch target conforms to DESIGN.md (36px pointer / 44px touch split)

Date: 2026-07-14

## Status

Accepted

## Context

DESIGN.md (*Responsive & Accessibility*) states the touch-target rule as a
**split**, not a single floor:

> Touch targets: ≥44px touch, ≥36px pointer.

The shared `Input` primitive (`components/ui/input.tsx`) is currently `h-9`
(36px) — set during US-048 ("depth by surface"). That is already **correct for
pointer/desktop** and well above the WCAG 2.5.8 AA floor (24px). The gap is only
on touch devices, where the spec wants 44px.

The UI/UX review of the public auth forms (epic E07-auth-onboarding-ux, US-070)
flagged the 36px height as below the touch row and left the resolution open. The
human chose to conform to DESIGN.md — and on review, a **blanket** `h-11`
(44px everywhere) was rejected as over-conforming: it would grow every desktop
input +8px for no spec reason (DESIGN.md only requires 44px on touch). This
decision records the spec-faithful split.

Pixel reference (Tailwind default, 1 unit = 4px): `h-9` = 36px, `h-10` = 40px,
`h-11` = 44px.

## Decision

Apply a **pointer/touch split** to the shared `Input`:

- Keep `h-9` (36px) as the default — pointer/desktop is unchanged, zero
  regression.
- Add `h-11` (44px) under a coarse-pointer (touch) media query, via a Tailwind v4
  custom variant.

Mechanism:

1. `app/globals.css` — register the variant next to the existing
   `@custom-variant dark …`:
   `@custom-variant pointer-coarse (@media (pointer: coarse));`
2. `components/ui/input.tsx` — className goes `h-9 …` → `h-9 pointer-coarse:h-11 …`.

Desktop inputs stay exactly as today; touch devices get the 44px minimum DESIGN.md
requires. No global density change.

## Alternatives Considered

1. **`h-11` global (44px everywhere).** Rejected: it over-conforms on pointer —
   DESIGN.md only asks 44px on touch — and grows every desktop input +8px for no
   benefit (the "too big" regression). This was the first draft of this decision;
   corrected after review.
2. **`h-10` global (40px).** Rejected: still below the 44px touch minimum, so it
   satisfies neither row cleanly — a compromise, not conformance.
3. **Keep `h-9` everywhere (do nothing).** Rejected: leaves touch devices below
   DESIGN.md's 44px row.

## Consequences

Positive:

- Desktop/pointer inputs are byte-identical to today (no density regression — the
  explicit reason the human pushed back on a blanket bump).
- Touch devices meet DESIGN.md's 44px minimum.
- The split is reusable: `pointer-coarse:` can size other touch-critical
  controls later.

Tradeoffs:

- Adds one custom variant + a per-element `pointer-coarse:h-11` token; marginally
  more to remember than a single height.
- `pointer: coarse` covers the vast majority of touch devices; exotic hybrids
  (some stylus/laptop touchscreens report `fine`) won't get the bump — acceptable,
  matching the spec's intent.

## Follow-Up

- US-070 implements the variant + input change.
- Optionally record the `pointer-coarse` variant in DESIGN.md's token list so the
  split is discoverable (not just an implementation detail).
