# US-052 Card detail reads as a true Notion document (structure pass)

## Status

done — implemented 2026-06-30 on `feat/us-052-card-detail-document`; manual QA
passed (light + dark, desktop + 375px, DOM-verified typography). The two-column
~1120px layout with boxed sub-cards is retired: the card detail is now a single
~720px reading column of hairline-divided sections (no boxed sub-cards), 32px
padding, title at the `card-title` token, and a 16px/1.55 document body. See
Evidence.

## Lane

normal — restructures the already-shipped card-detail modal. Flags: existing
behavior, weak proof (manual QA), cross-platform (must hold on the responsive
board, US-021). **No hard gate** — no schema, auth, Server Action, external
system, or weakened validation. Follow-up to **US-043** ("card detail reads as a
document"). Part of **IN-03**.

## Product Contract

The card detail is a **Notion document surface**: a comfortable single reading
column (~720px), stacked sections **divided by `border-border` hairlines — not
boxed sub-cards**, 32px padding, body at `{typography.body}` (16px) / **1.55
leading**. Structure: title (`card-title`, 22px) → meta row (assignees, due,
labels) in `muted-foreground` → description → checklist → comments →
attachments. Brand color marks only the save/primary action.

- US-043 already made it a **centered modal** (not a drawer) — that is correct
  and stays. The remaining gap is *structure*: today it's a wide ~1120px
  two-column layout (`card-detail-sheet.tsx:218 max-w-[min(96vw,1120px)]`) with
  **boxed sub-card sections** (`rounded-lg border bg-muted/20 p-4` on
  priority/dates/members), 24px padding (`px-6`), and 14px body — diverging from
  §103–110 / §332–340.

## Relevant Product Docs

- `DESIGN.md` — `card-detail` §103–110 / §332–340 (Notion document; ~720px
  column; hairline-divided stacked sections, NOT boxed sub-cards; 32px padding;
  16px / 1.55 body; brand only on save), Layout §261+ (card-detail reading
  measure), Typography §229+ (step body up to 16px for the document).
- `docs/product/boards-and-cards.md` — card-detail presentation; no contract change.

## Acceptance Criteria

- Document content sits in a **comfortable reading column** (~720px target;
  adapt for the meta/side controls without sprawling to 1120px). On mobile the
  modal fills most of the viewport (US-021 responsive behavior preserved).
- All boxed sub-card containers are removed and replaced by a **hairline-divided
  stack** (`border-b border-border` between sections). Enumerated targets:
  `card-detail-sheet.tsx:795` (**description** box, `min-h-44 rounded-lg border
  bg-muted/20`), `:821` (priority, `rounded-lg border bg-muted/20 p-4`), `:861`
  (dates grid, same), and the right-rail `aside` `:1063` (`border-l bg-muted/10`).
  Grep check: no `rounded-lg border bg-muted/*` section wrappers remain in the
  document body.
- **Right rail resolved (the structurally hardest part):** the two-column layout
  collapses to a single ~720px column. The `:1063` `<aside>` controls (assignees,
  due, priority, labels, etc.) move into the **meta row** (compact, under the
  title) and/or their own hairline-divided sections in the stack — *not* a fixed
  side rail. No control is removed (US-032 autosave behavior preserved); this is
  relocation, not feature loss. State the chosen placement in the PR.
- Document padding is **32px** (`p-8`) in the content region (header/meta may
  differ but read as part of the same surface).
- **Description + comment body only** step up to **16px / 1.55 leading**
  (`text-base leading-[1.55]`); meta/control/chip text **stays `body-sm` (14px)**
  — do not sweep all `text-sm`→`text-base` (DESIGN.md §256–258: default UI is
  body-sm; only the *document* steps to body).
- The card **title** renders at `card-title` (**22px / weight 500**); today the
  inline editor (`card-detail-sheet.tsx:552`) is `text-2xl font-semibold`
  (≈24px/600) — align it to the token (DESIGN.md §244/§335).
- Section order reads title → meta row → **description** → checklist → comments →
  attachments (US-031 already moved description under the title — preserve).
- Fields read as plain text and reveal the `text-input` affordance on
  focus/hover; brand color appears only on the save/primary action. Autosave
  model from US-032 preserved.
- Light + dark correct; no console errors; unit suite green; no horizontal
  overflow at 375px.

## Design Notes

- **UI surfaces:** `components/boards/card-detail-sheet.tsx` (the dialog layout,
  section wrappers, padding, body type), and its section components
  `card-checklists-section.tsx`, `card-attachments.tsx` (de-box their group
  containers to hairline rows).
- The two-column layout (`:1063` `<aside>`) is the crux: relocating its controls
  into the single column is the bulk of the work — see the right-rail AC for the
  committed target. Keep all existing controls; this is layout/structure, not
  feature removal.
- De-boxing also touches the section components `card-checklists-section.tsx` and
  `card-attachments.tsx` (their group containers → hairline rows), consistent with
  US-048's depth-by-surface — best sequenced after US-048.
- The cover-image scrim gradient (`:766`) is reviewed under **US-053** — out of
  scope here.
- Commands / Queries / API / Tables / Domain rules: none — autosave Server
  Actions (US-032/US-039) reused unchanged.

## Dependencies

- Builds on **US-043** (modal), **US-031** (order), **US-032** (autosave),
  **US-039** (date picker) — all shipped. Best done **after US-048** so the
  de-boxed sections inherit correct depth-by-surface.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-052 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — presentational; suite stays green. |
| Integration | n/a. |
| E2E | n/a — no harness. |
| Platform | ~720px reading column; hairline-divided stacked sections (no boxed sub-cards); 32px padding; 16px/1.55 body; autosave intact; brand only on save; no overflow at 375px; light + dark; no console errors. |
| Release | Manual visual QA: open a rich card (labels, members, checklist, comments, attachments, cover) desktop + 375px, light + dark; before/after screenshots. |

## Harness Delta

None.

## Evidence

**Reading column + padding:** `card-detail-sheet.tsx` `DialogContent` narrowed
from `max-w-[min(96vw,1120px)]` to `max-w-[min(96vw,768px)]` — the modal width is
the document measure. The content region is a single `overflow-y-auto` column at
`px-8 py-8` (32px). Header padding stepped `px-6` → `px-8` so header and body read
as one surface. DOM-verified at 375px: `document.documentElement.scrollWidth` ==
`clientWidth` (0px horizontal overflow); modal is 360px (96vw), no clipping.

**Two columns → one (right rail resolved):** the
`grid lg:grid-cols-[1.65fr_1fr]` + `<aside border-l bg-muted/10>` is gone. The
former right-rail **Comments and activity** now lives as the second-to-last
hairline section in the single stack. The former right-rail/boxed controls
collapse into a **compact, de-boxed property strip** directly under the title:

| Property | Placement | Control |
| --- | --- | --- |
| Members | meta strip row | avatar chips + an **Add** popover (assign list) |
| Labels | meta strip row | tinted chips + an **Add** popover (attach list) + **Manage labels** dialog |
| Priority | meta strip row | `Select` (autosave on change) |
| Due date | meta strip row | `Popover` + `Calendar` (autosave on select) |
| Estimate | meta strip row | `Select` (autosave on change) |

No control was removed — this is relocation. Members add/remove and the
ManageLabels CRUD dialog keep their existing Server Actions and live-store
behavior; the assignee remove/add UI and the label attach list moved into
popovers triggered from the strip. `CardLabelsSection` was refactored from a full
boxed `<section>` (own heading + always-open attach box) to an inline compact
form (chips + attach popover + manage dialog) — it is the sole consumer.

**De-boxed (no `rounded-lg border bg-muted/*` section wrappers remain in the
document body):**

| Site | Was | Now |
| --- | --- | --- |
| description (read-only) | `min-h-44 rounded-lg border bg-muted/20` box | plain `whitespace-pre-wrap` text, 16px/1.55 |
| priority | `rounded-lg border bg-muted/20 p-4` box | meta-strip row |
| dates grid | `rounded-lg border bg-muted/20 p-4` box | two meta-strip rows (due, estimate) |
| right `<aside>` | `border-l bg-muted/10` rail | comments hairline section in the stack |
| members rows | `rounded-lg border bg-background` rows | avatar chips + popover |
| comment / activity items | `rounded-lg border bg-background p-3` cards | plain avatar + text rows |
| checklist groups + empty/add boxes | `rounded-lg border bg-background` | de-boxed (`card-checklists-section.tsx`) |
| attachment items + empty box | `rounded-lg border bg-background p-3` | hairline rows (`card-attachments.tsx`) |

Sections are separated by `border-t border-border` hairlines (`mt-6 pt-6`).

**Typography (DOM-verified via `getComputedStyle`):**

| Element | Spec | Measured |
| --- | --- | --- |
| Title (input + read-only `h2`) | `card-title` 22px / 500 / 1.25 / -0.4px (was `text-2xl font-semibold`) | `text-[22px] font-medium leading-[1.25] tracking-[-0.4px]` |
| Description body | 16px / 1.55 | `fontSize: 16px`, `lineHeight: 24.8px` (= 16×1.55) |
| Comment body `<p>` | 16px / 1.55 | `text-base leading-[1.55]` |
| Meta labels/controls | stays body-sm (14px) | priority label `fontSize: 14px` |

`Textarea` needed `md:text-base` to override the primitive's `md:text-sm` and
reach 16px on desktop; the comment `<p>` has no primitive baseline so plain
`text-base` is 16px.

**Section order** reads title → meta strip (members, labels, priority, due,
estimate) → **description → checklist → comments → attachments** — the document
body order the AC specifies, with the properties grouped under the title (US-031's
"description under the title" preserved: description is the first body section).
The `card-section-*` ids are retained, so the header "Add to card" affordances
still scroll/focus their targets (US-043). Autosave (US-032), date picker
(US-039), mention autocomplete, and live-store assignee updates (US-011) are
untouched. Brand color appears only on the **Post comment** primary action; the
cover scrim gradient (`:763`) is left for US-053.

**Automated checks (2026-06-30):** `tsc --noEmit` clean (lone errors are in
untracked `scripts/perf-measure.ts`/`seed-perf-board.ts`, not this branch);
ESLint on the 4 changed components = 0 errors (3 pre-existing `<img>` LCP
warnings on the cover image, untouched); `npm test` = 523/523 pass.

**Manual QA — light + dark, desktop (1280) + 375px, no console errors/warnings:**
opened a rich card (4 tinted labels, activity history) on the brand-qa board.
Verified single ~720px column, hairline-divided sections, compact meta strip,
de-boxed comments/activity, Labels attach popover + Members add popover open and
operate in both themes, 0px horizontal overflow at 375px. Screenshots in
scratchpad `qa052/`: `01-detail-light`, `02-detail-light-full`,
`03-detail-light-bottom`, `04-detail-dark-top`, `05-labels-popover-dark`,
`06-detail-375-dark`.
