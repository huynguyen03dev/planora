# IN-02 Board UX Polish & Design-System Consistency

## Status

in progress — opened 2026-06-26. **Shipped: US-028, US-029** (Theme A) **·
US-030** (Theme B — complete, 2026-06-29) **· US-031, US-032, US-033** (Theme C —
complete, 2026-06-29) **· US-034, US-035, US-036, US-039, US-040** (Theme D — complete,
2026-06-29) — all manual QA. Remaining: US-037/US-038 (Theme E) — reservations
awaiting individual intake.

## Type

Initiative (umbrella). Decomposes into the candidate child stories below; each
child re-enters `docs/FEATURE_INTAKE.md` on its own and gets its own lane.

## Lane (aggregate)

normal — the heaviest flags are **public contract / existing behavior** (the
card-face metadata change rewrites a documented rendering contract) and **weak
proof** (per IN-01 closure, all React components remain unit/E2E untested; this
UI work inherits manual-QA-only coverage). No hard gate fires — no auth,
authorization, data migration, external-provider, or validation-weakening change
is in scope. Individual children range from tiny (icon fix, a11y attribute) to
normal (card-face contract, dialog redesign, primitive migration).

## Problem Statement

A frontend UI/UX review on 2026-06-26 (against a freshly seeded demo board —
`scripts/seed-demo-board.ts`, 5 lists / 17 cards exercising every card surface)
found the board *detail* page is genuinely strong: gradient header, colored
label chips, priority chips, keyboard-accessible drag handles, and a board that
already reflows on mobile. But three consistency/UX gaps undercut that quality,
and they share one root cause — **the UI does not surface the data the schema
already stores, and the design system is applied unevenly.**

1. **Card faces are information-poor.** A card renders *only* labels + priority.
   `dueDate`, assigned members, checklist progress, and comment counts all exist
   in the data but never appear on the card face (verified in the a11y tree and
   in `components/boards/board-content.tsx:24-39`, which only passes
   `coverImage|priority|labels` down). An overdue card gives **zero** visual
   warning on the board. This is the same "schema writes the UI does not cash"
   pattern IN-01 set out to retire — here for read-surfaces rather than features.

2. **The card detail dialog has scrambled information architecture.** Verified
   section order: Title → *(disabled "Add"/"Members" placeholder chips)* → Cover
   → Labels → full board-label admin (On/Off/Edit/Delete/New label) → Checklists
   → Priority → Estimate → Due date → **Description** → Members → Attachments →
   **Card metadata (read-only)**. Concretely:
   - Description is rendered **8th**, buried below checklists/priority/dates; it
     belongs directly under the title.
   - Estimate and Due date appear **twice** — editable controls mid-dialog *and*
     a read-only "Card metadata" block at the bottom showing the same values
     (`MetaBlock`, `components/boards/card-detail-sheet.tsx:~872`).
   - **Three competing save models** coexist: per-field "Save estimate" /
     "Save due date" buttons, an autosaving Priority `<select>`, and a bottom
     "Save changes / Reset" for title+description.
   - **Dead UI:** disabled "Add" / "Members" placeholder chips (`ActionChip`,
     `card-detail-sheet.tsx:~852`) that do nothing.
   - Full board-label management (rename/recolor/delete every label) is embedded
     in **every** card dialog rather than behind a "Manage labels" affordance.

3. **The design system is applied inconsistently.** Hand-rolled UI stands in for
   shadcn primitives, several primitives are missing, and raw color literals
   bypass the token system:
   - Hand-rolled `<button>` create-board tiles
     (`components/boards/workspace-boards-view.tsx:69`,
     `workspace-section.tsx:51`, `workspace-item.tsx`) instead of `Button`.
   - Raw `<textarea>` with duplicated inline classes
     (`card-detail-sheet.tsx:664,960`) — no `components/ui/textarea.tsx` exists.
   - Hand-built `@mention` dropdown (`card-detail-sheet.tsx:987`) — no
     `popover` primitive exists.
   - Native `<input type="date">` for the due date — no shadcn date picker.
   - Members listed as full-width `Name (email)` text rows
     (`card-detail-sheet.tsx:738`) instead of an avatar list.
   - Hardcoded hex priority colors (`list-card-item.tsx:32-40`, e.g.
     `#EF44441A`/`#B91C1C`) and `border-white/40` / `bg-white/15` opacity
     literals (`board-header.tsx`) instead of CSS tokens — breaks theming and
     likely fails AA contrast.
   - The board-header **favorite button renders a literal `*` glyph** with no SVG
     (`board-header.tsx:~174`; confirmed in DOM: `textContent "*"`, no `<svg>`)
     while the boards overview uses a proper star icon for the same action.

