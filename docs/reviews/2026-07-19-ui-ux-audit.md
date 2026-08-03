# UI/UX Audit — 2026-07-19

**Method:** 10 parallel Pi/DeepSeek-v4-flash co-workers (read-only, via Herdr),
one per non-overlapping UI scope, judged against `DESIGN.md` + WCAG/a11y best
practice. ~100 raw findings. The **verified** claims below were re-checked by
reading the code directly (firsthand), not taken on the workers' word.

Scope→worker map: auth, boards-overview, board-canvas, card-detail,
filter/hooks, members, automation, dashboard, notifications/header,
ui-primitives.

Status legend: ✅ verified real · 🟡 real w/ nuance · ❌ refuted on verify ·
⬜ reported, not yet independently verified.

---

## ❌ Refuted on verification (do NOT action as written)

- **[was CRITICAL] "Archive board" dialog copy vs `deleteBoardAction` = data loss.**
  Traced to `lib/board.ts:79` → `deleteBoard()` is a **soft delete**
  (`archivedAt: new Date()`). Dialog + menu consistently say "Archive"; behavior
  IS archive. **No data loss, no user-facing copy mismatch.** Only the internal
  names (`deleteBoardAction`, `DeleteBoardDialog`, `isDeleteOpen`) are misnomers
  — LOW code-naming nit, nothing user-visible. (Also refutes board-canvas M3 and
  card-detail's related finding.)

## 🟡 Real but nuanced (scope down before fixing)

- **Avatar missing accessible name** (`member-avatar.tsx:27`): with an image,
  `alt={name}` is correct. Only the **imageless** case is weaker — SR reads
  fallback initials, not the full name. MEDIUM, not "every avatar fails".
- **member-row destructive menu item uses `event.preventDefault()`**
  (`member-row.tsx:191`): this is the **standard Radix pattern** for opening an
  AlertDialog from a menu item (keeps the trigger from closing the menu before
  the dialog mounts). Likely intentional, not a bug — needs runtime confirm
  before touching.

---

## ✅ Verified CRITICAL / HIGH (action these first)

1. **Notification fetch failure swallowed silently.**
   `components/notifications/notification-dropdown.tsx:70-72` — `catch {}` with
   only a comment. On the **first** dropdown open, a network error / non-200
   leaves `notifications = []` → renders the false "No notifications yet" empty
   state. No error UI, no retry. (Re-fetch case is defensible; first-open is not.)

2. **Optimistic mark-read without checking `success`.**
   Same file — `handleMarkAllRead` (99-103) sets every item read + fires
   `onMarkAllRead()` unconditionally after `await`; `handleNotificationClick`
   (85-87) calls `onMarkOneRead()` with no success check. Action failure →
   UI/server desync, silent. (Contrast: invitation accept at :136 *does* check.)

3. **Sidebar active-state broken.** `components/workspace/workspace-shell-sidebar.tsx`
   — Boards item is `active: false` hard-coded (:35, never highlights);
   Analytics uses strict `===` (:41) while members/automation/settings use
   `.startsWith()` (:47,:53,:59). `aria-current` is wired (:79) but never true for
   Boards. Nav orientation + SR `aria-current` lost.

4. **Analytics settings form: no success feedback + no dirty-state.**
   `components/workspace/analytics-settings-form.tsx` — handler only `setError`
   on failure (:40-50); success path is silent (no toast/"Saved"). Save button
   only disabled on `isPending` (:93), never gated on "changed", so it always
   submits + round-trips even with no edits. Also no unsaved-nav guard.

5. **`Button` primitive doesn't default `type="button"`.**
   `components/ui/button.tsx:50-55` destructures no `type` → any `<Button>` in a
   `<form>` defaults to `type="submit"` (form-submit footgun). Latent; many call
   sites pass explicit type, but the primitive should default it.

6. **Touch-target asymmetry (WCAG 2.5.5).** `button.tsx:31` default size `h-9`
   (36px) with **no** `pointer-coarse:h-11`, while `input.tsx:14` already has
   `pointer-coarse:h-11` (44px). Every button undersized on coarse pointers.

---

## Cross-cutting themes (fix once, benefit many scopes)

- **T1 — Decorative icons/emoji missing `aria-hidden`:** `▼/▶`
  (`workspace-item.tsx:71`), `⭐` heading (`boards-overview.tsx:17`), trend
  `↑/↓` (dashboard kpi-cards), "W" empty-state (`empty-boards-state.tsx:11`),
  many `HugeiconsIcon` across automation. SR noise.
- **T2 — Inline errors missing `role="alert"`:** members (all error `<p>`),
  automation (`rule-builder-dialog.tsx:274`, `board-automation-dialog.tsx:91`),
  notifications. Errors invisible to SR.
- **T3 — Surface-ladder inversion vs DESIGN.md:** `bg-background` inside
  `bg-card` — card-detail sheet (`card-detail-sheet.tsx:326`), automation action
  step (`rule-builder-dialog.tsx:556`); list-column uses `bg-muted`
  (`list-column.tsx:73`, interpretation-dependent).
- **T4 — Design-token drift:** `rounded-full` on labeled buttons
  (`board-header-controls.ts:6`, board-header Share/Star/Menu — DESIGN.md forbids
  pill); ring `ring-[3px]` vs `ring-3` (scroll-area, badge); heading `text-2xl`
  vs headline 28px (multiple pages); priority/due chips use raw Tailwind palette
  vs role tokens (`list-card-item.tsx:69-83,255-258`); Sheet missing enter/exit
  animation that Dialog/AlertDialog got (`components/ui/sheet.tsx`); Badge
  `rounded-4xl` vs `rounded-full`; SelectTrigger/Switch stray `shadow-xs`.
- **T5 — Form controls missing programmatic labels:** checklist inputs
  (placeholder-only, `card-checklists-section.tsx:144,181`), 3 Selects in
  rule-builder (:481,:503,:626).
- **T6 — Empty/loading states inconsistent:** dashboard + profile are "Coming
  soon" placeholders; execution-log empty is bare `<p>` vs rule-list's rich
  icon+text; board `loading.tsx` skeleton doesn't mirror real layout;
  `Skeleton` primitive has no `role="status"`/aria; workspace-list empty state
  has no CTA (`workspace/page.tsx:63`).

---

## Full inventory by scope (reported; ✅/🟡/❌ = verify status)

### Auth & public (worker: ux-auth)
- LOW: sign-in/up have no `catch` for network errors (forgot/reset do) →
  unhandled rejection risk; `handleResend` swallows errors silently.
- LOW: no `autoFocus` on first field of any auth form.
- LOW: landing page is name+tagline placeholder, no CTA to `/sign-up`.
- LOW: single error banner, no per-field errors; no confirm-password (likely intentional).

### Boards overview / sidebar (worker: ux-boards-overview)
- HIGH: create-board/workspace modals show error text but no `border-destructive`
  / `aria-invalid` / `aria-describedby` on the Input (DESIGN.md "never color-only").
- HIGH: star button hard-codes `text-yellow-400`, `text-white/40`, `bg-white/15`… (no tokens); contrast risk on light board headers.
- HIGH: both create modals lack `DialogDescription`/`aria-describedby`.
- H5/🟡: boards-sidebar "Boards" link no `aria-current="page"` (workspace-item has it).
- MED: WorkspaceSection vs WorkspaceBoardsView duplicate grid markup (drift risk).
- MED: `⭐ Starred` / "W" / heading tokens; star button 28px too small (touch+focus ring).
- LOW: no max-length hint on title (64); modal disabled-state inconsistency; empty-state drops sidebar → jarring first-workspace transition.

### Board canvas (worker: ux-board-canvas)
- HIGH: card `role="button"` + Enter opens, but @hello-pangea/dnd grabs Space → SR user pressing Space starts a drag; no `aria-roledescription`.
- HIGH: `text-white` board title hard-coded (latent contrast risk on light themes).
- HIGH/⬜: list-column `bg-muted` vs DESIGN.md surface ladder (T3, interpretation-dependent).
- HIGH: board-header `rounded-full` buttons + `border-black/10` (not `border-border`, breaks dark).
- HIGH: `h-[calc(100vh-3.5rem)]` should be `100dvh` (mobile chrome); card tile `p-2` vs 12px.
- MED: priority/due chips raw palette (T4); loading skeleton mismatch; reconnecting badge `bg-amber-500/90`; `role="img"` on text spans; filter popover `w-72` overflow <320px; click-outside vs Radix popover mousedown race.

### Card detail (worker: ux-card-detail)
- ❌ CRITICAL "archive/delete" (refuted above).
- HIGH: card-detail surface `bg-background` vs `bg-popover` (T3).
- HIGH: `archive-card-dialog` uses `role="alertdialog"` on a Dialog that allows outside-click dismiss (ARIA mismatch).
- HIGH: checklist inputs no accessible label (T5); ManageLabels "Delete" label fires `deleteLabelAction` with **no confirmation** (shared across all cards).
- MED: `scrollIntoView({behavior:"smooth"})` ignores prefers-reduced-motion; autosave status truncated `max-w-56`; mention highlight uses `--chart-2` (chart token as chrome accent); completion toggle `text-muted-foreground/60` (low contrast); heading level skips; attachments have no delete affordance; `type="button"` forwarded to `<a>` via asChild.
- LOW: title hover `bg-muted/50`; label-mark 6 textures for 8 colors → collisions; comment composer has no `<form>` (no Enter submit); viewers can't see archived-cards trigger; "Assign members" vs "Add" copy.

### Filter / hooks (worker: ux-filter-hooks)
- HIGH: filter trigger has no `aria-pressed`/count in label (documented contract violation in `board-header-controls.ts:8`).
- HIGH: inline-title editor empty-title → error state but error is **never rendered** in list-column; user trapped in edit mode, only escape is undocumented Esc key.
- MED: `board-header-controls` `rounded-full` (T4); eyebrow `text-xs` vs 13px; search-active hides dimensions with no live-region announce.
- LOW: mention autocomplete blur-to-close fragility (depends on consumer calling preventDefault); virtualReference stale on scroll; `useClickOutside` pointerdown vs blur ordering; displayCount shows "1" while hiding active dimension count (misleading); `styles.ts` naming.

### Members & invitations (worker: ux-members)
- 🟡 HIGH: avatar no accessible name when imageless (nuance above).
- 🟡 HIGH: member-row destructive `preventDefault` keeps menu open (likely intended Radix pattern).
- HIGH: all inline errors (invite/role/remove) missing `role="alert"` (T2).
- MED: role-select trigger shows only label, no role description; heading token drift; invite/page no "already a member" preflight; pending-invitation-row dual open-state path.
- LOW: no optimistic role change (stales until refresh); members `max-w-3xl` vs invitations `max-w-5xl` width mismatch; ReceivedInvitationsList internal empty state is dead code.

### Automation (worker: ux-automation)
- HIGH: nested `role="dialog"` (RuleBuilderDialog inside BoardAutomationDialog) — ARIA forbids; 3 Selects unlabeled (T5).
- MED: form validation + fetch errors missing `role="alert"` (T2); `aria-busy` on skeleton that unmounts (never flips false); execution-log empty state bare `<p>` (T6); log heading `text-muted-foreground` ~3.2:1 contrast; action-step `bg-background` inside `bg-card` (T3); reorder buttons don't move focus; native `required` fires browser tooltip before app validation; rule-row "Last run" stale vs log panel.
- LOW: empty-state icon no aria-hidden; skeleton aria-label dup; generic `.catch()` loses detail.

### Dashboard / settings (worker: ux-dashboard)
- HIGH: sidebar active-state (✅ #3 above); analytics-settings no success/dirty (✅ #4 above).
- MED: kpi trend arrows no a11y label (color+arrow only); kpi grid jumps 2→6 cols at xl (cramped ~1280px, no lg step); no top-level analytics empty state (new workspace looks broken); workspace-list empty state no CTA (T6).
- MED/⬜: WorkspaceDashboardClient returns null, connects socket with no error boundary → initSocket throw could crash page.
- LOW: profile page "Coming soon" dead route; `<aside>` no aria-label; heading weight drift; `bg-muted/20` may be invisible in dark.

### Notifications / header / theme (worker: ux-notif-header)
- CRITICAL: silent fetch fail (✅ #1); optimistic mark-read (✅ #2).
- HIGH: bell `aria-label` doesn't distinguish notifications vs invitations count; UserButton `DropdownMenuTrigger` no `aria-label`; focus-return after dropdown closes on click (needs runtime check).
- LOW: header actions row no `role="toolbar"`, bell ~4px height mismatch vs toggle/user; empty state no `role="status"`; "Mark all read" unmounts (layout shift); theme-toggle dual-icon FOUC risk; `text-[10px]` badge legibility.

### UI primitives / globals (worker: ux-ui-primitives)
- MED: `Button` no `type="button"` default (✅ #5); `Button` no `pointer-coarse:h-11` (✅ #6); Sheet missing enter/exit animation (Dialog/AlertDialog have it); popover `rounded-md` vs `rounded-lg`; badge `rounded-4xl` vs `rounded-full`; Skeleton no `role="status"`/aria (T6); SelectTrigger + Switch stray `shadow-xs`.
- LOW: scroll-area/badge `ring-[3px]` vs `ring-3` (T4); card `sm` py-4 vs 12px; switch hard-coded px geometry; `--chart-1..5` identical in both themes (maybe intentional); Avatar root no enforced aria-label.

---

## Suggested fix order

1. **Cheap + wide blast radius (do first):** `Button` default `type="button"` +
   `pointer-coarse:h-11` (#5,#6); sidebar active-state (#3); notification
   success-checks + first-open error/retry UI (#1,#2).
2. **A11y sweep:** `aria-hidden` on decorative icons/emoji (T1) + `role="alert"`
   on inline errors (T2) + programmatic labels on unlabeled inputs/selects (T5).
3. **Form feedback:** analytics-settings success + dirty-state (#4); inline-title
   editor render its error (filter/hooks HIGH); label-delete confirmation.
4. **Token + surface cleanup** per DESIGN.md (T3, T4) — batchable.
5. **Empty/loading states** (T6) + dashboard socket error boundary.

## Not yet verified (⬜ — worth runtime/DevTools before fixing)
Dark-mode contrast measurements (due chips, muted/20, chart-2 highlight,
log heading); focus-return after popover close; nested-dialog SR behavior;
list-column surface interpretation; filter popover overflow on 320px; Radix
portal z-order for menu+dialog.
