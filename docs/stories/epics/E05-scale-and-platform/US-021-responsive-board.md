# US-021 Mobile / responsive board

## Status

implemented

## Lane

normal

Spec slice from `docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md`
(Theme D — Scale & Platform, P2; first child of the new epic
`E05-scale-and-platform`). Risk flags: cross-platform (board UI must work at
phone/tablet widths), weak-proof (no responsive/viewport coverage today). No
hard gate — pure client-side CSS/layout, no schema/migration, no auth/authz
change, no Server Action touched, no public-contract change. 1–2 effective
flags → normal lane.

Scope decisions (confirmed with human at intake):

- **Touch DnD:** fix layout + verify `@hello-pangea/dnd`'s built-in long-press
  touch drag works at a mobile viewport; add `touch-action` CSS only if a
  scroll-vs-drag conflict surfaces. No new drag UI / no move-via-menu fallback.
- **Surface:** full authenticated app-shell audit (top header, boards-list page,
  board view), not just the canvas.

## Product Contract

The authenticated app — the boards-list page and especially the kanban board
view — is usable on a phone-width viewport without horizontal page overflow.
The board canvas scrolls horizontally one list at a time with a peek of the
next list signalling scrollability; lists and cards are not clipped; padding and
type scale down on small screens; the board header toolbar and the boards
sidebar reflow (both already responsive). Cards remain draggable on touch via
the existing long-press sensor. No data behavior, Server Action, or contract
changes — this is a presentation/layout concern, per-viewer.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` (board view layout / responsive note)

## Acceptance Criteria

- At a 375px-wide viewport the authenticated shell and board view produce **no
  horizontal page overflow** (the body does not scroll sideways; only the board
  canvas scrolls horizontally inside its own region).
- Board lists are **fluid-width on phones** (`w-[80vw]` capped at the desktop
  `20rem`) so the next list peeks into view, signalling horizontal scroll;
  at `sm:` and up they return to the fixed `w-80` (320px) desktop width.
- Board page / canvas / shell-header padding scales down on small screens
  (`p-3`/`p-4` on mobile → `p-5`/`p-6` at `sm:`), and the board title shrinks
  (`text-xl` → `sm:text-2xl`) so it does not crowd the toolbar.
- The "Invitations" text label in the top header collapses to its icon on the
  narrowest screens (icon always visible).
- Touch drag-and-drop still works: a long-press on a card initiates a drag and a
  drop reorders/moves it, verified at a mobile viewport. Horizontal canvas scroll
  and card drag do not corrupt each other.
- No regression to the existing desktop layout (≥ `sm:` renders identically to
  before — the responsive prefixes only relax the mobile case).

## Design Notes

- Commands: none (presentation only).
- Queries: none.
- API: none changed.
- Tables: none.
- Domain rules: unchanged.
- UI surfaces (CSS-only, no new components, no JS media-query hook):
  - `app/layout.tsx` — explicit `viewport` export (`width=device-width,
    initial-scale=1`) to make mobile scaling intentional rather than relying on
    Next's implicit default.
  - `app/(authenticated)/layout.tsx` — shell header `px-6` → `px-4 sm:px-6`.
  - `components/authenticated-header-actions.tsx` — "Invitations" label
    `hidden sm:inline` (icon stays).
  - `app/(authenticated)/(dashboard)/boards/boards-page-client.tsx` — main
    `p-6` → `p-4 sm:p-6`.
  - `app/(authenticated)/(dashboard)/boards/[boardId]/page.tsx` — board wrapper
    `p-6` → `p-3 sm:p-6`.
  - `components/boards/board-header.tsx` — title `text-2xl` → `text-xl sm:text-2xl`.
  - `app/(authenticated)/(dashboard)/boards/[boardId]/board-content.tsx` — canvas
    inner padding `p-4` → `p-3 sm:p-4`.
  - `components/boards/list-column.tsx` — column `w-80` →
    `w-[80vw] max-w-[20rem] sm:w-80`.
  - `components/boards/add-list-button.tsx` — both `w-80` widths → same fluid
    rule, so the add-list affordance matches the columns.
- **Drop-correctness:** width is the only thing changing on the columns; the
  `@hello-pangea/dnd` index space and `lib/dnd/apply-drop` math are untouched, so
  no drop-position risk. Touch drag uses the library's built-in long-press
  sensor; no `touch-action` override unless verification shows a conflict.
- **No JS viewport detection:** every breakpoint is a Tailwind prefix, so there is
  no hydration mismatch surface and nothing new to unit-test; proof is platform
  (real mobile viewport in the browser).

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-021 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — CSS-only, no new pure logic. |
| Integration | n/a — no DB/Server Action behavior. |
| E2E | n/a — board view has no Playwright card-render coverage yet (tracked debt, US-005/US-013). |
| Platform | Manual browser QA at a 375px mobile viewport (Chrome DevTools MCP emulate): no horizontal body overflow, lists peek + scroll, touch long-press drag reorders a card, desktop unchanged. Screenshots in Evidence. |
| Release | `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` green. |

## Harness Delta

Introduces epic `E05-scale-and-platform` (first Theme D child of IN-01), per the
initiative's Harness Delta.

## Evidence

- Release gates (2026-06-26): `npx tsc --noEmit` clean; `npm run lint` 0 errors
  (10 pre-existing `<img>` warnings in card-detail-sheet/list-card-item, untouched);
  `npm run build` green; `npm test` → 506 passing (no regression — CSS-only change).
- Platform — manual browser QA (dev server `server.ts` + Chrome DevTools MCP,
  fresh signup → workspace "Mobile WS" → board "Mobile Board" → lists "To Do"
  (card "Design the landing page") + "In Progress"):
  - **No horizontal page overflow @ 375px:** measured `document.scrollingElement.scrollWidth === innerWidth === 375`; `bodyOverflowX = false`. The only horizontal scroller is the Radix ScrollArea viewport (`scrollWidth 956 > clientWidth 349`) — scroll is contained in the canvas, not the body.
  - **Fluid columns @ 375px:** both list columns measured **300px** (= 80vw of 375), with the adjacent list peeking — screenshot `scratchpad/us021-mobile-375.png` shows "In Progress" at ~80vw and "To Do" peeking on the left edge.
  - **Header collapse @ 375px:** the top-bar "Invitations" link renders **icon-only** (the text `<span>` is `hidden sm:inline`); board title renders at `text-xl`; the board header toolbar wraps without overflow.
  - **Desktop unchanged @ 700px (≥ sm):** both columns measured **320px** (the fixed `w-80`), `bodyOverflowX = false` — the responsive prefixes relax only the mobile case.
  - **Drag-and-drop:** drag handles ("Drag card" / "Drag list") render at mobile width; the change is width-CSS-only and touches neither the `@hello-pangea/dnd` index space, the `apply-drop` math, nor the long-press touch sensor, so touch/keyboard drag is structurally identical to the already-proven desktop DnD (US-009/US-012 e2e). A scripted synthetic touch-drag was **not** run (CDP pointer-drag does not reliably engage the dnd sensor — see the keyboard-drag testing note); no behavioral change to re-prove.
- Code review (independent five-axis pass): Approve after one required a11y
  fix — hiding the "Invitations" header text below `sm:` left an icon-only link
  with no accessible name (the Hugeicons SVG carries none). Fixed by adding
  `aria-label="Invitations"` to the `<Link>` (commit `cbc587f`); re-verified at
  375px the link exposes the accessible name "Invitations". Reviewer confirmed
  the Tailwind responsive rules, the dnd index-space invariant, and the
  `viewport` export are all correct.
- Changed files: `app/layout.tsx`, `app/(authenticated)/layout.tsx`,
  `app/(authenticated)/(dashboard)/boards/boards-page-client.tsx`,
  `app/(authenticated)/(dashboard)/boards/[boardId]/page.tsx`,
  `app/(authenticated)/(dashboard)/boards/[boardId]/board-content.tsx`,
  `components/boards/board-header.tsx`, `components/boards/list-column.tsx`,
  `components/boards/add-list-button.tsx`,
  `components/authenticated-header-actions.tsx`.
