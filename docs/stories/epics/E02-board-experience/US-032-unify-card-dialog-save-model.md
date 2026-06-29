# US-032 Unify card dialog save model (autosave) + remove dead ActionChip placeholders

## Status

shipped — 2026-06-29 (manual browser QA, desktop + 375px). Intake #22 (normal).
Child of IN-02 Theme C.

## Lane

normal

## Product Contract

The card detail dialog has **one** save model: every field autosaves. The three
competing save surfaces that previously coexisted — a bottom "Save changes /
Reset" pair for title+description, a per-field "Save estimate" button, and a
per-field "Save due date" button — are gone, alongside an autosaving Priority
`<select>` that already behaved this way. After this story:

- **Title** and **Description** persist **on blur** (focus leaves the field).
- **Estimate** and **Due date** persist **on change**, matching the **Priority**
  control that already autosaved.
- A subtle "Saving…" status (polite live region) replaces the explicit buttons so
  feedback is preserved for sighted and screen-reader users.

The dead, disabled "Add" / "Members" `ActionChip` placeholders under the Title —
which did nothing — are removed (the `ActionChip` component + `ActionChipProps`
type with them).

This is interaction-only: it reuses the existing per-field Server Actions
(`updateCardDetailsAction`, `updateCardEstimateAction`, `updateCardDueDateAction`,
`updateCardPriorityAction`) — **no new action, no schema change, no contract
change**. Title remains required: blurring an empty title reverts to the last
persisted value rather than leaving the card unsaveable.

In scope (this story):

- Remove the bottom "Save changes / Reset" footer; title+description autosave on
  blur via a single `saveDetails(title, description)` helper.
- Remove the "Save estimate" and "Save due date" buttons; both autosave on change
  via `saveEstimate` / `saveDueDate` helpers.
- Remove the dead `ActionChip` "Add"/"Members" placeholders and the now-unused
  `ActionChip` component + `ActionChipProps` type.
- Add a "Saving…" polite live region in place of the explicit save buttons.

Deliberately **out of scope** (sibling story — keep scope clean):

- Moving full board-label CRUD behind a "Manage labels" affordance → **US-033**.
  The inline board-label admin stays as-is here.

## Relevant Product Docs

- `docs/stories/initiatives/IN-02-board-ux-polish-and-design-system-consistency.md`
  — Theme C (dialog redesign). US-032 row. Must keep the responsive board
  (US-021) reflow intact and the US-031 Description-under-Title order.
- `docs/product/boards-and-cards.md` — card detail sheet surfaces. **No contract
  change** — the *mechanism* by which a field is saved is not a documented
  contract; every field still persists through its existing Server Action.

## Acceptance Criteria

- The card dialog has no "Save changes", "Reset", "Save estimate", or "Save due
  date" buttons; no dead "Add"/"Members" `ActionChip` placeholders remain.
- Editing the **Title** and blurring persists it (reload shows the new value,
  activity log records "updated this card"); blurring an **empty** title reverts
  to the previous title and shows a brief error.
- Editing the **Description** and blurring persists it.
- Changing **Estimate** or **Due date** persists immediately (no extra click),
  matching Priority's existing behavior.
- A "Saving…" indicator appears while a write is in flight (polite live region).
- The `ActionChip` component and `ActionChipProps` type are removed (no dead
  code); `cn` and the other helpers remain used.
- No visual or behavioral regression on the seeded demo board, verified
  in-browser at desktop and mobile (≤375px); the dialog still reflows
  single-column on mobile and keeps the US-031 Description-under-Title order.
- `npx tsc --noEmit` clean (app code); `eslint` no new errors on the changed file.

## Design Notes

- Commands / Queries / API / Tables: none new — reuses the four existing per-field
  Server Actions.
- Save model chosen: **autosave** (over "single explicit save"). Rationale: it
  reuses the existing per-field actions with no new combined action or contract
  change, matches the Priority control that already autosaved, and is the
  standard kanban (Trello/Planka) pattern. A single-explicit-save model would
  have meant either a new combined action or orchestrating four actions per click
  and would have *removed* Priority's existing instant behavior.
- UI surfaces: `components/boards/card-detail-sheet.tsx` (single file).
- Title-required invariant preserved: empty-title blur reverts + surfaces a
  non-blocking error rather than persisting an invalid empty title.
- `isPending` guards each autosave helper to avoid overlapping writes; inputs are
  `disabled` while pending.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-032 --unit 0 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — interaction rewiring, no new pure logic (IN-01 untested-component residual stands). |
| Integration | n/a — reuses existing, already-shipped Server Actions. |
| E2E | n/a |
| Platform | Manual browser QA at desktop + ≤375px on the seeded demo board. |
| Release | `tsc --noEmit` clean + `eslint` clean on the changed file. |

## Harness Delta

None.

## Evidence

Verified on the seeded demo board ("Product Roadmap"), card "Implement realtime
card move broadcast" (hot-reloaded dev server).

- **Save buttons gone** — a11y tree shows no "Save changes", "Reset", "Save
  estimate", or "Save due date" buttons anywhere in the dialog. The Estimate
  combobox and Due-date input have no adjacent save control.
- **Dead chips gone** — nothing renders between the Title textbox and the
  Description heading; no disabled "Add"/"Members" buttons. The `ActionChip`
  component + `ActionChipProps` type were deleted (0 references remain).
- **Autosave-on-blur works (title)** — edited the Title to
  "…broadcast (autosave check)", blurred by focusing the Description, then
  **reloaded**: the new title persisted and a fresh **"updated this card"**
  activity entry appeared (Jun 29). Reverted the title the same way (blur → second
  "updated this card" entry), confirming the round-trip. Screenshot
  `.ui-review/us032-01-desktop-autosave.png`.
- **Autosave indicator** — a polite live region (`aria-live="polite"`) renders
  "Saving…" while a write is in flight, replacing the removed buttons.
- **No behavior change to other controls** — Priority (already autosaving),
  labels, checklists, cover, members, attachments, and the comment composer all
  render and operate as before; Estimate/Due-date now persist on change via the
  same actions the old buttons called.
- **Responsive (375px)** — the dialog reflows single-column; Title → Description
  order (US-031) holds, the comment region stacks below as its own scroll area, no
  horizontal overflow. Screenshot `.ui-review/us032-02-mobile-375.png`.
- `npx tsc --noEmit` clean (app code; only the pre-existing untracked
  `scripts/perf-measure.ts` errors, untouched). `eslint` on
  `card-detail-sheet.tsx`: 0 errors, only the 3 pre-existing cover-image `<img>`
  warnings.
