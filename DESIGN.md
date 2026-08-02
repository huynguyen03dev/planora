---
version: alpha
name: Planora-design-system
description: "Planora's NORTH-STAR design spec — the target the UI should be refactored toward, for a good and consistent product surface. Design language is adapted from Linear (product-craft shell: dense, quietly professional, a single scarce chromatic accent, hierarchy by a neutral surface ladder + hairline borders) and from Notion (the card-detail document surface, the elevation ladder, and the tinted-label pattern). It is mapped onto Planora's shadcn/Tailwind token system (app/globals.css, :root + .dark). This is a pure adaptation of the design repo — the target visual language, independent of any current implementation. Tokens are shadcn role names used as Tailwind utilities (bg-card, text-muted-foreground, border-border), never raw hex."

colors:
  primary: "{--primary} oklch(0.52 0.2 262)  · dark oklch(0.54 0.19 262)"
  primary-foreground: "{--primary-foreground} oklch(0.985 0 0)"
  background: "{--background} oklch(1 0 0)  · dark oklch(0.145 0 0)"
  foreground: "{--foreground} oklch(0.145 0 0)  · dark oklch(0.985 0 0)"
  card: "{--card} oklch(1 0 0)  · dark oklch(0.205 0 0)"
  card-foreground: "{--card-foreground} oklch(0.145 0 0)  · dark oklch(0.985 0 0)"
  popover: "{--popover} oklch(1 0 0)  · dark oklch(0.205 0 0)"
  popover-foreground: "{--popover-foreground} oklch(0.145 0 0)  · dark oklch(0.985 0 0)"
  secondary: "{--secondary} oklch(0.97 0 0)  · dark oklch(0.269 0 0)"
  secondary-foreground: "{--secondary-foreground} oklch(0.205 0 0)  · dark oklch(0.985 0 0)"
  muted: "{--muted} oklch(0.97 0 0)  · dark oklch(0.269 0 0)"
  muted-foreground: "{--muted-foreground} oklch(0.556 0 0)  · dark oklch(0.708 0 0)"
  accent: "{--accent} oklch(0.97 0 0)  · dark oklch(0.269 0 0)"
  accent-foreground: "{--accent-foreground} oklch(0.205 0 0)  · dark oklch(0.985 0 0)"
  destructive: "{--destructive} oklch(0.577 0.245 27.325)  · dark oklch(0.704 0.191 22.216)"
  border: "{--border} oklch(0.922 0 0)  · dark oklch(1 0 0 / 10%)"
  input: "{--input} oklch(0.922 0 0)  · dark oklch(1 0 0 / 15%)"
  ring: "{--ring} oklch(0.52 0.2 262)  · dark oklch(0.62 0.18 262)"
  selected: "{--selected} oklch(0.52 0.2 262)  · dark oklch(0.54 0.19 262)"
  selected-foreground: "{--selected-foreground} oklch(0.985 0 0)"
  selected-tint: "{--selected-tint} oklch(0.95 0.03 262)  · dark oklch(0.3 0.07 262)"
  selected-tint-foreground: "{--selected-tint-foreground} oklch(0.45 0.16 262)  · dark oklch(0.9 0.05 262)"

