# US-043 Card detail reads as a document, not an admin form

## Status

implemented — 2026-06-29 (manual QA, browser-verified). Reuses the US-033
ManageLabelsDialog and US-032 autosave model unchanged.

## Lane

normal (with stronger validation) — restructures already-shipped card-detail
presentation (existing-behavior) and client-visible layout (public-contract);
proof is manual QA (weak-proof). 3 flags, **no hard gate**: no schema, no
auth/authz, no Server Action contract change (the same autosave mutations are
reused), no external system, no weakened validation.

## Product Contract

Opening a card presents it as a **living document**, the way Trello does — the
card title is the hero, editable in place, with the supporting editors organized
around it. It must stop reading as an "Edit card" admin form. All existing
editing capability (title, description, labels, checklists, priority, due date,
estimate, members, cover, attachments, comments, activity) is preserved; only the
framing and information hierarchy change.

Specifically, the current form framing is removed:
- the `CARD / BOARD DETAIL` breadcrumb,
- the literal **"Edit card"** heading and its "Review this card…" subtitle,
- the uppercase **"TITLE"** field label,
- the over-weighted top-of-column **Cover → "Upload new image"** panel.

**Scope note (corrected after review):** board-label *management* CRUD was
**already moved out of the card body into a `ManageLabelsDialog` by US-033**
(`card-labels-section.tsx`). This story does **not** re-do that; it reuses the
existing dialog and only restructures the surrounding framing/hierarchy.

**Out of scope (carved out to US-045):** a clickable **completion control** on
the card. Completion is currently a *derived* state — moving a card into an
`isDone` list auto-sets `completedAt`, moving it out reopens it
(`docs/product/boards-and-cards.md`), with a `requireEstimateBeforeDone` rule and
no card-level toggle action. A manual toggle is a data-model + product-contract
change and is tracked as the **high-risk** story
[`US-045`](./US-045-manual-card-completion/). This story stays presentational.

## Relevant Product Docs

- `docs/design/planora-vs-trello-gap-analysis.md` — Gap 2.
- `docs/design/trello-board-ui-reference.md` §7 (card-detail document anatomy:
  hero title, completion circle, action row, label chips + popover).
- `docs/product/boards-and-cards.md` — Cards.

## Acceptance Criteria

- The card **title is the hero**: large, inline-editable on click, no "TITLE"
  label, no "Edit card" heading, no breadcrumb, no subtitle.
- **Accessibility of the hero title (a11y):** once the visible "TITLE" label is
  gone, the editable field carries an accessible name (`aria-label="Card title"`
  or a visually-hidden label); it has a visible **focus-visible** style despite
  being borderless; **Enter commits, Escape reverts** (today only `onBlur` saves).
- The hero title **binds to the live board-store value** (`selectedCard.card.title`),
  not a stale prop, so a remote rename isn't clobbered when the field blurs.
