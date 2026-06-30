# US-052 Card detail reads as a true Notion document (structure pass)

## Status

planned

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

_Pending implementation._