typography:
  display-xl: { fontFamily: Inter, fontSize: 80px, fontWeight: 600, lineHeight: 1.05, letterSpacing: -3.0px }
  display-lg: { fontFamily: Inter, fontSize: 56px, fontWeight: 600, lineHeight: 1.10, letterSpacing: -1.8px }
  display-md: { fontFamily: Inter, fontSize: 40px, fontWeight: 600, lineHeight: 1.15, letterSpacing: -1.0px }
  headline:   { fontFamily: Inter, fontSize: 28px, fontWeight: 600, lineHeight: 1.20, letterSpacing: -0.6px }
  card-title: { fontFamily: Inter, fontSize: 22px, fontWeight: 500, lineHeight: 1.25, letterSpacing: -0.4px }
  subhead:    { fontFamily: Inter, fontSize: 20px, fontWeight: 400, lineHeight: 1.40, letterSpacing: -0.2px }
  body-lg:    { fontFamily: Inter, fontSize: 18px, fontWeight: 400, lineHeight: 1.50, letterSpacing: -0.1px }
  body:       { fontFamily: Inter, fontSize: 16px, fontWeight: 400, lineHeight: 1.50, letterSpacing: -0.05px }
  body-sm:    { fontFamily: Inter, fontSize: 14px, fontWeight: 400, lineHeight: 1.50, letterSpacing: 0 }
  caption:    { fontFamily: Inter, fontSize: 12px, fontWeight: 400, lineHeight: 1.40, letterSpacing: 0 }
  button:     { fontFamily: Inter, fontSize: 14px, fontWeight: 500, lineHeight: 1.20, letterSpacing: 0 }
  eyebrow:    { fontFamily: Inter, fontSize: 13px, fontWeight: 500, lineHeight: 1.30, letterSpacing: 0.4px }
  mono:       { fontFamily: Geist Mono, fontSize: 13px, fontWeight: 400, lineHeight: 1.50, letterSpacing: 0 }

rounded:
  sm: "{rounded-sm} — label bars, small chips"
  md: "{rounded-md} — buttons, inputs, meta-chips"
  lg: "{rounded-lg} — cards, list columns, popovers, card detail"
  xl: "{rounded-xl} — larger panels"
  full: "{rounded-full} — avatars, status dots, pill tabs"

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 14px (Linear; Notion uses 10px 18px — buttons follow Linear as the app-shell source)"
    hover: "lighter same-hue tint (Linear hovers to a lighter accent, not an opacity step)"
    pressed: "tonal darken (active:translate-y-px ok)"
    focus: "border-ring + ring/50 glow"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    border: "1px solid {colors.border}"
    hover: "{colors.muted}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    hover: "{colors.muted}"
  button-destructive:
    note: "soft inline / solid confirm — see Components for the consistency rule"
    inline: "{colors.destructive}/10 text + {colors.destructive}, hover /20"
    confirm: "solid {colors.destructive} + white text (final destructive action only)"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: "24px (feature) / compact for board tiles"
    border: "1px solid {colors.border}"
    depth: "surface lift + hairline border — NOT a drop shadow (Linear)"
  card-tile:
    extends: "card, compact"
    padding: "12px"
    title: "{typography.body-sm}"
    meta: "meta-chips + an avatar group in {colors.muted-foreground}"
    hover: "{colors.muted} (or a 1-step surface lift)"
    dragging: "lift to a soft shadow + slight scale"
  card-detail:
    note: "Notion document surface — opened as a modal"
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    rounded: "{rounded.lg}"
    padding: "32px"
    body: "{typography.body} at 1.55 leading (Notion body-md); comfortable reading column"
    structure: "title → meta row → stacked sections (description, checklist, comments, attachments) divided by {colors.border} hairlines"
  text-input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    border: "1px solid {colors.input}"
    focus: "border-ring + ring/50 glow"
    error: "border-destructive + message (never color-only)"
  tab-default:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  tab-selected:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.full}"
  status-badge:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  meta-chip:
    note: "card-face priority/due/checklist indicators — tint mechanism from Notion; the priority/due ramp is a Planora adaptation"
    style: "soft tint bg + deeper same-hue text + icon + label, rounded {rounded.md}, px 6px py 2px"
    a11y: "icon + word + aria-label, NEVER color-only (WCAG 1.4.1)"
  label-chip:
    note: "card labels — Notion tinted pattern"
    backgroundColor: "per-hue tint (tint + deeper same-hue text, like {colors.selected-tint})"
    textColor: "deeper same hue ({colors.selected-tint-foreground} analogue)"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    a11y: "name as text (the non-color channel); bar form adds a colorblind texture"
  top-nav:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    height: "56px"
    border: "0 0 1px {colors.border} solid"
---

## Overview

