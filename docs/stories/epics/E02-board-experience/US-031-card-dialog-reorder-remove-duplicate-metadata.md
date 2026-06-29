# US-031 Reorder card dialog (Description under Title) + remove duplicate metadata

## Status

shipped — 2026-06-29 (manual browser QA, desktop + 375px). Intake #21 (normal).
Child of IN-02 Theme C.

## Lane

normal

## Product Contract

The card detail dialog's primary content reads top-to-bottom in priority order:
the **Description** sits directly under the **Title**, where editors expect it,
instead of being buried below cover/labels/checklists/priority/dates. The
read-only **"Card metadata"** block at the bottom — which merely re-displayed the
Estimate and Due date already shown by their editable controls — is removed, so
each field has exactly one surface in the dialog.

This is presentation-only: no field is added or removed, no Server Action
changes, no data-shape change. Behavior of every control (title/description
save, cover, labels, checklists, priority autosave, estimate/due-date save,
members, attachments, comments) is preserved.

In scope (this story):

- Move the Description `<section>` to render immediately after the Title
  `<section>` in the left column of `card-detail-sheet.tsx`.
- Remove the read-only "Card metadata" `<section>` (the `MetaBlock` pair for
  Estimate + Due date) and the now-unused `MetaBlock` component + `MetaBlockProps`
  type.

Deliberately **out of scope** (belongs to sibling stories — keep scope clean):

- The dead, disabled `ActionChip` "Add"/"Members" placeholders and unifying the
  three competing save models → **US-032**. They stay as-is here; the chips
  remain inside the Title section, so "Description directly under Title" holds at
  the section level.
- Moving full board-label CRUD behind a "Manage labels" affordance → **US-033**.

## Relevant Product Docs

- `docs/stories/initiatives/IN-02-board-ux-polish-and-design-system-consistency.md`
  — Theme C (dialog redesign). US-031 row. Must keep the responsive board
  (US-021) reflow intact.
- `docs/product/boards-and-cards.md` — card detail sheet surfaces. **No contract
  change** — section *order* is not a documented contract; the metadata block was
  redundant display, not a distinct field.

## Acceptance Criteria

- In the card dialog left column, the **Description** section renders directly
  after the **Title** section (before Cover, Labels, Checklists, Priority,
  Estimate/Due date, Members, Attachments).
- The bottom read-only "Card metadata" section no longer renders; Estimate and
  Due date appear **once** each (their editable controls only).
- The `MetaBlock` component and `MetaBlockProps` type are removed (no dead code).
- No field, control, or Server Action behavior changes; save/reset, priority
  autosave, estimate/due-date save, cover, labels, checklists, members,
  attachments, and comments all still work.
- No visual or behavioral regression on the seeded demo board, verified
  in-browser at desktop and mobile (≤375px); the dialog still reflows
  single-column on mobile.
- `npx tsc --noEmit` clean (app code); `eslint` no new errors on the changed file.

## Design Notes

- Commands / Queries / API / Tables: none — presentation-only.
- Domain rules: none.
- UI surfaces: `components/boards/card-detail-sheet.tsx` (single file).
- `draftDueDate` / `card.estimateHours` remain used by the editable Estimate and
  Due-date controls after the `MetaBlock` section is removed — no orphaned state.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-031 --unit 0 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — presentational reorder, no new logic (IN-01 untested-component residual stands). |
| Integration | n/a |
| E2E | n/a |
| Platform | Manual browser QA at desktop + ≤375px on the seeded demo board. |
| Release | `tsc --noEmit` clean + `eslint` clean on the changed file. |

## Harness Delta

None.

## Evidence

Verified on the seeded demo board ("Product Roadmap"), card "Implement realtime
card move broadcast" (hot-reloaded dev server).

- **New section order (a11y tree, desktop)** — left column reads
  Title → *(dead Add/Members chips, US-032)* → **Description** → Cover → Labels →
  Board labels → Checklists → Priority → Estimate → Due date → Members →
  Attachments → Save/Reset. The Description heading + textarea now sit directly
  below the Title input, where before they rendered 7th (after the date controls).
  Screenshot `.ui-review/us031-01-desktop-order.png`.
- **Duplicate metadata removed** — no "Card metadata" heading anywhere in the
  dialog; Estimate and Due date each appear **exactly once** (their editable
  controls — `combobox "Estimate"` and the `Date "Due date"` input). The
  bottom read-only `MetaBlock` pair is gone; the `MetaBlock` component +
  `MetaBlockProps` type were deleted (0 references remain).
- **No behavior change** — title/description Save+Reset, priority autosave,
  Save estimate / Save due date, cover upload, labels, checklists, member
  assign/remove, attachments, and the comment composer all render and operate as
  before; `draftDueDate`/`card.estimateHours` still drive the editable controls.
- **Responsive (375px)** — the dialog reflows single-column; Title → Description
  order holds, the comment region stacks below as its own scroll area (the
  pre-existing US-021/US-035 mobile structure, unchanged), no horizontal
  overflow. Screenshot `.ui-review/us031-02-mobile-375.png`.
- `npx tsc --noEmit` clean (app code; only the pre-existing untracked
  `scripts/perf-measure.ts` errors, untouched). `eslint` on
  `card-detail-sheet.tsx`: 0 errors, only the 3 pre-existing cover-image `<img>`
  warnings.
