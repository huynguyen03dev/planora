# US-042 Adopt a brand color so the UI stops reading as a default template

## Status

implemented — merged to dev (07a49c5, PR #46). Brand hue in `app/globals.css`
(both themes); manual visual QA. Status corrected from stale `planned` on
2026-07-01 (bookkeeping, intake #42).

## Lane

normal (with stronger validation) — changes already-shipped presentation
app-wide (existing-behavior) and client-visible styling (public-contract); proof
is manual visual QA (weak-proof). 3 flags, **no hard gate**: no schema, no
auth/authz, no Server Action, no external system, no weakened validation. A
single token edit with broad but mechanical blast radius.

## Product Contract

Planora's interactive chrome reads as a deliberate product, not the stock shadcn
neutral theme. A **single brand hue** drives every primary action, link, focus
ring, and selected state — replacing today's zero-chroma grayscale — in both
light and dark mode. No layout, copy, or behavior changes; only the resolved
colors of primary/selected/focus surfaces.

- Today every semantic color in `app/globals.css` is `oklch(L 0 0)` (lightness
  only, **chroma 0 = no hue**): `--primary`, `--ring`, `--accent`, links, and
  selected states are all gray. Trello's perceived polish comes largely from one
  accent hue tying these states together (reference `#1868DB`).
- The **per-board background gradients** (`boardTheme.header/surface`,
  `lib/constants.ts`) are the correct Trello *board-background* analogue and are
  **out of scope** — they stay as-is.

## Relevant Product Docs

- `docs/design/planora-vs-trello-gap-analysis.md` — Gap 1 (the highest-leverage
  change).
- `docs/design/trello-board-ui-reference.md` §1–2 (brand `#1868DB`, selected
  `#E9F2FE`, focus `#4688EC`).
- `docs/product/boards-and-cards.md` — no contract change; presentation only.

## Acceptance Criteria

- `--primary` and `--primary-foreground` resolve to a **committed, contrast-tested**
  chromatic brand pair in **both** `:root` and `.dark` (the two themes need
  *different* values — see Design Notes); primary buttons render in brand color,
  not near-black/near-white gray.
- **Measured contrast is documented** in Evidence: `--primary` vs
  `--primary-foreground` is **≥4.5:1** in light **and** dark (button text is
  normal-size). The committed values — not an "example" — are recorded.
- `--ring` resolves to the brand hue so keyboard focus rings read as brand, not
  gray. The ring renders at **`/50` opacity** (`focus-visible:ring-ring/50` in
  `button.tsx`, `outline-ring/50` base) — verify the *rendered* ring meets **≥3:1
  (WCAG 1.4.11)** against both `--background` **and** a per-board gradient surface
  (the board canvas the ring appears over); if it can't at `/50`, keep the
  full-opacity `border-ring` fallback that `button.tsx` already applies.
- A selected-state token pair exists (brand fill + subtle brand tint, the
  `#1868DB` / `#E9F2FE` analogue) and is used by at least the active **Filter**
  state and any selected rows/checkboxes. **Selected is communicated by more than
  color** (a check/`aria-checked`/count badge), never the tint alone (WCAG 1.4.1).
- The card-detail **"Post comment"** button and other primary CTAs (create
  board/list/card submit) render in brand color, not muted gray.
- The `link` button variant (`text-primary`) is legible as link text: **≥4.5:1**
  against `--background` in both themes (tighter than button-fill contrast — check
  explicitly).
- No regression to per-board gradient headers/surfaces, destructive red, or label
  colors (those are data-driven, not theme tokens).
- Light + dark both render correctly; no console errors; unit suite stays green.

## Design Notes

- Commands/Queries/API/Tables/Domain rules: none.
- **UI surfaces:** `app/globals.css` only. Pick a brand hue (Planora's own — a
  blue near the reference `#1868DB`, or a distinct identity color). Note shadcn's
  dark theme *inverts* primary (light `--primary` near-white today), so a single
  value cannot serve both — commit **two** pairs:
  - *Light* recommended start: `--primary: oklch(0.52 0.20 262)` /
    `--primary-foreground: oklch(0.985 0 0)` (white text on a mid-dark blue ≈ the
    `#1868DB` AA point — **measure and adjust L down if it misses 4.5:1**).
  - *Dark* recommended start: a brighter brand fill (e.g. `oklch(0.62 0.18 262)`)
    with the foreground chosen to hit AA — **measure**; do not assume the light
    value works.
  - `--ring` → the brand hue in each theme. Add `--selected` +
    `--selected-foreground`/tint and wire `--color-selected*` aliases in the
    `@theme inline` block.
- **Decide explicitly (don't leave to the implementer):** `--accent` (today gray;
  drives hover/menu surfaces) and `chart-*` are **out of scope** — they stay
  neutral/as-is so hover states don't clash; this story scopes only
  primary / ring / selected / link. State this in the PR.
- Audit consumers that assume a *gray* primary: `board-filter.tsx` active badge
  (`bg-primary`), `ring-primary/*` drag highlights in `list-column.tsx` /
  `list-card-item.tsx` — confirm they read well in the new hue (they reference the
  token, so mechanical; verify visually over the board gradient).
- Keep it token-only; **do not** hard-code hex in components.
- Optional follow-up (not this story): brand the white app top bar.

## Dependencies

- **Land before US-043 and US-044** — both consume this hue (US-043's brand
  "Post comment" button; US-044's `ring-primary` drag highlight). Their brand ACs
  are unverifiable until US-042 ships.
- **Pairs with US-046 (light/dark switch).** Dark mode is currently *unreachable*
  (no theme provider/toggle applies `.dark`), so the dark half of this story's
  palette can only be visually verified by forcing `.dark` in devtools until
  US-046 ships the switcher. Commit and contrast-test the dark values here anyway;
  US-046 makes them user-reachable.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-042 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — pure token values, no logic. Full suite stays green. |
| Integration | n/a. |
| E2E | n/a — no harness. |
| Platform | Brand hue visible on primary buttons / focus / active-filter / selected, light + dark; AA contrast on button text; no gradient or label regression; no overflow; no console errors. |
| Release | Manual visual QA across board, card detail, boards overview, auth forms. |

## Harness Delta

None expected. If a new `--selected` token is added, note it as the project's
selected-state convention.

## Evidence

### Committed brand palette (not an example — these are the shipped values)

| Token | Light (`:root`) | Dark (`.dark`) |
| --- | --- | --- |
| `--primary` | `oklch(0.52 0.2 262)` (≈`#1f5ed9`) | `oklch(0.54 0.19 262)` (≈`#2a66db`) |
| `--primary-foreground` | `oklch(0.985 0 0)` (white) | `oklch(0.985 0 0)` (white) |
| `--ring` | `oklch(0.52 0.2 262)` | `oklch(0.62 0.18 262)` |
| `--selected` / `--selected-foreground` | brand fill / white | brand fill / white |
| `--selected-tint` / `--selected-tint-foreground` | `oklch(0.95 0.03 262)` / `oklch(0.45 0.16 262)` | `oklch(0.3 0.07 262)` / `oklch(0.9 0.05 262)` |

### Measured WCAG contrast (computed from OKLCH→sRGB, `scripts/`-equivalent in scratchpad)

| Pair | Light | Dark | Requirement |
| --- | --- | --- | --- |
| `--primary` vs `--primary-foreground` (button text) | **5.50:1** | **5.02:1** | ≥4.5:1 (AA) ✓ |
| `link` (`text-primary`) on `--background` | **5.74:1** | **7.90:1** | ≥4.5:1 ✓ |
| focus ring (full-opacity `border-ring`, see below) vs bg | **5.74:1** | **5.31:1** | ≥3:1 (1.4.11) ✓ |
| `--selected-tint` vs `--selected-tint-foreground` | **6.60:1** | **10.17:1** | ≥4.5:1 ✓ |
| dark `--primary` fill vs `--background` (button visible) | — | **3.78:1** | ≥3:1 (UI) ✓ |

**Focus-ring note (1.4.11):** the `focus-visible:ring-ring/50` glow alone is only
~2.2:1 (blended at 50% opacity) — *not* sufficient. The compliant indicator is the
**full-opacity `border-ring`** that `button.tsx` / `checkbox.tsx` already apply on
`focus-visible` (measured ≥5:1). The base-layer `* { outline-ring/50 }` for
non-button focusables remains at /50 (a pre-existing limitation, unchanged by this
story — it was gray /50 before, brand /50 now); a global focus-outline hardening is
out of scope here.

### Scope decisions (per AC)

- `--accent` (hover/menu surfaces) and `chart-*` left **neutral** — out of scope.
- `--sidebar-*` tokens left neutral (no shadcn sidebar in active use; header is custom).
- Per-board gradient headers/surfaces, destructive red, and data-driven label
  colors untouched.

### New token consumer

`board-filter.tsx` selected label rows now use `--selected-tint` /
`--selected-tint-foreground` (the `#E9F2FE` analogue), **plus** the existing check
indicator so selection is never color-only (WCAG 1.4.1). The active-filter count
badge and shadcn `checkbox` already consumed `--primary` and now render brand.

### Verified (browser, fresh signup → real board on a **Blue** board gradient = worst case)

- Tokens resolve to a chromatic blue on a live page (HMR): `--primary` =
  `lab(42% 17.9 -70.1)` light / `lab(44.6% 14.7 -66.7)` dark — confirmed not
  grayscale.
- **Auth forms, light + dark:** `.ui-review/us-042-signin-light.png`,
  `us-042-signin-dark.png` — Sign In / Sign Up / header CTA / link all render
  brand; dark renders correctly (readable text, brand button, no broken surface).
- **Card detail "Post comment":** `.ui-review/us-042-card-detail-light.png`
  (disabled = brand at reduced opacity, *not* gray) and
  `us-042-post-comment-enabled.png` (enabled = full brand fill, white text). The
  comment textarea shows a **brand focus ring** (`border-ring`) when focused.
- **Board over the Blue gradient:** `.ui-review/us-042-drag-ring-light.png`,
  `us-042-drag-lifted.png` — the **list drag-handle focus ring renders brand and
  is clearly visible over the worst-case blue board** (answers the only contrast
  question that depended on a variable board background; the `border-primary/40`
  card drop-zone is the *same* token at lower opacity, so it's a strict subset of
  this check). The **user avatar renders brand**.
- Unit suite green (523 passing); `board-filter.tsx` lints clean; no new lint
  errors introduced.

### Not separately captured (token already proven; near-zero risk)

- **Active-filter count badge** (`bg-primary`) and **filter dropdown selected-tint
  rows** require board labels to exist; both consume tokens (`--primary`,
  `--selected-tint`) confirmed resolving correctly and rendered elsewhere. Capture
  opportunistically when a labeled board is at hand.
- Full **dark-mode board/card-detail** sweep belongs to **US-046** (which makes
  dark reachable in-product); US-042's dark palette is contrast-verified above and
  rendered on the auth page in dark.