Planora's surface follows **Linear's** product-craft language onto a
shadcn/Tailwind token system. Hierarchy is carried by a neutral **surface
ladder** — `{colors.background}` → `{colors.card}` → `{colors.popover}` — each
step reinforced by a 1px `{colors.border}` hairline rather than by a drop shadow.
Default text is `{colors.foreground}`; secondary and meta text drop to
`{colors.muted-foreground}`.

The single chromatic accent is **Planora brand blue** `{colors.primary}`
(≈ #1f5ed9, the Planora brand hue, AA-checked) — used on the primary CTA, the
focus `{colors.ring}`, selection (`{colors.selected}` / `{colors.selected-tint}`),
and the active state. No second chromatic accent in the chrome; the only color
spectra are the **tinted labels** and the **meta-chip** semantic ramp
(priority/due) — both borrow Notion's **tint mechanism** (tint bg + deeper
same-hue text); the priority/due ramp itself is a Planora adaptation, not from
the originals.

Display type runs **Inter** (`--font-sans`) at weight 500–600 with negative
tracking from -3.0px at 80px down to ~0 at body; **Geist Mono** (`--font-mono`)
for IDs and code. The **card detail** reads as a Notion-style document.

Unlike Linear's dark-only marketing canvas, Planora ships **both themes**. Every
color token resolves in `:root` and `.dark` — use the role, not a value.

**Key Characteristics:**
- **Dual-theme** shadcn token system (light + dark).
- **Brand blue accent** used scarcely: primary CTA, focus, selection, active.
- Neutral **surface ladder** + 1px hairline borders carry hierarchy — depth
  comes from surface lift, **not** drop shadows (Linear).
- Display tracking pulls negative; body holds at -0.05px.
- Buttons are `{rounded.md}` rectangles; cards `{rounded.lg}` — never pill.
- **Card detail = Notion document** surface (stacked, inline-editable sections).
- **Tinted labels and meta-chips** (soft tint + deeper same-hue text) are the
  only color spectra; everything else is neutral.
- No atmospheric gradients. No spotlight cards.

## Colors

> Tokens are shadcn roles in `app/globals.css` (`:root` + `.dark`). Apply as
> Tailwind utilities (`bg-primary`, `text-muted-foreground`, `border-border`).

### Brand & Accent
- **Primary** ({colors.primary}): The brand action — primary CTA, brand
  emphasis, active state. Scarce by policy.
- **Ring** ({colors.ring}): Focus ring (brand hue) — full-opacity border on
  focus (WCAG 1.4.11) + a `ring/50` glow.
- **Selected** ({colors.selected}) / **Selected Tint** ({colors.selected-tint}):
  Brand fill / subtle brand-tinted background for the selected state. Selection
  must also carry a non-color signal (check/count) — WCAG 1.4.1.

### Surface
- **Background** ({colors.background}): App canvas.
- **Card** ({colors.card}): Card tiles, list columns, feature cards — one step
  above canvas.
- **Popover** ({colors.popover}): Menus, dropdowns, the card-detail modal.
- **Secondary** ({colors.secondary}): Quiet neutral surface — secondary buttons,
  selected tab fill.
- **Muted** ({colors.muted}): Quiet fills/skeletons and the **neutral hover
  surface** (buttons, rows, menu items hover to `muted`).
- **Accent** ({colors.accent}): Defined neutral surface (same value as `muted`);
  prefer `muted` for hover for consistency.
- **Border** ({colors.border}): 1px hairlines on cards, columns, dividers — the
  primary hierarchy tool alongside surface.

### Text
- **Foreground** ({colors.foreground}): Headlines and primary body.
- **Muted Foreground** ({colors.muted-foreground}): Secondary/tertiary type —
  meta, counts, captions.

### Semantic
- **Destructive** ({colors.destructive}): Delete / danger and validation errors.

## Typography

