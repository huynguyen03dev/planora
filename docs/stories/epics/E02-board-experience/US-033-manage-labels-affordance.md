# US-033 Move board-label CRUD behind a "Manage labels" affordance

## Status

shipped — 2026-06-29 (manual browser QA, desktop + 375px). Intake #23 (normal).
Child of IN-02 Theme C.

## Lane

normal

## Product Contract

Full board-label administration (rename, recolor, delete, create) no longer lives
inline in **every** card dialog. The card dialog's Labels section keeps only the
card-level concern — **attach / detach** — while the board-wide CRUD moves behind
a **"Manage labels"** button that opens a dedicated dialog.

After this story, the card dialog Labels section shows:

- the attached-label chips (each with a `×` to detach), and
- an **"Attach a label"** On/Off toggle list (attach/detach against the board's
  labels) — **without** per-row Edit/Delete and **without** the inline "New
  label" creator.

The **"Manage labels"** dialog owns CRUD: each board label with Edit/Delete, the
name + colour editor, and "New label". Edits there apply everywhere the board's
labels are used (the labels are shared board-level records, not per-card copies).

This is presentation / information-architecture only: it reuses the existing
label Server Actions (`addCardLabelAction`, `removeCardLabelAction`,
`createLabelAction`, `updateLabelAction`, `deleteLabelAction`) — **no new action,
schema, or contract change**, no change to how labels are stored or scoped.

In scope (this story):

- Split `card-labels-section.tsx`: inline section keeps attach/detach; a new
  `ManageLabelsDialog` (nested shadcn `Dialog`) holds the CRUD list + `LabelEditor`
  + "New label".
- Remove the per-row Edit/Delete buttons and the inline "New label" creator from
  the card dialog's inline label list.

Deliberately **out of scope**:

- Any change to label data ownership/scoping or the label Server Actions.
- Tokenizing label colours / contrast work → that is **US-036** (Theme D).

## Relevant Product Docs

- `docs/stories/initiatives/IN-02-board-ux-polish-and-design-system-consistency.md`
  — Theme C. US-033 row ("Card dialog keeps attach/detach; CRUD moves out").
  Must keep the responsive board (US-021) reflow and the US-031/US-032 dialog work
  intact.
- `docs/product/boards-and-cards.md` — labels surfaces. **No contract change** —
  where the CRUD UI lives is not a documented contract; attach/detach and the
  label records are unchanged.

## Acceptance Criteria

- The card dialog's inline Labels section has **no** per-row Edit/Delete buttons
  and **no** inline "New label" creator; it shows attached chips (with detach `×`)
  and an On/Off attach/detach list.
- A **"Manage labels"** button in the Labels header opens a dialog containing the
  full CRUD: every board label with Edit + Delete, a name/colour editor, and a
  "New label" creator.
- Attach/detach from the inline list still works (toggling a label On adds its
  chip; toggling Off / clicking the chip `×` removes it).
- Edit/Delete/Create still work from the Manage labels dialog (reuse the existing
  actions); after a CRUD change the inline list reflects it (server re-render).
- The viewer (`canEdit === false`) sees attached chips read-only and **no**
  "Manage labels" button (the header shows "Visible to all members").
- No visual or behavioral regression on the seeded demo board, verified
  in-browser at desktop and mobile (≤375px); the dialog still reflows
  single-column on mobile.
- `npx tsc --noEmit` clean (app code); `eslint` no new errors on the changed file.

## Design Notes

- Commands / Queries / API / Tables: none new — reuses the five existing label
  Server Actions.
- `ManageLabelsDialog` is a nested Radix `Dialog` (the card detail sheet is itself
  a `Dialog`); Radix supports nesting and returns focus to the "Manage labels"
  trigger on close. It owns its own `useTransition` / error / `editingId` /
  `creating` state and resets them on close.
- UI surfaces: `components/boards/card-labels-section.tsx` (single file). The
  `LabelEditor` (name `Input` + `ColorPalette`) is unchanged and reused by the
  dialog.
- Attach/detach keeps its own `useTransition` + error in the inline section,
  independent of the dialog's CRUD transition.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-033 --unit 0 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — IA refactor, no new pure logic (IN-01 untested-component residual stands). |
| Integration | n/a — reuses existing, already-shipped Server Actions. |
| E2E | n/a |
| Platform | Manual browser QA at desktop + ≤375px on the seeded demo board. |
| Release | `tsc --noEmit` clean + `eslint` clean on the changed file. |

## Harness Delta

None.

## Evidence

Verified on the seeded demo board ("Product Roadmap"), card "Implement realtime
card move broadcast" (hot-reloaded dev server).

- **Inline section trimmed** — a11y tree shows the Labels header with a "Manage
  labels" button (`haspopup="dialog"`), the attached chips (Feature / Backend with
  "Remove" each), and an "ATTACH A LABEL" On/Off list (Bug Off, Feature On,
  Design Off, Backend On, Docs Off, Blocked Off). **No** per-row Edit/Delete and
  **no** inline "New label" remain in the card dialog.
- **CRUD moved to the dialog** — clicking "Manage labels" opens a nested
  "Manage board labels" dialog listing every board label with **Edit + Delete**
  and a **"New label"** button. Clicking Edit reveals the `LabelEditor`: a name
  input prefilled ("Bug"), the full `ColorPalette` (Blue/Green/Orange/Red/Purple/
  Pink/Gray/Teal), and Save/Cancel. Cancel closes the editor without changes.
  Screenshot `.ui-review/us033-01-manage-dialog.png`.
- **Attach/detach round-trip** — from the inline list, toggling "Bug Off" → "Bug
  On" added a "Bug" chip (with "Remove Bug"); toggling back → "Bug Off" removed
  it, restoring the seed state (Feature + Backend). Confirms attach/detach still
  works via the same actions.
- **Dialog focus/close** — Escape closes the nested dialog and returns focus to
  the "Manage labels" trigger; the card dialog stays open underneath.
- **Responsive (375px)** — the dialog reflows single-column; the "Manage labels"
  button sits in the Labels header, chips wrap below, no horizontal overflow.
  Screenshot `.ui-review/us033-02-mobile-375.png`.
- `npx tsc --noEmit` clean (app code; only the pre-existing untracked
  `scripts/perf-measure.ts` errors, untouched). `eslint` on
  `card-labels-section.tsx`: 0 errors, 0 warnings.
