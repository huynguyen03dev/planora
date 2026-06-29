# US-039 Date picker (Calendar + Popover) for the card due date

## Status

implemented — 2026-06-29 (manual QA). Theme D, IN-02. Intake #26. Spun off from
US-035 (which deferred the picker because it needed a new primitive + dep).

## Lane

normal — touches existing card-dialog behavior (existing-behavior), the card
due-date surface is part of a documented contract (public-contract), proof is
manual QA (weak-proof, IN-01 residual). No hard gate: the dueDate field,
`updateCardDueDateAction`, the Zod schema, and the `YYYY-MM-DD` wire format are
all unchanged — this swaps the input widget and adds two UI dependencies. Depends
on US-034 (the `Popover` primitive already exists).

## Product Contract

Editing a card's due date uses a shadcn `Calendar` in a `Popover` (a clickable
trigger showing the current date or "No due date") instead of the browser-native
`<input type="date">`. The picker reads and writes the **same** due date the
existing autosave path persists; an explicit "Clear due date" affordance removes
the date (the native control's clear was inconsistent across browsers). The
trigger and calendar are keyboard- and screen-reader-accessible and theme
correctly in light and dark mode.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — Cards / `updateCardDueDateAction`,
  `requireEstimateBeforeDone`. The dueDate **contract** is unchanged; only the
  edit widget changes.

## Acceptance Criteria

- The native `<input type="date">` in the card detail sheet is replaced by a
  `Popover` + `Calendar`; the trigger shows the formatted current date
  (`PPP`, e.g. "July 2nd, 2026") or "No due date" when unset.
- Selecting a day persists via the existing `updateCardDueDateAction` (autosave),
  closes the popover, and survives a reload.
- A "Clear due date" action (shown only when a date is set) clears it.
- Empty state: trigger reads "No due date" in muted foreground, no Clear button.
- The picker is timezone-safe: the day shown/selected equals the day the
  `YYYY-MM-DD` string names regardless of the viewer's timezone.
- Keyboard/AT: trigger is a `Button` with an accessible label
  ("Due date: …, change due date" / "Set due date"); calendar is `autoFocus`
  and arrow-key navigable (react-day-picker).
- Light + dark mode render correctly; no console errors; 64 unit tests stay green.

## Design Notes

- Commands: none new — reuses `updateCardDueDateAction` / the `saveDueDate`
  handler. Clear calls `saveDueDate("")` → the action's existing null branch.
- Queries: none.
- API: none. Zod `dueDate: z.coerce.date().nullable().optional()` unchanged.
- Tables: none.
- Domain rules: unchanged (auto-complete/reopen on isDone list move, reminder
  invalidation on date change — all in the action, untouched).
- UI surfaces: `components/boards/card-detail-sheet.tsx` — Popover+Calendar
  trigger; `components/ui/calendar.tsx` — new shadcn primitive (radix-vega style,
  Hugeicons chevrons, uses the existing `Button`). New deps: `react-day-picker`
  `^10.0.1`, `date-fns` `^4.4.0` (the picker + its formatting; US-034 had not
  installed them).
- Timezone: the wire format stays `YYYY-MM-DD`. `parseDateInputValue` builds a
  **local** `Date(y, m-1, d)` for the calendar's `selected`, and
  `toDueDateValue` formats the picked local date back with
  `format(date, "yyyy-MM-dd")` — so display and round-trip never drift by a day.

## Validation

`scripts/bin/harness-cli story update --id US-039 --unit 0 --integration 0 --e2e 0 --platform 1`

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — presentation; the date helpers are thin. Existing `apply-drop`/`board-store` suites (64) stay green. |
| Integration | n/a — reuses the existing due-date Server Action (already covered by its own behavior). |
| E2E | n/a — no harness. |
| Platform | Picker opens, pre-selects the current date, persists a selection across reload, clears, shows the empty state; light + dark; keyboard-focusable; no console errors. |
| Release | Manual QA on the seeded demo board (write round-trip then restored). |

## Harness Delta

None.

## Evidence

Verified on the seeded demo board ("Product Roadmap"), 2026-06-29, desktop.

- **Gate:** `tsc --noEmit` clean (excl. pre-existing untracked
  `scripts/perf-measure.ts`). `eslint` on changed files: 0 errors (only
  pre-existing `<img>` warnings; `calendar.tsx` clean). `npm run build`:
  **app compiled successfully in 16.3s** (the new primitive + react-day-picker
  compile) — the TS step fails only on the pre-existing untracked
  `scripts/perf-measure.ts`. Unit suite: **64 passed**.
- **Browser QA:**
  - Card with a due date ("Card detail sheet — spacing audit", Jul 2): trigger
    shows "July 2nd, 2026"; opening the popover renders the July 2026 grid (35
    day buttons) with **Jul 2 pre-selected** and a "Clear due date" footer.
  - Write round-trip: picked **Jul 15** → trigger → "July 15th, 2026", popover
    auto-closed; **reloaded** → still "July 15th, 2026" (persisted); restored to
    Jul 2 (demo data left as found).
  - Empty state ("Spike: offline-first card editing", no due date): trigger
    "No due date" in `text-muted-foreground`, aria-label "Set due date", **no
    Clear button**.
  - Dark mode: calendar popover, day grid, and trigger all theme correctly
    (today marked); no colour-only state.
  - No console errors/warnings across open / select / reload / theme toggle.
- Screenshots: `.ui-review/us039-01-calendar-open.png` (light, Jul 2 selected),
  `.ui-review/us039-02-calendar-dark.png` (dark, empty-state card).
