# US-058 Harden analytics CSV export against formula injection

## Status

implemented

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

`csvCell` moved out of the `"use server"` actions file into `lib/csv.ts` —
Next.js requires every export of a `"use server"` module to be an async
function, so the synchronous helper couldn't be exported for direct unit
testing in place. `dashboard/actions.ts` now imports it from `@/lib/csv`.

## Evidence

- `lib/csv.ts` (new): `csvCell` extracted verbatim + the formula-prefix guard
  (`typeof value === "string" && /^[=+\-@\t\r]/.test(value)`), applied before
  the existing comma/quote-wrap check. `lib/csv.test.ts` (new, 13 tests) unit
  tests it directly, including the numeric carve-out (`csvCell(-50)` stays
  `"-50"`; `csvCell("-50")` — a string that merely looks numeric — still gets
  guarded to `"'-50"`, which is correct: the carve-out is on the JS type of the
  input, not on whether the text looks like a number).
- **Correction to plan:** the numeric-carve-out AC item can't be proven through
  `generateAnalyticsCSV`'s `leadTimeRows` path, because `row.leadTimeHours` is
  already `.toFixed(2)`'d to a **string** before it reaches `csvCell` — by the
  time it arrives, `typeof value` is `"string"`, indistinguishable from real
  text. (Lead time is a duration and can't be negative in practice, so this
  isn't a live bug — but it means the carve-out is a property of `csvCell`
  itself, tested directly in `lib/csv.test.ts`, not an integration-level case.)
- Estimation Coverage row fix: initially routed the **whole** 4-field row
  through `.map(csvCell)`, which incorrectly formula-guarded the static `"-"`
  placeholder into `"'-"` (caught by the new test). Fixed to only pass the one
  field that actually needs escaping — `Estimated: N, Unestimated: M` — through
  `csvCell`; the static labels/placeholders are joined as plain literals.
  Output: `Estimation Coverage (%),50.00,-,"Estimated: 3, Unestimated: 2"`.
- `tests/analytics-export.test.ts` extended (not duplicated) with: formula-char
  prefix on a card title, all five trigger chars (`= + - @` tab CR — note CR
  additionally triggers the pre-existing quote-wrap since `\r` is in
  `/[",\n\r]/`, tab does not), embedded newline stays quoted, Estimation
  Coverage single-column. 540/540 project tests pass; lint unchanged at 100
  pre-existing problems (none new).
- PR: (opened after this commit) into `dev`.
