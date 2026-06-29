# US-040 Production-grade @mention autocomplete (Floating UI + keyboard a11y)

## Status

shipped — 2026-06-27 (manual browser QA, desktop + flip case). Supersedes the
intake #19 hand-rolled positioning.

## Lane

normal

## Product Contract

The comment composer's `@mention` autocomplete is a robust, accessible combobox:

- The suggestion list is **caret-anchored** and uses **Floating UI** for
  positioning — it flips above the caret near the viewport bottom, shifts to stay
  on-screen, and repositions on scroll/resize (`autoUpdate`).
- It is **keyboard-operable**: ArrowUp/ArrowDown move the active option, Enter/Tab
  select it, Escape closes; the textarea retains focus throughout (no focus
  steal — this is why Radix `Popover` was rejected; Floating UI's positioning
  layer does not trap focus).
- It carries **listbox ARIA**: the list is `role="listbox"`, each row is
  `role="option"` with `aria-selected`, and the textarea exposes
  `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, and
  `aria-activedescendant` pointing at the active option.
- Mouse selection keeps textarea focus (option `mousedown` is prevented).
- The dropdown is portaled to `document.body` so the dialog's `transform`
  (centering) does not break fixed positioning, and the dialog's `overflow`
  does not clip it.

Behavior of mention detection/insertion is unchanged (reuses `lib/mention.ts`).

## Relevant Product Docs

- `docs/stories/initiatives/IN-02-board-ux-polish-and-design-system-consistency.md`
  — follow-up to US-035 (replaces the hand-rolled caret-positioning refinement
  from intake #19 with the proper Floating UI implementation).
- `docs/product/boards-and-cards.md` / `notifications.md` — mentions (no contract
  change; presentation + interaction only).

## Acceptance Criteria

- Typing `@` opens a caret-anchored listbox; it flips/shifts to stay in view.
- Full keyboard flow works (Arrow/Enter/Tab/Escape) with the textarea focused.
- ARIA: `role="listbox"`/`role="option"`, `aria-selected`,
  `aria-activedescendant`, `aria-expanded` are present and correct.
- Mouse click selects without losing textarea focus.
- Caret math extracted to a reusable `lib/caret-coordinates.ts`; positioning +
  interaction extracted to a `useMentionAutocomplete` hook.
- `@floating-ui/react-dom` added as a **direct** dependency (was transitive via
  `radix-ui`).
- `npx tsc --noEmit` clean; `eslint` no new errors; verified in-browser desktop
  + ≤375px, including the flip-near-bottom case.

## Design Notes

- Commands/Queries/API/Tables: none (presentation + interaction only).
- UI surfaces: `components/boards/card-detail-sheet.tsx` (CommentComposer),
  new `lib/caret-coordinates.ts`, new
  `components/boards/use-mention-autocomplete.ts`.
- Positioning: Floating UI `useFloating` with a **virtual reference element**
  built from the caret rect (`getCaretCoordinates`), middleware
  `offset/flip/shift/size`, `whileElementsMounted: autoUpdate`; floating list
  rendered via `createPortal` to `document.body`, `strategy: "fixed"`.
- Replaces: the inline mirror-element fn + `mentionCoords` state + manual
  click-outside `useEffect` from US-035 / intake #19.

## Validation

`scripts/bin/harness-cli story update --id US-040 --unit 0 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | `lib/caret-coordinates.ts` is pure/testable (test optional this story). |
| Integration | n/a |
| E2E | n/a |
| Platform | Manual browser QA: open/flip/keyboard/mouse/focus at desktop + 375px. |
| Release | `tsc --noEmit` + `eslint` clean on changed files. |

## Harness Delta

None. Adds one direct dependency (`@floating-ui/react-dom`), already resolved
transitively.

## Evidence

Verified on the seeded demo board, card "Implement realtime card move broadcast"
(DOM-asserted via DevTools):

- **ARIA (closed):** textarea is `role="combobox"`, `aria-autocomplete="list"`,
  `aria-haspopup="listbox"`, `aria-expanded="false"`, no `aria-controls`/
  `aria-activedescendant`.
- **ARIA (open):** `aria-expanded="true"`, `aria-controls` → the listbox id,
  `aria-activedescendant` → the active `role="option"` (matches the option whose
  `aria-selected="true"`).
- **Positioning:** listbox is `portaledToBody: true`, `position: fixed`,
  caret-anchored (`left ≈ 137px` under the `@`, `27px` below the line).
- **Flip:** at a 380px-tall viewport with the composer near the bottom, the
  dropdown **flips above** (`dropdownBottom 244 ≤ textareaTop 245`), `size`
  middleware caps `max-height` to `~236px`, and it stays fully in-viewport.
- **Keyboard:** ArrowDown ×2 moves active 0→2 (`aria-activedescendant` +
  `aria-selected` track it); Enter inserts `@Pentest Tester 2 ` and closes the
  list; the textarea keeps focus and the caret lands after the inserted mention.
- **Mouse:** option `mousedown` is prevented, so clicking selects without
  blurring the textarea.
- `npx tsc --noEmit` clean; `eslint` 0 errors on the 3 changed/new files (the
  earlier `react-hooks/refs` false positive was cleared by destructuring the
  hook return); only pre-existing cover-image `<img>` warnings remain. No console
  errors/warnings on open.
- `@floating-ui/react-dom@^2.1.8` added to `package.json` dependencies.

Post-QA fixes (same story):

- **Click selection was dead** — the body-portaled list inherited Radix Dialog's
  `pointer-events:none` (set on `<body>` while the modal is open), so clicks fell
  through to the textarea (`elementFromPoint` returned the textarea; option
  computed `pointer-events:none`). Fixed by `pointer-events-auto` on the listbox;
  re-verified the option now hit-tests to itself.
- **Gap tuning** — `offset(4)` → `offset(7)` for a slightly larger gap between the
  caret line and the dropdown, per review.