### Font Family
- **Inter** (`--font-sans`) — display through caption. (Inter is the open
  substitute Linear's spec recommends, so this is a faithful match.)
- **Geist Mono** (`--font-mono`) — IDs / code only.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 80px | 600 | 1.05 | -3.0px | Hero / empty-state headline |
| `{typography.display-lg}` | 56px | 600 | 1.10 | -1.8px | Section opener |
| `{typography.display-md}` | 40px | 600 | 1.15 | -1.0px | Sub-section headline |
| `{typography.headline}` | 28px | 600 | 1.20 | -0.6px | Board title, CTA heading |
| `{typography.card-title}` | 22px | 500 | 1.25 | -0.4px | Card-detail title |
| `{typography.subhead}` | 20px | 400 | 1.40 | -0.2px | Lead body |
| `{typography.body-lg}` | 18px | 400 | 1.50 | -0.1px | Lead paragraphs |
| `{typography.body}` | 16px | 400 | 1.50 | -0.05px | Card-detail document body |
| `{typography.body-sm}` | 14px | 400 | 1.50 | 0 | Default UI text, card tiles |
| `{typography.caption}` | 12px | 400 | 1.40 | 0 | Captions, meta, status |
| `{typography.button}` | 14px | 500 | 1.20 | 0 | Button labels |
| `{typography.eyebrow}` | 13px | 500 | 1.30 | 0.4px | Uppercase taxonomy |
| `{typography.mono}` | 13px | 400 | 1.50 | 0 | IDs / code |

### Principles
- Aggressive negative tracking on display; single voice from display to body
  (same family, narrower weights).
- Default UI body is `{typography.body-sm}`; step the **card detail** to
  `{typography.body}` with relaxed leading for document readability.
- Cap headline weight at 600.

## Layout

- **Base unit 4px** (Tailwind scale). Tokens: 4 · 8 · 12 · 16 · 24 · 32 · 48px.
- Card-tile interior: **12px**, compact. Feature card: 24px. Card
  detail: **32px**, roomy (Notion).
- Form input padding: 8px × 12px.
- The board canvas scrolls horizontally; lists are fixed-width columns. Density
  over whitespace — the canvas is the breathing room, not large gaps.
- Card-detail content caps at a comfortable reading column (~720px is an
  adaptation default — neither original specifies a card-detail reading measure;
  Notion's marketing pages use a ~1280px container, which is a different thing).

## Elevation & Depth

Depth is carried by the **surface ladder + 1px hairline borders**, not by
shadows (Linear). Shadow appears only on genuinely floating layers.

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | surface + 1px `{colors.border}` | Card tiles, list columns, rows |
| 1 (lift) | next surface step, optional faint shadow | Hover / dragged card |
| 2 (modal) | `rgba(15,15,15,0.16) 0px 16px 48px -8px` + scrim (Notion) | Dialogs, card-detail modal |
| focus | `border-ring` + `ring/50` glow | Focused input / button |

In **dark**, lean on the surface ladder and brighter borders (`{colors.border}`
at ~10–15% white) — shadows read weakly on dark.

## Shapes

| Token | Use |
|---|---|
| `{rounded.sm}` | Label bars, small chips |
| `{rounded.md}` | Buttons, inputs, meta-chips |
| `{rounded.lg}` | Cards, list columns, popovers, card detail |
| `{rounded.xl}` | Larger panels (rare) |
| `{rounded.full}` | Avatars, status dots, pill tabs |

Buttons are `{rounded.md}` rectangles — never pill. Cards are `{rounded.lg}`.
Reserve `{rounded.full}` for avatars, dots, and pill tabs.

> Note: these tokens resolve from `--radius: 0.45rem` via the calc steps in
> `globals.css` (sm = ×0.6, md = ×0.8, lg = ×1.0, xl = ×1.4). This preserves
> Linear's radius *ordering* (buttons < cards) but **not** Linear's literal px
> (Linear uses md 8px / lg 12px; Planora's scale is tighter, md ≈ 5.8px / lg ≈
> 7.2px). The relationship is the faithful part, not the absolute values.

## Components

### Buttons
- **Primary** — `{colors.primary}` / `{colors.primary-foreground}`,
  `{typography.button}`, `{rounded.md}`, padding 8px 14px. Hover/pressed shift
  tonally on the same hue — not a new color. Focus shows the `{colors.ring}`.
- **Secondary** — `{colors.secondary}` + 1px `{colors.border}`, hover
  `{colors.muted}`.
- **Ghost** — transparent, hover `{colors.muted}`. Toolbar/icon actions.
- **Destructive** — **consistency rule:** soft `{colors.destructive}/10` text +
  destructive for *inline / menu* actions; reserve the **solid** fill +
  white text for the **final confirm** action only (e.g. the Archive/Delete
  button in a confirmation modal). Pick one or the other per context — never mix
  within the same surface.

### Cards & Containers
- **`card` / `feature-card`** — `{colors.card}` / `{colors.card-foreground}`,
  `{rounded.lg}`, 1px `{colors.border}`. Depth is the **surface lift + hairline**,
  not a drop shadow.
- **`card-tile`** — the board card, compact: 12px padding, title in
  `{typography.body-sm}`, meta as meta-chips + an avatar group in
  `{colors.muted-foreground}`, labels as `label-chip`. Hover → `{colors.muted}`
  or a one-step surface lift; dragging lifts to a soft shadow + slight scale (the
  drag/hover shadow is a Planora affordance — neither original puts a shadow on a
  lifted card; both resist shadow for hierarchy).
- **`card-detail`** — *Notion document surface.* Opened as a **modal overlay**.
  Background `{colors.popover}`, `{rounded.lg}`, 32px padding, body in
  `{typography.body}` at **1.55 leading** (Notion `body-md`) on a comfortable
  reading column. Structure: title
  (`{typography.card-title}`) → meta row (assignees, due, labels) in
  `{colors.muted-foreground}` → stacked sections (description, checklist,
  comments, attachments) divided by `{colors.border}` hairlines (Notion block
  stack, not boxed sub-cards). Fields read as plain text and reveal `text-input`
  affordance on focus/hover. Brand color marks only the save/primary action.

### Inputs & Forms
- **`text-input`** — `{colors.background}`, 1px `{colors.input}`,
  `{typography.body}`, `{rounded.md}`, padding 8px 12px. Focus → `{colors.ring}`
  border + `ring/50` glow. Error → `{colors.destructive}` + message (never color
  alone).

### Tabs
- **`tab-default` / `tab-selected`** — pill toggle. Default transparent /
  `{colors.muted-foreground}`; selected = `{colors.secondary}` surface lift.

### Badges, Meta-chips & Labels
- **`status-badge`** — `{colors.secondary}` / `{colors.muted-foreground}`,
  `{rounded.full}`, padding 2px 8px.
- **`meta-chip`** (card-face priority/due/checklist) — **soft tint bg + deeper
  same-hue text + icon + label**, `{rounded.md}`, padding 6px×2px. Always icon +
  word + `aria-label` — never color-only (WCAG 1.4.1).
- **`label-chip`** — card labels. **Target = Notion's tinted pattern:** a per-hue
  **tint background + deeper same-hue text** (modeled on `{colors.selected-tint}`
  / `{colors.selected-tint-foreground}`), `{rounded.sm}`, padding 2px 8px. Define
  each label hue as a tint/foreground pair so it clears contrast in **both**
  themes. The name is the non-color channel; a compact bar form adds a colorblind
  texture.

### Navigation
- **`top-nav`** — quiet bar on `{colors.background}`, brand mark left, actions
  right, `{typography.body-sm}`, 56px, 1px `{colors.border}` bottom rule.

## Keyboard Shortcuts

Planora's first global shortcut owner is **Global Quick Capture** (US-083 W7).
Conventions for any future global shortcut:

- **Ownership & discovery:** each global shortcut is owned by exactly one
  component; there is no central hotkey registry. The owning control exposes
  the shortcut via `aria-keyshortcuts` (e.g. `c Control+K`) and a `title`
  tooltip, so users and AT can discover it.
- **Guard before fire:** a global shortcut must never fire while the user is
  typing (input / textarea / select / contenteditable targets), while any
  dialog/menu/listbox is open, on key repeat or IME composition, or when the
  shortcut's own surface is already open. Guarding is a pure predicate
  (`lib/quick-capture.ts` `matchQuickCaptureShortcut`) — unit-testable
  without DOM.
- **`preventDefault` only when handled:** call `preventDefault()` only when
  the predicate matched (the event is actually handled). Guards never touch
  the event, so copy (Ctrl/Cmd+C), typing, and browser-reserved chords keep
  their native behavior.
- **Reserved-chord honesty:** browser chrome reserves some chords
  (Cmd/Ctrl+K = address bar/find). Implement and test them, but never
  overclaim portability in docs — label the primary demo path (bare `C`) as
  the reliable one.
- **Shortcut language:** bare letters match the unmodified, lowercase key
  (Shift+C arrives as `C` and never fires). Modifier chords are explicit
  (`Ctrl`/`Cmd` + letter), exclude Alt and Shift unless the feature owns
  them.

## Transient Feedback

Transient feedback (toasts/snackbars) follows the Quick Capture success toast
(US-083 W7) and the bounded undo snackbar (US-083 W8) conventions:

- **Surface:** fixed bottom-right, `{colors.card}` surface, 1px `{colors.border}`,
  `{rounded.lg}`, `{shadow.lg}`, `px-4 py-3`, `{typography.body-sm}` text,
  `z-50` above dialogs.
- **Semantics by outcome:** polite outcomes (offer, success) use
  `role="status"`; failures use `role="alert"` with the action's own error
  message — never string-swapped at the UI layer. The two roles must not be
  mixed on one surface.
- **Never steal focus:** a transient surface appears without moving focus;
  interactive affordances inside it (e.g. an Undo button) are reachable by tab,
  never autofocused.
- **Ownership & lifecycle:** each transient surface is owned by exactly one
  component/state machine — no app-wide toast framework. Offers are bounded:
  they expire (8s for undo offers), dismiss manually (X), dismiss on
  navigation, and in-flight states are reflected in the affordance
  ("Restoring…", disabled) so the UI never sticks.
- **No persistence:** transient feedback is never persisted — no entity, no
  Notification row, no route state.

## Do's and Don'ts

### Do
- Use `{colors.primary}` blue ONLY for: primary CTA, focus ring, selection,
  active.
- Carry hierarchy with the surface ladder + 1px `{colors.border}` hairlines —
  depth by surface, not shadow.
- Pair display weight 600 with body weight 400; negative tracking on display.
- Keep card tiles compact (12px); reserve the roomy 32px layout for the card
  detail.
- Buttons `{rounded.md}`; cards `{rounded.lg}`.
- Use tint + deeper-text for labels and meta-chips; always add icon/text +
  `aria-label`/texture (never color-only).
- Hover to `{colors.muted}`.
- Add any new token to both themes with a measured contrast note.

### Don't
- Don't use brand blue as a section background, card fill, or hover fill.
- Don't introduce a second chromatic accent into the chrome (labels + meta-chips
  excepted).
- Don't lean on drop shadows for hierarchy; don't add gradients or spotlight
  cards.
- Don't pill-round buttons, or remove the focus `{colors.ring}`.
- Don't hard-code hex/oklch/arbitrary px when a token exists.
- Don't rely on color alone to convey state.

## Responsive & Accessibility

- **Breakpoints:** Tailwind defaults. Board scrolls horizontally; lists stack /
  scroll on narrow viewports. Card-detail modal fills most of the viewport on
  mobile.
- **Touch targets:** ≥44px touch, ≥36px pointer.
- **Contrast:** maintain the measured ratios in `globals.css` (primary/selected/
  tint pairs are AA-checked). New tokens must clear WCAG AA (4.5:1 text, 3:1 UI)
  in **both** themes — record the ratio in a comment.
- **Focus:** always visible via `{colors.ring}`; never `outline:none` without a
  replacement.
- **Motion:** 150–200ms ease; honor `prefers-reduced-motion`.

## Known Gaps

- Shadow, label-tint, and typography scales should be defined as design tokens
  (both themes, each with a measured contrast note).
- Animation timings (150–200ms ease) are a recommendation until centralized.
- Linear's source is dark-only and Notion's light-biased; the dark-theme token
  values here are Planora's own neutral/brand ramps.
