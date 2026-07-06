# Planora Board vs. Trello — Gap Analysis & UI/UX Improvement Plan

Companion to [`trello-board-ui-reference.md`](./trello-board-ui-reference.md). That
doc measured Trello's board view; this one holds **Planora's current board**
against it and turns the deltas into a **prioritized improvement plan** with file
references and concrete changes.

- Trello capture: live board, 2026-06-29 (measured values).
- Planora capture: `.ui-review/02-board-detail.png`, `03-card-detail.png` + a full
  read of the board components under `components/boards/`.

---

## 0. Verdict first

**Planora is not behind on features — it's behind on _system_.** The board
already has colored labels, priority badges, due-date states, live presence
avatars, drag-and-drop (`@hello-pangea/dnd`), client-side filter+search, a
two-column card modal, optimistic realtime, and dark mode. On raw capability it
is at or near Trello free-tier parity.

The distance to "professional Trello-level" comes down to **three systemic
things**, in priority order:

1. **No brand color system** — the app runs on stock shadcn zero-chroma grayscale.
2. **The card detail reads like an admin form**, where Trello's reads like a
   living document.
3. **Lower card density** — cards are ~2× taller than Trello's, so fewer fit on
   screen.

Everything else is polish and incremental feature parity. Fix those three and the
jump in perceived quality is large and cheap.

---

## 1. Side-by-side comparison

| Dimension | Trello (measured) | Planora (current) | Gap |
| --- | --- | --- | --- |
| **Brand color** | One blue `#1868DB` on every primary action, link, focus ring, selected state | Stock shadcn neutral: `--primary: oklch(0.205 0 0)` (near-black, **zero chroma**). Buttons/focus/links are gray | 🔴 High |
| **Board background** | Per-board color/photo behind transparent chrome | Per-board gradient (`boardTheme.header/surface`) — *good, matches Trello* | 🟢 Match |
| **App top bar** | Brand-blue chrome, global Create/Search | White bar, grayscale "Planora" wordmark | 🟡 Med |
| **List column** | 272px content / 284px pitch, bg `#F1F2F4`, radius **12px** | `sm:w-80` (**320px**), `bg-muted`, radius `rounded-lg` (~7px) | 🟡 Med |
| **List header** | title + **card count** + `⋯` | title + Done badge + drag handle + `⋯` (**no count**) | 🟡 Med |
| **Card tile height** | 36–76px (compact color-bar labels, icon+count footer) | ~100px (full-text label pills + separate priority row) | 🔴 High |
| **Card labels** | 40×8px color bars, expand to text on click | Full-text pills always (`px-2 py-0.5`), wrap to multiple rows | 🟡 Med |
| **Card hover** | Clean at rest; **pencil quick-edit + completion radio** appear on hover | Drag handle + `⋯` menu **always visible** on every card | 🟡 Med |
| **Card detail** | Document: hero inline title + completion circle, action row, label mgmt in popover | **Form**: "Edit card" heading, breadcrumb, "TITLE" field label, board-label CRUD list inline | 🔴 High |
| **Card detail URL** | Route-addressable `/c/<shortlink>` (deep-linkable) | `?cardId=` query param (works, not as clean) | 🟢 Low |
| **Primary buttons** | Brand-blue fill | "Post comment" renders muted/gray | 🟡 Med |
| **Share** | Full dialog: invite + per-member role dropdown + join requests | Button **stubbed** (no action) | 🟡 Med |
| **Filter** | keyword + members + status + due + labels | label + keyword only | 🟢 Low |
| **Realtime presence** | online dot on facepile | watcher avatars + reconnect badge — *good* | 🟢 Match |
| **Dark mode** | (light only) | full `.dark` palette exists in CSS but is **unreachable** — no theme provider/toggle applies it (US-046 fixes this) | 🟡 Med |

---

## 2. The three systemic gaps (deep dive)

### Gap 1 — No brand color system 🔴

