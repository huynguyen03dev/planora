# US-055 Non-color signal for unread-notification state

## Status

planned

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

_Pending implementation._
