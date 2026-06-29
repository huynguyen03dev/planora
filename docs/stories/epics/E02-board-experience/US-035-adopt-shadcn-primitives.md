# US-035 Adopt shadcn primitives in board/card surfaces

## Status

shipped — 2026-06-26 (manual browser QA, desktop + 375px). Date-picker swap
deferred to a follow-up; `@mention`→Popover intentionally not done (see contract).

## Lane

normal

## Product Contract

Hand-rolled UI that duplicates a shadcn primitive is replaced by that primitive,
so the board/card surfaces read as one design system. Behavior and the visible
information are preserved; only the underlying components change. Depends on
US-034 (primitives installed).

In scope (this story):

- Create-board tiles (`workspace-boards-view.tsx`, `workspace-section.tsx`) →
  `Button` (dashed-tile appearance preserved via className; gains the standard
  focus-visible ring + disabled handling).
- Raw `<textarea>` (card description + comment composer in
  `card-detail-sheet.tsx`) → `Textarea` primitive.
- Card member surfaces (assignee rows + "Add members" rows + the `@mention`
  dropdown items) render the `Avatar` primitive instead of hand-rolled
  `<img>`/initials `<div>`s.

Deliberately **out of scope** (with rationale — see Design Notes):

- `@mention` dropdown → `Popover`: **not converted.** Radix `Popover` moves focus
  into its content on open, which breaks an inline caret-anchored autocomplete
  (focus must stay in the textarea). The existing custom dropdown is the correct
  pattern; only its avatar is upgraded to the `Avatar` primitive.
- Native `<input type="date">` → date picker: **deferred to a follow-up story.**
  A shadcn date picker needs a `Calendar` primitive + the `react-day-picker`
  dependency, which US-034 did not install; `<input type="date">` is already
  accessible. Tracked as a new candidate (US-036-adjacent / its own story).

## Relevant Product Docs

- `docs/stories/initiatives/IN-02-board-ux-polish-and-design-system-consistency.md`
  — Theme D adoption. Depends on US-034. Must keep the responsive board (US-021).
- `docs/product/boards-and-cards.md` — card detail sheet surfaces (no contract
  change; presentation only).

## Acceptance Criteria

- No raw `<textarea>` remains in `card-detail-sheet.tsx`; both use `Textarea`.
- Create-board tiles are `Button`s; the dashed-tile look and create-modal trigger
  behavior are unchanged.
- Assignee rows, "Add members" rows, and `@mention` items show an `Avatar`
  (image when present, initials fallback otherwise).
- No visual or behavioral regression on the seeded demo board, verified in-browser
  at desktop and mobile (≤375px) widths; mention autocomplete still types/inserts
  correctly and keeps textarea focus.
- `npx tsc --noEmit` clean (app code); `eslint` no new errors on changed files.

## Design Notes

- Commands: none new (reuses existing Server Actions).
- Queries: none.
- API: none.
- Tables: none.
- Domain rules: none.
- UI surfaces: `workspace-boards-view.tsx`, `workspace-section.tsx`,
  `card-detail-sheet.tsx`.
- `workspace-item.tsx:32` `<button>` is a sidebar disclosure toggle, **not** a
  create-board button (the initiative mislabeled it) — left as-is / out of scope.
- Mention dropdown stays custom by design (focus-management constraint above).

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-035 --unit 0 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — presentational swap, no new logic (IN-01 untested-component residual stands). |
| Integration | n/a |
| E2E | n/a |
| Platform | Manual browser QA at desktop + ≤375px on the seeded demo board. |
| Release | `tsc --noEmit` clean + `eslint` clean on changed files. |

## Harness Delta

None. Spins off one follow-up candidate (date-picker primitive + adoption).

## Evidence

Verified on the seeded demo board ("Product Roadmap"), card "Implement realtime
card move broadcast":

- **Textareas** — description + comment composer both render the `Textarea`
  primitive; no raw `<textarea>` left in `card-detail-sheet.tsx`.
- **Avatars** — assignee rows (RB/PP), "Add members" rows (PT/QR/QS), the
  `@mention` dropdown items, and the comment + activity items all render the
  `Avatar` primitive (bordered initials fallback; image when present).
- **`@mention`** — typing `@` opens the dropdown with all members + avatars and
  the textarea **keeps focus** (`document.activeElement === textarea`);
  selecting inserts correctly (`"…@Perf Profiler "`). Confirms the deliberate
  decision to keep it custom rather than use focus-stealing Popover.
- **`@mention` positioning (intake #19 refinement)** — the dropdown is now
  **caret-anchored**: it renders directly under the typed `@` (computed via a
  hidden mirror element, since textareas expose no caret-coords API) at a fixed
  `w-56`, instead of the previous full-width box below the whole textarea.
  Verified: for `"Thanks for the detailed writeup @"` the dropdown lands at
  `left ≈ 147px / top ≈ 23px` from the textarea origin — directly beneath the
  `@` — and clamps to stay within the textarea width.
- **Create-board tiles** — `Button` primitives; dashed-tile look unchanged on the
  boards overview; create-modal trigger still works; now keyboard-focusable with
  the standard focus-visible ring.
- **Responsive** — at 375px the card dialog reflows single-column; the `Textarea`
  is full-width and member rows truncate name/email without overflow.
- **No console warnings** on card open.
- `npx tsc --noEmit` clean (app code); `eslint` on the 3 changed files: 0 errors,
  only the pre-existing cover-image `<img>` warnings (one fewer than before — the
  mention `<img>` is gone).