4. **Accessibility residue.** The card `DialogContent` is missing a
   `Description`/`aria-describedby` — a React console warning fires on every
   open. Avatar initials are bare `<div>`s without `role="img"`/`aria-label`.

## Goal / Definition of Done

Every piece of card data the schema stores has a coherent, consistent surface,
and the board UI reads as one design system rather than several. "Done" for the
initiative = Themes A + B + C + D shipped with manual-QA proof recorded in the
story packets and `docs/TEST_MATRIX.md`; Theme E (boards-overview polish)
shipped or explicitly deferred via a decision. No new shadcn-substitute UI is
hand-rolled when a primitive exists or can be added.

## Non-Goals

- Net-new card features (no new fields, no new card actions, no schema change).
  This is read-surface + consistency work only.
- Replacing `@hello-pangea/dnd`, the Server-Action write model, or the board
  data-fetch architecture (the board-page payload may *grow* fields, not change
  shape philosophy).
- An RTL / component test harness. The untested-component residual from IN-01
  stands; closing it is its own story, not a prerequisite here (but see Risk).
- A full visual redesign / rebrand. Tokens get consolidated, not re-chosen.

## Risk Classification (intake)

Risk flags (aggregate across children):

- Public contracts — card-face rendering contract changes
  (`docs/product/boards-and-cards.md` currently states "Members render in the
  detail sheet only, not the card face"); the board-page payload gains fields.
- Existing behavior — the card detail dialog and card rendering are reworked.
- Weak proof — React components are unit/E2E untested (IN-01 residual); proof is
  manual QA until a component harness exists.
- Cross-platform — card-dialog reorder and card-face badges must hold on the
  already-shipped responsive board (US-021).

Hard gates: **none.** No auth, authorization, data migration/new table,
external-provider, or validation-weakening change. If a child grows one (e.g. a
card-face change that needs a new persisted field), that child escalates to
high-risk on its own intake.

## Workstreams → Candidate Child Stories

IDs are reservations, not commitments — renumber freely when each is created.
Next free id at authoring time is **US-028**.

### Theme A — Correctness quick wins (P0, tiny)

| ID | Candidate story | Lane (est.) | Notes |
| --- | --- | --- | --- |
| US-028 | Favorite button: replace literal `*` glyph with a Hugeicons star (filled/outline for on/off), matching the boards-overview star | tiny | ✅ **shipped 2026-06-26.** `board-header.tsx`. The `*` button was also a no-op — wired it to the existing `toggleBoardStarAction` (reflects real `BoardStar` state, `aria-pressed`, propagates to the overview Starred section). |
| US-029 | Add `DialogDescription`/`aria-describedby` to the card detail `DialogContent` | tiny | ✅ **shipped 2026-06-26.** `card-detail-sheet.tsx`. Promoted the existing plain `<p>` blurb to the `DialogDescription` primitive (same text/styling) so Radix wires `aria-describedby` automatically. Verified in-browser: `Missing Description` warning gone; `[role=dialog]` now carries `aria-describedby` → `data-slot="dialog-description"`. |

### Theme B — Card information density (P1, normal)

| ID | Candidate story | Lane (est.) | Notes |
| --- | --- | --- | --- |
| US-030 | Surface a card-face metadata row: due-date badge (with overdue/today/soon states), member avatars, checklist progress (e.g. `2/4`), comment count | high-risk | ✅ **shipped 2026-06-29.** `lib/list.ts`, `list-card-item.tsx` (+ type threading through `page.tsx`/`board-content.tsx`/`board-store.ts`/`list-column.tsx`). Card face now shows due badge (overdue/today/soon/done), capped assignee avatars (+N), checklist `done/total`, comment count — counts aggregated server-side. **Escalated to high-risk:** the contract change (`boards-and-cards.md`) + an **additive FK-index migration** (`comment.cardId`, `checklist.cardId`, `checklistItem.checklistId`) the new aggregates need (decision **0011**; human confirmed full scope + migration at intake #24). No new field/action/auth. Manual QA desktop + 375px; 64 unit tests green. Story folder: `…/US-030-card-face-metadata/`. |

### Theme C — Card detail dialog redesign (P1, normal)

| ID | Candidate story | Lane (est.) | Notes |
| --- | --- | --- | --- |
| US-031 | Reorder the card dialog (Description directly under Title) and remove the duplicate read-only "Card metadata" block | normal | ✅ **shipped 2026-06-29.** `card-detail-sheet.tsx`. Description moved directly under Title; read-only `MetaBlock` section + the `MetaBlock` component/type deleted (Estimate/Due date now show once via their editable controls). Presentation-only — no field/action/data change. Dead `ActionChip`s left for US-032. Manual QA desktop + 375px (a11y-tree + screenshots). Story: `…/US-031-card-dialog-reorder-remove-duplicate-metadata.md`. |
| US-032 | Unify the dialog save model (autosave-on-blur or a single explicit save) and remove the dead "Add"/"Members" `ActionChip` placeholders | normal | ✅ **shipped 2026-06-29.** `card-detail-sheet.tsx`. Chose **autosave**: title/description persist on blur, estimate/due-date on change (matching the already-autosaving Priority). Removed the bottom "Save changes/Reset" footer, the per-field "Save estimate"/"Save due date" buttons, and the dead `ActionChip`s (+ component/type). Added a "Saving…" polite live region. Reuses the existing per-field Server Actions — no new action/schema/contract change. Manual QA desktop + 375px (autosave round-trip verified via activity log). Story: `…/US-032-unify-card-dialog-save-model.md`. |
| US-033 | Move full board-label administration behind a "Manage labels" affordance instead of inlining it in every card | normal | ✅ **shipped 2026-06-29.** `card-labels-section.tsx`. Card dialog keeps attach/detach (chips + On/Off list); full CRUD (Edit/Delete + `LabelEditor` + New label) moved into a nested "Manage labels" `Dialog`. Reuses the existing label Server Actions — no new action/schema/contract change. Manual QA desktop + 375px (attach/detach round-trip + Edit editor verified). Story: `…/US-033-manage-labels-affordance.md`. |

### Theme D — Design-system consistency (P1, normal)

| ID | Candidate story | Lane (est.) | Notes |
| --- | --- | --- | --- |
| US-034 | Add missing shadcn primitives (`textarea`, `popover`, `badge`, `avatar`, `progress`) via the shadcn CLI | normal | ✅ **shipped 2026-06-26.** Installed all 5 via `npx shadcn add` (radix-vega style); all import the already-installed unified `radix-ui` package — no new deps. Additive only; **adoption is US-035**. tsc/eslint clean; build compiles the primitives (global build TS pass blocked only by the unrelated pre-existing untracked `scripts/perf-measure.ts`). Story: `docs/stories/epics/E02-board-experience/US-034-add-shadcn-primitives.md`. |
| US-035 | Replace hand-rolled UI with primitives: create-board buttons → `Button`; raw `<textarea>` → `Textarea`; member/comment/activity/mention rows → `Avatar` list | normal | ✅ **shipped 2026-06-26.** `card-detail-sheet.tsx`, `workspace-boards-view.tsx`, `workspace-section.tsx`. **Two listed swaps deliberately not done:** `@mention`→`Popover` (Radix Popover steals focus → breaks inline caret autocomplete; adopted `Avatar` inside the existing custom dropdown instead) and native date input→date picker (**deferred to US-039** — needs a `Calendar` primitive + `react-day-picker` dep US-034 didn't install). `workspace-item.tsx:32` was a sidebar disclosure toggle (initiative mislabel), left as-is. Manual QA desktop+375px. Story: `…/US-035-adopt-shadcn-primitives.md`. |
| US-039 | Date picker: add `Calendar` primitive (+ `react-day-picker`) and replace the native `<input type="date">` in the card dialog | normal | ✅ **shipped 2026-06-29.** `card-detail-sheet.tsx` + new `components/ui/calendar.tsx`. Native `<input type="date">` → shadcn `Calendar` in a `Popover` (trigger shows the formatted date or "No due date"); added explicit "Clear due date". New deps `react-day-picker ^10.0.1` + `date-fns ^4.4.0`. Reuses `updateCardDueDateAction`/`saveDueDate` — **`YYYY-MM-DD` wire format, schema, action all unchanged**; timezone-safe local parse/format. Manual QA: write round-trip persisted across reload, empty state, light + dark, no console errors; 64 unit tests green; build compiles. Intake #26. Story: `…/US-039-date-picker.md`. |
| US-040 | Production-grade `@mention` autocomplete: Floating UI positioning (flip/shift/auto-update) + full keyboard a11y + listbox ARIA, extracted to a reusable hook + caret util | normal | ✅ **shipped 2026-06-27.** Replaces the US-035/intake-#19 hand-rolled caret positioning. New `lib/caret-coordinates.ts` + `components/boards/use-mention-autocomplete.ts`; added `@floating-ui/react-dom` as a direct dep (was transitive via `radix-ui`); portaled to `body` (dialog has a `transform`). Keyboard (Arrow/Enter/Tab/Escape) + `aria-activedescendant`, no focus steal, flips above near viewport bottom. Manual QA. Story: `…/US-040-mention-autocomplete-floating-ui.md`. |
| US-036 | Tokenize raw color literals: priority hex (`list-card-item.tsx:32-40`) and `border-white/*` / `bg-white/*` opacity literals (`board-header.tsx`) → CSS tokens; verify AA contrast | normal | ✅ **shipped 2026-06-29.** `list-card-item.tsx`. `PRIORITY_CONFIG` raw hex + inline `style` → Tailwind palette utilities with `dark:` variants (`bg-red-500/10 text-red-700 dark:text-red-400`, …) — fixes dark-mode contrast (old dark `-700` fg was near-invisible on a dark card); light mode unchanged. **`board-header.tsx` white overlays deliberately kept:** they sit on the always-dark colour gradient (`boardTheme.header`, theme-independent), so white-on-colour is the correct AA-passing on-colour pattern — tokenizing them would flip with the theme and regress (rationale in the story). No field/action/schema change. Manual QA light + dark; 64 unit tests green. Intake #25. Story: `…/US-036-tokenize-priority-colors.md`. |

### Theme E — Boards-overview polish (P2, tiny/normal)

| ID | Candidate story | Lane (est.) | Notes |
| --- | --- | --- | --- |
| US-037 | Board cards show info density (list/card count, last-updated, member avatars) instead of empty color blocks | normal | Low information density today. |
| US-038 | Boards grid uses the full row width (cards cling to a narrow left column at ≥1440px) | tiny | Layout-only. |

## Recommended Sequencing

1. **Theme A first** — two tiny, high-visibility correctness fixes (broken `*`
   icon, console a11y warning); cheap and ship immediately.
2. **Theme D core (US-034)** next — adding the missing primitives unblocks
   Themes C and D and stops new hand-rolled UI from accruing.
3. **Theme C** — the dialog redesign is the biggest felt-quality jump and is
   self-contained once primitives exist.
4. **Theme B** — card-face density is the highest-impact UX gain but carries the
   one contract change + a DnD perf watch, so do it deliberately after the
   surrounding surfaces are clean.
5. **Theme E** last — boards-overview polish is real but lowest-stakes.

## Relevant Product Docs

- `docs/product/boards-and-cards.md` — **Card metadata** table (the "Members
  render in the detail sheet only" line changes with US-030); Cards section;
  Responsive/mobile (US-021) must keep holding.
- `docs/TEST_MATRIX.md` — each shipped child records its manual-QA proof row;
  none of these can claim unit/E2E until a component harness exists.

## Decomposition Guidance (for the next agent)

- Pull **one** candidate row, run it through `docs/FEATURE_INTAKE.md`, and create
  its story artifact from `docs/templates/story.md` (tiny/normal) — none here is
  high-risk unless it grows a persisted field or weakens validation.
- US-030 changes a documented product contract: update the **Card metadata**
  table in `docs/product/boards-and-cards.md` in the same story, not as a
  follow-up.
- US-035/US-036 depend on US-034 (primitives must exist first); note the
  dependency in each child's story.
- Proof is manual browser QA (Chrome DevTools MCP) with DOM-verified values +
  screenshots, per the IN-01 precedent — record it in the story packet.
- `scripts/seed-demo-board.ts` reproduces the review's demo board for QA.

## Harness Delta

- None expected. Reuses the `docs/stories/initiatives/` location IN-01
  introduced; proposes child stories under the existing `E02-board-experience`
  (board/card UI) epic — create no new epic unless a child clearly needs one.

## Evidence

Initiative-level proof is the union of its children's proofs. The review that
sourced this initiative: screenshots in `.ui-review/` (2026-06-26), DOM
verification of the `*` favorite button and the missing card-face metadata, and
the `DialogContent` console warning, all captured against the seeded demo board.
