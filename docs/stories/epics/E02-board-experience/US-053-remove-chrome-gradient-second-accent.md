# US-053 Remove decorative gradient + second chromatic accent from chrome

## Status

planned

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

_Pending implementation._
