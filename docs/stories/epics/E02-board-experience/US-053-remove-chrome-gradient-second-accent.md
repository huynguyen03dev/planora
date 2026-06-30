# US-053 Remove decorative gradient + second chromatic accent from chrome

## Status

done — implemented 2026-06-30 on `feat/us-053-remove-chrome-gradient`; manual QA
passed (light + dark). The `workspaceBadgeGradient` sky→blue gradient is retired
for a neutral `bg-secondary` chip across all three badge consumers; the card-cover
scrim is resolved as *kept* (legibility fade over a user image, not chrome
decoration). No `bg-gradient` remains in chrome — only the intentional per-board
`boardTheme` gradients (inline `linear-gradient`, out of scope). See Evidence.

## Lane

tiny — replaces one decorative gradient utility and reviews a cover scrim.
1 flag (existing behavior — workspace badge restyle); no hard gate, no schema,
no logic. Narrow, mechanical. Part of **IN-03**.

## Product Contract

Planora's chrome carries **no atmospheric gradients** and **no second chromatic
accent** — brand blue is the only chromatic accent, used scarcely (CTA, focus,
selection, active); the only other color spectra are the tinted labels and the
priority/due meta-chips. `DESIGN.md` §192 / §386–388.

- Today: `components/boards/styles.ts:1`
  `workspaceBadgeGradient = "bg-gradient-to-br from-sky-600 to-blue-800"` — a
  decorative sky→blue gradient used by workspace badges
  (`workspace-item.tsx`, `workspace-section.tsx`, `workspace-boards-view.tsx`).
  It is both a gradient (forbidden) and a second chromatic accent in the chrome.
- Also review: the card-cover scrim `bg-gradient-to-t from-background via-
  background/10 to-transparent` (`card-detail-sheet.tsx:766`) — a legibility
  fade over a user image; decide keep (defensible, image legibility) vs. replace
  with a solid `bg-background/80` step.

## Relevant Product Docs

- `DESIGN.md` — Overview §181+ ("No atmospheric gradients"), Do/Don't §386–388
  (no second chromatic accent in chrome; brand blue not a section bg/fill).
- `docs/product/workspaces-and-access.md` — workspace badge presentation; no
  contract change.

## Acceptance Criteria

- The workspace badge no longer uses a gradient or a non-brand chromatic accent.
  Replace with a neutral treatment: initials/icon on `bg-secondary` (or
  `bg-muted`) with `muted-foreground` text — or, if a colored badge is desired,
  the **brand** `bg-primary` (used sparingly, as an identity mark) rather than a
  sky→blue gradient. Choose one and apply across all three consumers.
- The cover scrim is explicitly resolved: kept (with a one-line rationale that
  it's image-legibility, not chrome decoration) **or** replaced with a solid
  surface step — no undecided gradient left.
- No `bg-gradient-*` remains in chrome (per-board `boardTheme` header/surface
  gradients are out of scope — they're the Trello board-background analogue,
  ratified in US-036/US-042).
- Light + dark correct; no console errors; unit suite green.

## Design Notes

- **UI surfaces:** `components/boards/styles.ts` (the gradient constant + its
  consumers `workspace-item.tsx`, `workspace-section.tsx`,
  `workspace-boards-view.tsx`); `card-detail-sheet.tsx:766` (scrim review).
- Confirm the grep `bg-gradient` over `app/` + `components/` returns only the
  intentional `boardTheme` per-board gradients afterward.
- Commands / Queries / API / Tables / Domain rules: none.

## Dependencies

- Independent.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-053 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a; suite stays green. |
| Integration | n/a. |
| E2E | n/a — no harness. |
| Platform | Workspace badge has no gradient/second accent; cover scrim resolved; `bg-gradient` grep shows only `boardTheme`; light + dark; no console errors. |
| Release | Manual visual QA: sidebar + boards overview workspace badges, card cover, light + dark. |

## Harness Delta

None.

## Evidence

**Workspace badge (gradient + second accent removed):** `components/boards/styles.ts`
`workspaceBadgeGradient = "bg-gradient-to-br from-sky-600 to-blue-800"` →
`workspaceBadgeSurface = "bg-secondary text-secondary-foreground"`. The constant
was renamed (it's no longer a gradient) and the redundant `text-white` dropped
from all three consumers, which now inherit the badge's guaranteed-contrast
foreground:

| Consumer | Badge | Before | After |
| --- | --- | --- | --- |
| `workspace-item.tsx:38` | sidebar list (size-6) | `${gradient} text-white` | `${surface}` |
| `workspace-section.tsx:31` | sidebar section (size-8) | `${gradient} text-white` | `${surface}` |
| `workspace-boards-view.tsx:36` | overview header (size-10) | `${gradient} text-white` | `${surface}` |

**Chosen treatment — neutral, not brand.** The AC allowed neutral *or* brand
`bg-primary`. Neutral was chosen: the badge repeats per workspace across the
sidebar and overview, so a `bg-primary` fill would make brand blue ambient chrome
and break "brand blue used scarcely" (DESIGN.md §183/§386). The badge is now a
neutral identity chip; brand blue stays reserved for CTA/focus/selection/active.

**Cover scrim — resolved as kept (annotated, not undecided):**
`card-detail-sheet.tsx` cover `bg-gradient-to-t from-background via-background/10
to-transparent` is retained with an inline rationale comment. It is a bottom-edge
fade that blends an arbitrary user-supplied cover image into the document surface
below — a legibility scrim over user content, not a decorative chrome gradient.
The §389 ban targets atmospheric chrome gradients; a solid `bg-background/80` here
would wash out the entire cover.

**`bg-gradient` grep (app/ + components/) afterward** returns exactly one hit —
the annotated cover scrim. No chrome gradient remains. The per-board `boardTheme`
header/surface gradients (`lib/constants.ts` `BOARD_THEME_GRADIENTS`, inline
`linear-gradient`) are the Trello board-background analogue, ratified in
US-036/US-042 and out of scope; `label-mark.tsx` repeating-gradients are
colorblind label patterns (label spectrum, excepted); the burndown-chart SVG
`linearGradient` is data-viz fill — none are chrome accents.

**Typography/contrast (DOM-verified via `getComputedStyle`):**

| Theme | Badge bg (`bg-secondary`) | Badge text (`secondary-foreground`) | `backgroundImage` |
| --- | --- | --- | --- |
| Light | `lab(96.52 …)` (near-white neutral) | `lab(7.78 …)` (near-black) | `none` |
| Dark | `lab(15.20 …)` (dark neutral) | `lab(98.26 …)` (near-white) | `none` |

**Automated checks (2026-06-30):** `tsc --noEmit` clean (lone errors are in
untracked `scripts/perf-measure.ts`/`seed-perf-board.ts`, not this branch);
ESLint on the 5 touched files = 0 errors (3 pre-existing `<img>` LCP warnings on
the card cover, untouched); `npm test` = 523/523 pass.

**Manual QA — light + dark, boards overview + sidebar, no console errors:** the
"B" Brand-QA workspace badge renders as a neutral chip with strong-contrast
initials in both the sidebar (item + section) and the overview header, in both
themes — no gradient, no second chromatic accent. Screenshots in scratchpad
`qa053/`: `01-badges-light`, `02-badges-dark`. The blue board thumbnail visible
in those shots is the per-board `boardTheme` gradient (out of scope).