- A single horizontal **action row** (Add · Dates · Checklist · Members ·
  Attachment, adapted to Planora's set) replaces the floating "Add/Members"
  buttons; each control has an accessible name and a sensible tab order, and all
  controls stay reachable when the row wraps/collapses on mobile.
- **Labels** reuses the **US-033 `ManageLabelsDialog`** for create/edit/delete —
  this story does not build a second management surface. On the card, attach/detach
  stays inline; management is reached from the existing dialog trigger.
- **Cover** is demoted from a top-of-column panel to a header/secondary action;
  both existing paths are preserved — pick from existing image attachments **and**
  upload new — including the zero-image-attachments case.
- **"Post comment"** renders as a brand-primary button (depends on **US-042**).
- **Dialog focus is preserved** through the restructure: initial focus on open and
  focus-return-to-trigger on close still work (don't break the shadcn Dialog
  behavior when moving Cover/sections).
- The two-column layout and autosave-on-blur model (`saveDetails`, shipped via
  **US-032 unify-card-dialog-save-model**) and de-duplicated metadata
  (**US-031 card-dialog-reorder-remove-duplicate-metadata**) are preserved;
  comments/activity feed unchanged.
- Mobile (375px): single column, no horizontal overflow; light + dark correct; no
  console errors; unit suite green.

## Design Notes

- Commands/Queries/API/Tables: none — same Server Actions and autosave wiring.
- **UI surfaces:** `components/boards/card-detail-sheet.tsx` (header + content
  column restructure — remove breadcrumb/heading/subtitle/TITLE-label, promote
  hero, build action row, demote Cover). `card-labels-section.tsx` is **reused
  as-is** (US-033 already split assign vs manage); reuse the existing date
  `Popover` (US-039), members dropdown, checklist section, attachments component.
- **Hero type scale:** Trello's modal title is ~24/28 weight ~653; target a
  comparable heading scale (don't leave "large" undefined).
- No change to comment/mention behavior (US-040). **No completion control here**
  (see US-045).
- Dependencies/related: **US-042** (brand button — land first);
  **US-031-card-dialog-reorder-remove-duplicate-metadata**,
  **US-032-unify-card-dialog-save-model** (autosave, shipped),
  **US-033-manage-labels-affordance** (owns the label-management dialog this story
  reuses), **US-045** (manual completion — carved out, high-risk).
- Consider extracting a shared **`LabelChip`/`LabelBar`** primitive with US-044 so
  the card face and card detail render labels (and the a11y treatment)
  consistently.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-043 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a — presentational restructure; any extracted pure helper gets a small test. Full suite stays green. |
| Integration | n/a — no Prisma/Server-Action test harness (IN-01 residual). |
| E2E | n/a — no harness. |
| Platform | Card opens as a document (hero title, action row, reused label dialog, demoted cover); every editor still works; hero title has accessible name + Enter/Escape + focus-visible + binds to live store; dialog focus-return intact; mobile + light/dark correct; no console errors. |
| Release | Manual QA opening a card, editing each field, posting a comment. |

## Harness Delta

None expected. Clarify the boundary with US-033 if the label-management surface
moves.

## Evidence

### What shipped (`components/boards/card-detail-sheet.tsx`)

- **Hero title.** The form framing is gone — no `CARD / BOARD DETAIL` breadcrumb,
  no "Edit card" heading, no "Review this card…" subtitle, no uppercase "TITLE"
  label. The title is now a large (`text-2xl`, the ~24px Trello scale) borderless
  inline-editable `<input>` in the dialog header, with a visible
  **focus-visible** ring despite being borderless. Read-only viewers see an `<h2>`.
- **Hero a11y + commit/revert.** The input carries `aria-label="Card title"`.
  **Enter commits** (blurs → autosave); **Escape reverts** the field to the live
  value in place and keeps the dialog open — Radix's dismiss is cancelled via the
  supported `DialogContent onEscapeKeyDown` guard (only while the title holds an
  unsaved edit, so a clean Escape still closes the dialog). On open, Radix's
  auto-focus-select of the whole title is collapsed to caret-at-end in `onFocus`
  so a stray keystroke can't wipe the title (a mouse click that sets its own caret
  is left untouched).
- **Live-store binding.** The hero title/description bind to the live board-store
  value (`selectedCard.card.title/description`), merged over the server prop in
  the `CardDetailSheet` wrapper. Drafts reflect a remote edit via the React
  "adjust state during render" pattern (baseline-guarded, not an effect) whenever
  the local user isn't typing — so a remote rename is **not clobbered** on the
  next blur. Verified live: an edit posts an "updated this card" activity entry
  without reload.
- **Action row.** A single horizontal "Add to card" row (Labels · Dates ·
  Checklist · Members · Attachment · Cover) replaces the scattered entry points.
  Each is a labelled `<Button>` (icon + text = accessible name), keyboard-operable;
  the editor-section buttons scroll their section into view and move focus to its
  primary control (Dates → the due-date button, verified). The row `flex-wrap`s to
  reachable rows at 375px.
- **Cover demoted.** The over-weighted top-of-column Cover panel is gone; cover is
  now a **Popover** off the action row. Both paths preserved — pick from existing
  image attachments **and** upload new — including the zero-image-attachments case
  (shows "No image attachments yet…"). The displayed cover banner at the top of an
  opened card is unchanged.
- **Labels reuse.** `CardLabelsSection` (US-033) is reused **as-is** — attach/
  detach inline, the `ManageLabelsDialog` ("Manage labels") owns CRUD. No second
  management surface was built.
- **Post comment** is the brand-primary button (default `Button` variant, which
  US-042 themed to the brand primary), no longer a small secondary control.
- **Preserved:** the two-column layout, US-032 autosave-on-blur (title/description
  on blur; estimate/due-date/priority on change), US-031 de-duplicated metadata,
  and the US-040 comment/mention behavior are untouched.

### Verified (browser, authenticated board)

- `.ui-review/us-043-document-light.png` — document layout: hero title, "Add to
  card" action row, demoted Cover, reused label dialog, brand Post-comment.
- `.ui-review/us-043-document-dark.png` — dark mode (forced `.dark`, since US-046
  ships the switcher): dark surfaces, readable text, label chips legible.
- `.ui-review/us-043-document-mobile.png` — 375px: single column, action row wraps
  to reachable rows, **no horizontal overflow** (`scrollWidth === innerWidth`).
- Title Enter-commits / Escape-reverts-and-stays-open / clean-Escape-closes all
  verified via keyboard; Cover-popover Escape closes the popover (not the dialog);
  caret-at-end-on-open verified. **No console errors/warnings.** Unit suite green
  (523 passing); changed file lints clean (only the pre-existing `<img>` cover
  warnings).

### Known limitation (pre-existing, not introduced here)

Focus-**return**-to-trigger on close does not land on the originating card tile —
focus goes to `document.body`. This dialog is **URL-driven** (it mounts from the
`cardId` search param, there is no Radix `DialogTrigger`), and `handleClose`'s
`router.replace` re-render lands focus on the body. Verified identical on the
pre-restructure code by stashing this change — so the restructure **does not break
it**; initial-focus-on-open works and is improved (no destructive select-all).
A real fix belongs to the URL-driven open/close path, not this presentational
story.

## Harness Delta

None. `CardLabelsSection`/`ManageLabelsDialog` (US-033) and the US-032 autosave
actions are reused unchanged; no schema, Server Action, or contract change. The
shared `LabelMark` primitive from US-044 was **not** adopted here — the card-detail
label surface is the US-033 `CardLabelsSection` (attach/detach + manage dialog),
which is a different concern than the card-face bar/chip; re-rolling it onto
`LabelMark` was out of scope and would have re-touched the US-033 surface this
story is required to reuse as-is.
