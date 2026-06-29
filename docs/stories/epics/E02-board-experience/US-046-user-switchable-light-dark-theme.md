# US-046 Let users actually switch between light and dark theme

## Status

implemented — 2026-06-29 (manual QA, browser-verified). `next-themes` provider +
header `ThemeToggle` (Hugeicons) make the shipped `.dark` palette reachable;
dark-mode audit fixed the analytics dashboard's light-only amber/red/green panels.

## Lane

normal (with stronger validation) — makes already-shipped-but-unreachable dark
CSS reachable (existing-behavior), adds a client-visible control
(public-contract-adjacent), and has an SSR-hydration failure mode (weak-proof).
~2–3 flags, **no hard gate**: localStorage persistence means **no schema, no
Server Action, no auth/authz, no external system**. (DB-backed per-user
persistence was explicitly rejected to avoid a migration hard gate — see
Non-Goals.)

## Product Contract

Planora ships a complete `.dark` palette in `app/globals.css` and `dark:`
variants throughout components, but **nothing ever applies the `.dark` class** —
no theme library, no provider, no toggle, no persistence. Dark mode is therefore
**unreachable dead code** today. This story makes light/dark a real,
user-controlled preference.

- A user can switch between **Light**, **Dark**, and **System** from a control in
  the authenticated app header, and the choice **persists across reloads**
  (per-device, localStorage) and **defaults to the OS preference** on first
  visit.
- No flash of the wrong theme on load (the resolved theme is applied before first
  paint).
- Every existing `.dark` token and `dark:` variant simply starts working; no
  per-component restyle is in scope.

## Relevant Product Docs

- `docs/design/planora-vs-trello-gap-analysis.md` — corrects the "full dark theme
  — ahead of Trello" claim (dark mode was never reachable until this story).
- `docs/product/` — no domain contract changes (presentation/UX only).

## Dependencies

- **Pairs with US-042.** US-042 commits the brand tokens for *both* themes but,
  until this story, dark could only be seen by forcing `.dark` in devtools. After
  US-046, US-042's "light + dark both render correctly" AC is verifiable in
  product. Either can land first; verifying US-042's dark palette end-to-end
  depends on US-046.

## Acceptance Criteria

- `next-themes` is installed and a `ThemeProvider` (`attribute="class"`,
  `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`) wraps the
  app in the root layout. `<html>` carries `suppressHydrationWarning`.
- A theme control lives in the authenticated header
  (`app/(authenticated)/layout.tsx`, beside the notification bell). It offers
  **Light / Dark / System** (shadcn `DropdownMenu` mode-toggle pattern), is an
  icon button with an **accessible name** (`aria-label`/sr-only), fully
  keyboard-operable, with a **visible focus ring** and **≥24×24px** hit target.
  The current selection is indicated by **more than color** (a check/`•` marker),
  per WCAG 1.4.1.
- Selecting a theme **persists** (localStorage) and survives a full reload;
  **System** tracks live OS changes (`prefers-color-scheme`).
- **No flash of incorrect theme (FOIT/FOUC)** on first paint or reload — the
  blocking script next-themes injects resolves the class before hydration; verify
  no white flash when reloading in dark.
- No hydration mismatch console errors/warnings in dev (the
  `suppressHydrationWarning` requirement).
- Icons use the project's **Hugeicons** set (sun/moon), not lucide; the toggle
  matches existing header button sizing/spacing.
- Dark mode now renders correctly across **board, card detail, boards overview,
  auth forms, and dashboard** — no unreadable text, no invisible borders, no
  white-on-white. Any surface that breaks gets a `dark:` fix as part of this story
  (this is the first time these screens are seen in dark in-product).
- Light remains the default appearance for users whose OS is light/unset; no
  unexpected switch for existing users.
- Unit suite stays green; no console errors.

## Design Notes

- Follow shadcn's official Next.js dark-mode recipe (provider + mode-toggle), but
  swap lucide icons for **Hugeicons** (`@hugeicons/core-free-icons`) per project
  convention, and the dropdown for shadcn `DropdownMenu` (add via
  `npx shadcn add dropdown-menu` if not present).
- `ThemeProvider` must be a `"use client"` wrapper; keep the root layout itself a
  Server Component and render the provider around `{children}`.
- **Scope guard:** this story does **not** redesign any screen for dark; it makes
  dark reachable and fixes only genuine breakage surfaced once it's on. Brand
  token values are **US-042's** job, not here.
- **Audit pass (expected, since dark has never run in-product):** sweep board,
  card detail, boards overview, auth, header/nav for hardcoded light-only
  colors (raw `bg-white`, `text-black`, `border-gray-*` without a `dark:`
  counterpart). Fix with tokens/`dark:` variants. Record any non-trivial fixes.
- Keep the control discoverable but unobtrusive — a single header icon button
  opening a 3-item menu (Light/Dark/System), matching the notification bell's
  visual weight.

