# US-055 Non-color signal for unread-notification state

## Status

done — implemented 2026-06-30 on `feat/us-055-unread-noncolor-signal`; manual QA
passed (light + dark, no console errors). Unread notification rows now carry a
**non-color signal** beyond the dot: the title renders `font-semibold` (vs
`font-normal` for read rows) — a weight contrast perceivable in grayscale — plus
an `sr-only "Unread: "` prefix for assistive tech, and the color dot is marked
`aria-hidden`. Applied to **both** the bell dropdown (the AC surface) and the
full-page `/notifications` list (the identical-markup sibling — same WCAG 1.4.1
defect). Bell left as-is. See Evidence.

## Lane

tiny — small accessibility fix to the notification dropdown. 1 flag (existing
behavior). No hard gate, no schema, no logic change beyond presentation. Part of
**IN-03**.

## Product Contract

State is never conveyed by color alone (WCAG 1.4.1 / `DESIGN.md` §393). Unread
notifications must carry a **non-color signal** in addition to any color — a
count, a label, or a filled/outline distinction — so the unread state is
perceivable without color vision.

- **The bell is already conformant** — `notification-bell.tsx:26` sets
  `aria-label={`Notifications (${count} unread)`}` and `:29–31` renders a numeric
  count badge. No work needed there.
- The gap is the **dropdown row**: `notification-dropdown.tsx:280` shows unread as
  a bare `size-2 rounded-full bg-primary` dot — color-only. (Read rows use
  `opacity-60`, a valid non-color signal, but the *unread* affordance itself is
  just the colored dot.)

## Relevant Product Docs

- `DESIGN.md` — Do/Don't §393 ("Don't rely on color alone to convey state"),
  Responsive & Accessibility §395+.
- `docs/product/notifications.md` — notification list presentation; no contract
  change.

## Acceptance Criteria

- Each **dropdown row's** unread state carries a non-color signal alongside the
  dot: unread rows in `foreground`/medium weight vs. read rows muted, or an
  explicit "(unread)" / `aria` cue — so unread is distinguishable in grayscale.
- The bell (`notification-bell.tsx`) already satisfies non-color + aria — **leave
  it as-is**; do not regress its existing count badge / `aria-label`.
- Light + dark correct; no console errors; unit suite green.

## Design Notes

- **UI surfaces:** `components/notifications/notification-dropdown.tsx` (row
  unread dot + read `opacity-60`), `notification-bell.tsx` (bell indicator).
- Cheapest sufficient fix: keep the dot **and** make unread rows bolder/
  full-`foreground` while read rows stay muted — the weight/opacity contrast is
  the non-color channel. (Bell already done — dropdown rows only.)
- Commands / Queries / API / Tables / Domain rules: none.

## Dependencies

- Independent.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-055 --unit 0 --integration 0 --e2e 0 --platform 1`.

| Layer | Expected proof |
| --- | --- |
| Unit | n/a; suite stays green. |
| Integration | n/a. |
| E2E | n/a — no harness. |
| Platform | Unread state perceivable without color (count/weight/label); bell `aria-label` reflects unread count; light + dark; no console errors. |
| Release | Manual QA: dropdown with mixed read/unread, verified in grayscale (or with the dot color stripped) + a11y-tree check. |

## Harness Delta

None.

## Evidence

**The fix — a weight-based non-color channel.** Per the AC's "cheapest sufficient
fix" (Design Notes): keep the color dot but make the unread state legible without
color via title **weight** (the non-color channel) plus a screen-reader cue.

- Unread row title: `font-semibold`; read row title: `font-normal` (was
  `font-medium` for both — no distinction).
- `<span className="sr-only">Unread: </span>` prefixes the unread title so
  assistive tech announces the state (the visual weight is invisible to AT).
- The `bg-primary` dot is now `aria-hidden="true"` — it's decorative once the
  weight + sr-only label carry the state (avoids a redundant/ambiguous AT cue).
- Read rows keep their existing `opacity-60`; unread rows keep `bg-accent/50`.

**Two surfaces, one defect.** The AC names the dropdown
(`components/notifications/notification-dropdown.tsx`), but the full-page list
(`app/(authenticated)/(dashboard)/notifications/notifications-list-client.tsx`)
had the **identical** color-only dot + uniform `font-medium` rows — same WCAG
1.4.1 / §393 gap. Fixing one surface while leaving its twin would be inconsistent,
so the same change landed on both. The **bell**
(`notification-bell.tsx`) was already conformant (numeric count badge +
`aria-label="Notifications (N unread)"`) and was left untouched.

**Manual QA — light + dark, no console errors (2026-06-30).** Seeded one unread +
one read notification for the logged-in user, then verified and removed them.
- **Dropdown** (DOM-verified via `getComputedStyle`): unread title
  `font-weight: 600`, `sr-only "Unread: "` present, row `opacity: 1`, dot present
  & `aria-hidden`; read title `font-weight: 400`, no sr-only, row `opacity: 0.6`,
  no dot.
- **Full-page `/notifications`**: same DOM result; screenshotted in both themes —
  the bold-vs-normal weight contrast reads clearly in grayscale (the unread row is
  visibly heavier independent of the blue dot/tint). Screenshots in scratchpad
  `qa055/`: `02-page-light`, `03-page-dark`.
- `list_console_messages` (error+warn) returned none on the notifications page.

**Automated checks (2026-06-30):** `tsc --noEmit` clean (pre-existing untracked
`scripts/perf-measure.ts`/`seed-perf-board.ts` errors excluded — not this branch);
ESLint on the 2 touched files = 0 errors; `npm test` = 523/523 pass.
