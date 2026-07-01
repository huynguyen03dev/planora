# US-058 Harden analytics CSV export against formula injection

## Status

planned

## Lane

normal — 2 risk flags (public contract: the export file shape is client-visible;
security: the fix *adds* output encoding, it does not weaken validation, so no
hard gate). Surfaced by the deep review + senior validation (2026-06-30).

## Product Contract

The analytics CSV export is well-formed (every logical field stays in its own
column) and safe to open in a spreadsheet — user-controlled content can never be
interpreted as a formula.

## Relevant Product Docs

- `docs/product/analytics.md` — analytics export.
- `DESIGN.md` — n/a (data export, not UI).

## Acceptance Criteria

- The "Estimation Coverage" KPI row (`app/(authenticated)/(dashboard)/workspace/[slug]/dashboard/actions.ts:247`)
  no longer emits an unescaped embedded comma — every logical field is a single
  CSV column (today `Estimated: N, Unestimated: M` splits into two columns).
- `csvCell` (`dashboard/actions.ts:191-194`) neutralizes formula injection
  (CWE-1236): a **string** cell whose value begins with `=`, `+`, `-`, `@`, tab
  (`\t`), or CR (`\r`) is prefixed with a single quote (`'`) so a spreadsheet
  treats it as text; embedded commas/quotes/newlines stay quoted. Apply the
  formula-prefix step **before** the existing comma/quote-wrapping so both apply
  when needed. **Guard text cells only** — it must NOT touch numeric-typed inputs,
  or a legitimate negative value (a `-50.00%` change, a negative KPI) is mangled
  into `'-50` (see Design Notes trap).
- The one genuine injection vector is the user-controlled **card title**
  (`leadTimeRows[].cardTitle`, origin `card.title` via `engine.ts:756`), which
  already routes through `csvCell` at `dashboard/actions.ts:263` — so the fix is to
  add the formula guard *inside* `csvCell`, which that path already uses. The
  KPI/metadata rows carry workspace/board/member **IDs** (UUIDs), an IANA timezone
  string, booleans and numbers — no user free-text, and none can lead with a
  formula char; routing them through `csvCell` is cheap defense-in-depth, not
  closing an active vector (and is subject to the numeric carve-out above).

## Design Notes

- Two defects, one file: (a) the KPI row is hand-built with an inner comma and
  never passes through `csvCell`; (b) `csvCell` only quote-escapes — no
  formula-prefix guard — while user `cardTitle` values reach the CSV.
- Follow the OWASP CSV-injection guidance (prefix the risky leading char).
- **Trap — do not guard numbers.** `csvCell` is typed
  `(value: string | number | boolean | null)`. The Change columns emit values like
  `-50.00%` and KPIs can be negative; a naive guard on the stringified value turns
  `-50` into `'-50`. Guard the string branch only (or exclude numeric-typed input).
- The Estimation Coverage field is genuinely two data points
  (`estimatedCount` / `unestimatedCount`), and the export payload type **drops**
  `previous` / `change` for this KPI (`actions.ts:29-33`, vs engine `types.ts:56`).
  So "one column" means picking a single-field representation (e.g.
  `"Estimated: N / Unestimated: M"`, quoted), not restoring a diff.
- No change to *which* data is exported or to authorization (a separate story
  covers the analytics filter validation); this is output-encoding only.

## Dependencies

- Independent.

## Validation

`scripts/bin/harness-cli story update --id US-058 --unit 1 --integration 0 --e2e 0 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | **Net-new:** `csvCell` prefixes leading `= + - @` / tab / CR on string cells; a card title of `=cmd()` round-trips as inert text; a negative number (`-50`) is **not** mangled (numeric carve-out); an embedded **newline** stays quoted (not currently asserted); the Estimation Coverage row is a single field. **Regression (already in `tests/analytics-export.test.ts:165-206`):** embedded comma/quote stay quoted — extend that suite, do not duplicate it. |
| Integration | n/a. |
| E2E | n/a. |
| Platform | n/a. |
| Release | Open an export with a `=`-leading card title in a spreadsheet; confirm no formula executes and columns align. |

## Harness Delta

None.

## Evidence

Add after implementation.
