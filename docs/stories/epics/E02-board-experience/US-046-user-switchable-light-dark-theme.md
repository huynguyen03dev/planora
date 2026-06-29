# US-046 Let users actually switch between light and dark theme

## Status

planned

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

Add before/after screenshots (the new toggle; board + card detail in dark) to
`.ui-review/` after implementation.