**The single highest-leverage change.** In `app/globals.css` every semantic color
is `oklch(L 0 0)` — lightness only, **chroma 0 = no hue**. `--primary`, `--ring`,
`--accent`, links: all grayscale. The board header gradients are the *board's*
background color (the analogue of Trello's board background), **not** a product
brand. So Trello's defining trait — one accent hue tying every interactive state
together — is absent. The result reads as "default shadcn template," not a product.

Trello: `--ds-link / --ds-background-brand-bold = #1868DB` drives links, primary
buttons, focus (`#4688EC`), and selected (`#1868DB` fill / `#E9F2FE` tint)
everywhere.

**Fix** (in `app/globals.css`, both `:root` and `.dark`):
- Give `--primary` a real hue (Planora can pick its own — a blue near Trello's, or
  a distinct brand color). Example: `--primary: oklch(0.55 0.20 255)`.
- Point `--ring` at the same hue so focus rings read as brand, not gray.
- Add a `--selected` / selected-tint pair for selected rows/checkboxes (Trello's
  `#1868DB` / `#E9F2FE`).
- Make `--primary-foreground` white for contrast on the colored fill.

This instantly upgrades: primary buttons, the "Post comment" button, filter active
state, focus rings, links, and any selected state — with **one file edit**.

> Keep the per-board `boardTheme` gradients as-is; they're the correct Trello
> analogue and shouldn't be collapsed into the brand hue.

### Gap 2 — Card detail is a form, not a document 🔴

`components/boards/card-detail-sheet.tsx` frames the card as an editing form:

- Header breadcrumb `CARD / BOARD DETAIL` (`uppercase tracking-wide`), an **"Edit
  card"** title (`text-2xl font-semibold`), and a subtitle "Review this card,
  update its description…".
- The title field carries an uppercase **"TITLE"** label.
- The **Labels** section renders the full **board-label management list** inline
  (Bug / Feature / Design / Backend, each with On/Off · Edit · Delete +
  "Manage labels") — management UI bleeding into the card.
- **Cover → "Upload new image"** sits high in the column, over-weighted.
- The **"Post comment"** button is muted/disabled-looking.

Trello (reference §7) makes the card a document: the **title is the hero** (large,
inline-editable, with a completion circle), a clean **action row** (Add · Dates ·
Checklist · Members · Attachment), assigned label **chips + `＋`** with management
hidden in a popover, description as a quiet rich-text block, cover behind a header
button.

**Fix** (`card-detail-sheet.tsx`):
1. Delete the breadcrumb, "Edit card" heading, and subtitle. Promote the **card
   title** to the hero — inline-editable on click, no "TITLE" label.
2. Add a **completion checkbox/circle** left of the title. **(Split out —
   high-risk, US-045.)** Completion is currently *derived* from `isDone`-list
   membership (`docs/product/boards-and-cards.md`); a manual toggle is a
   data-model + contract change with no existing Server Action, so it is **not**
   part of the US-043 presentational restyle.
3. Replace the floating "Add/Members" buttons with a single horizontal **action
   row** matching Trello.
4. On the card show only **assigned label chips + a `＋`**; move board-label CRUD
   (Edit/Delete/Create) into the popover that the `＋` opens (or a "Manage labels"
   board-menu entry). `card-labels-section.tsx` already exists — split *assign*
   from *manage*.
5. Demote **Cover** to a header action (Trello's cover button), not a top-of-column
   panel.
6. Make **"Post comment"** a `--primary` (brand) button.

### Gap 3 — Cards are too tall (low density) 🔴

`components/boards/list-card-item.tsx`: `CardContent` uses `px-3 py-3` (12px) with
`space-y-2`, full-text label pills (`rounded px-2 py-0.5 text-xs`) that wrap, and a
separate priority/meta row. Measured against Trello's 36–76px tiles, Planora cards
run ~100px — roughly half as many cards visible per screen.

**Fix** (`list-card-item.tsx`):
1. **Compact label chips by default** — render labels as ~`h-2 w-10 rounded`
   color bars (Trello's 40×8px), expanding to text pills on click or via a board
   setting. Biggest single density win (~22px per labeled card).
2. Tighten padding to **`p-2`** (8px, Trello's value).
3. Fold the **priority** chip into the same compact meta footer as
   due/checklist/comments instead of its own row (keep the flag icon — priority is
   a Planora value-add worth keeping, just denser).
4. Optional a11y win from the reference: **colorblind texture overlay** on label
   bars so they're distinguishable without hue (reference §7.3).

---

## 3. Prioritized roadmap

### Tier 1 — The professional leap (do first, high impact / low effort)

| # | Change | File(s) | Effort |
| --- | --- | --- | --- |
| 1 | Introduce a brand hue for `--primary` / `--ring` / selected states | `app/globals.css` | S |
| 2 | Card detail: form → document (hero title, action row, demote cover, primary comment btn) | `card-detail-sheet.tsx` | M |
| 3 | Card density: compact label chips + `p-2` + folded meta row | `list-card-item.tsx` | M |
| 4 | ~~Move board-label CRUD out of the card into a popover~~ — **already shipped (US-033)** | `card-labels-section.tsx` | ✔ done |

> **Stories:** Tier 1 is tracked as **US-042** (brand color), **US-043** (card
> detail restyle), **US-044** (compact tiles), with the completion toggle carved
> into the high-risk **US-045**. Recommended build order: **US-042 → US-044 →
> US-043** (US-043 and US-044 both consume the US-042 brand hue; the card-detail
> restyle lands last and depends on nothing structural). US-045 is gated on a
> product decision (completion reconciliation rule) and ships independently.

### Tier 2 — Parity polish

| # | Change | File(s) | Effort |
| --- | --- | --- | --- |
| 5 | List header **card count** | `list-column.tsx` | S |
| 6 | Hover-reveal card actions (hide drag handle/`⋯` until hover) + completion circle | `list-card-item.tsx` | S |
| 7 | List metrics → Trello (width ~272px, radius `xlarge`/12px; card radius 8px) | `list-column.tsx`, `components/ui/card.tsx` usage | S |
| 8 | Add-card composer stays open for rapid sequential entry | `list-column.tsx` | S |
| 8b | **Make dark mode reachable** — theme provider + header toggle + persistence (the `.dark` CSS already exists; nothing applies it) | `app/layout.tsx`, `app/(authenticated)/layout.tsx`, `next-themes` → **US-046** | S–M |

### Tier 3 — Feature gaps

| # | Change | Maps to | Effort |
| --- | --- | --- | --- |
| 9 | Implement **Share** dialog: invite + per-member role dropdown + join requests | `lib/permissions.ts` admin/editor/viewer; reference §8 | M–L |
| 10 | Extend **Filter**: members / card status / due-date buckets | `board-filter.tsx`; reference §6.3 | M |
| 11 | Board-level **Activity** view (reuse `card-history`) | reference §6.4 | M |
| 12 | Card-detail date parity: start date / recurring / reminder | reference §7.1 / US-039 | M |
| 13 | Route-addressable card URL `/c/<id>` (deep-link/share) | reference §7 | M |

---

## 4. Quick-reference: exact target values

Pull these from the reference doc when implementing:

- **Brand:** primary/link/focus = one hue; selected fill + `#E9F2FE`-style tint.
- **List:** content 272px, gutter 12px, radius 12px, bg cool-gray (`#F1F2F4`).
- **Card:** radius 8px, padding 8px, `shadow-raised`, 8px gap between cards.
- **Card label (compact):** ~40×8px bar, radius 4px; expand to text on click.
- **Card meta footer:** 4px-gapped icon+count row, 12px meta text.
- **Type:** card title 14/20 weight 400; list name heavier; bold is an optical
  weight, not just 700.
- **Elevation:** raised = `0 1px 1px / 0 0 1px`; overlay = `0 8px 12px / 0 0 1px`.

---

## 5. What NOT to change

- **Per-board background gradients** (`boardTheme`) — correct Trello analogue.
- **Dark mode** — the `.dark` palette is complete and worth keeping; preserve it
  through every change above (every new token needs a `.dark` value). Note it is
  *unreachable* until **US-046** ships a theme switcher — once it's reachable,
  re-verify every screen in dark.
- **Realtime/presence + drag-drop** — already at parity; don't regress the
  drag-aware deferral invariant when touching card components.
- Premium/upsell surfaces in the reference (Custom Fields, list colors, templates)
  — out of scope.