## Non-Goals

- **DB-backed / cross-device theme persistence** — would add a `User` field and a
  migration (data-model hard gate → high-risk). Explicitly out of scope;
  localStorage per-device is sufficient. Revisit as a separate high-risk story if
  cross-device sync is wanted.
- Brand hue/token *values* (US-042).
- Per-board or per-component theme overrides; custom/third theme beyond
  light/dark/system.
- Theming the public/marketing landing page beyond what tokens already cover.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-046 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — provider wiring + presentational toggle, no domain logic. Full suite stays green. |
| Integration | n/a — no Server Action. |
| E2E | n/a — no harness. |
| Platform | Toggle switches Light/Dark/System; persists across reload; System tracks OS; **no flash** on reload-in-dark; no hydration warnings; keyboard + screen-reader operable; dark renders correctly on board/card-detail/boards-overview/auth/dashboard. |
| Release | Manual visual QA in both themes across all major screens, light↔dark round-trip, fresh-visit (system default) check. |

## Harness Delta

Adds `next-themes` as the project's theme mechanism and a `ThemeProvider` /
header `ThemeToggle` as the convention for app-wide theme switching. Note in the
PR so future theme work reuses it rather than re-rolling.

## Evidence

### What shipped

- **Provider.** `next-themes` is installed; a `"use client"` `ThemeProvider`
  (`components/theme-provider.tsx`) with `attribute="class"`,
  `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange` wraps
  `{children}` in the root layout (`app/layout.tsx`), which stays a Server
  Component. `<html>` carries `suppressHydrationWarning`. Persistence is
  per-device via localStorage (Non-Goals: no DB/cross-device sync).
- **Header toggle.** `components/theme-toggle.tsx` — a shadcn `DropdownMenu`
  icon button placed beside the notification bell in
  `components/authenticated-header-actions.tsx`. 32×32 hit target (≥24), matches
  the bell's hover/focus treatment, visible focus ring, `aria-label="Switch
  theme"`. Offers **Light / Dark / System** with **Hugeicons** (`Sun03Icon`,
  `Moon02Icon`, `ComputerIcon`) — no lucide. The current choice is marked by a
  non-color **✓** plus an sr-only "(selected)" (WCAG 1.4.1). The trigger icon
  swaps sun↔moon purely via the `.dark` CSS class (`dark:hidden`/`dark:block`),
  so it is correct before first paint and never hydration-mismatches; the
  `theme` JS value is read only inside the portal-rendered menu (opened well
  after mount), so no `mounted` guard is needed.
- **Dark-mode audit.** Dark had never run in-product. App-wide sweep found the
  codebase already token-based (shadcn `bg-card`/`text-foreground`/etc.); the
  only `text-white`/`bg-white` hits sit on intentionally-colored surfaces (board
  cover banner, label chips, workspace badges, destructive badge) and are
  theme-independent. The **analytics dashboard** was the lone breakage: four
  light-only panels got `dark:` variants —
  `launch-boundary-banner.tsx` and `data-quality-section.tsx` (amber
  `border-amber-200 bg-amber-50 text-amber-800` notice →
  `dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300`),
  `kpi-cards.tsx` (green/red trend + amber low-confidence → brighter `-400` in
  dark), `lead-time-table.tsx` (red/emerald Late/On-time badges → `-400` in
  dark). No other surface needed a fix.

### Verified (browser, authenticated, dev server)

- Toggle dropdown opens with Light/Dark/System + Hugeicons; **✓** tracks the
  active choice ("System (selected)" → "Dark (selected)" in the a11y tree).
- **Dark renders correctly** on boards overview, board, card detail (US-043
  document layout), and the analytics dashboard — readable text, dark surfaces,
  legible label chips, brand-primary Post-comment, no white-on-white.
- **Persistence:** selecting Dark sets `localStorage.theme="dark"`; after a full
  reload `<html>` already carries `dark` and `color-scheme: dark` (next-themes'
  blocking pre-hydration script), so **no flash** of the light theme.
- **Light round-trip** works (sun icon returns, focus ring intact).
- **Mobile 375px:** `scrollWidth === innerWidth` (no horizontal overflow), toggle
  reachable.
- **No hydration mismatch / no console errors or warnings** across boards/board/
  card-detail/dashboard. Full lint clean (only pre-existing `<img>` cover
  warnings); unit suite green (523 passing).
- Auth/public routes (`app/(public)/sign-in`, `sign-up`) are token-based (no
  light-only hardcodes) — verified by static sweep (couldn't view live while
  authenticated; they inherit the global provider/theme).

### Screenshots (`.ui-review/`)

- `us-046-dark-boards-overview.png`, `us-046-dark-card-detail.png`,
  `us-046-dark-dashboard.png` (post-fix amber notice), `us-046-dark-mobile.png`.
