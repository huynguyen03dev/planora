# US-057 Unify @mention matching on the tested parser

## Status

implemented — 2026-07-01, `feat/us-057-unify-mention-matching`. Shipped the
**"unify + test, no behavior change"** option (the story's default behavior
change was NOT adopted). Added `resolveMentions(content, members)` to
`lib/mention.ts` — the single full-name longest-match resolver, matching the
prior inline scanners exactly — and reconciled both divergent copies onto it:
the `lib/notification.ts` notify scanner and the `card-detail-sheet.tsx`
`renderMentionContent` highlighter. Mention emails now go out via
`Promise.allSettled` (one failure no longer blocks or drops the rest).
`parseMentions` / `mentionMatchesName` remain the autocomplete-suggestion
helpers (prefix rule), unchanged. Proof: `lib/mention.test.ts` (+9
`resolveMentions` cases incl. multi-word, partial→no-match, boundary); the 5
`notifyMentioned` tests rewritten to drop the inert `./mention` mock and run the
real resolver, +4 cases (full-name resolve, partial→no-notify parity, multi-word,
`allSettled` non-abort). Full suite 559 green; tsc + lint clean on changed files.

## Lane

normal — 3 risk flags (existing behavior: this **changes who gets notified** — see
Matching Semantics; existing tests: the tested *matcher* is unused on the notify
path, and `notification.test.ts` mocks `./mention` so its 5 `notifyMentioned`
tests must be **rewritten**, not extended; multi-domain: mentions + notifications).
No hard gate. Surfaced by the deep review + senior validation (2026-06-30;
re-review 2026-07-01).

## Product Contract

An `@mention` in a comment notifies exactly the users the mention resolves to,
and the resolution logic has **one** implementation — the unit-tested one. What
the autocomplete suggests and what actually gets notified must agree.

## Matching Semantics (decision — override if wrong)

Unifying onto `lib/mention.ts` is a **behavior change**, not a pure cleanup: the
live notify scanner (`notification.ts:260-288`) matches only a member's **entire**
name, while the tested `mentionMatchesName` does **word-boundary prefix** matching.
The chosen rule for the unified path:

- **Resolve a mention iff the token matches exactly one live workspace member**
  (by the shared `mentionMatchesName` rule). This fixes the real bug — an
  unambiguous `@partial` submitted without picking a suggestion now notifies the
  right member — while avoiding notify-the-world.
- **Ambiguous prefix → resolve to none** (e.g. `@jo` when both "John" and "Joanna"
  are members): no notification, because there is no single unambiguous target and
  `mentionMatchesName` has no tie-break. Autocomplete still *suggests* both; the
  user disambiguates by picking, which inserts the full name.
- **Preserve multi-word display names.** `parseMentions` tokenizes on `/@(\w+)/`
  (a single word run) so it cannot capture "John Doe" the way today's scanner
  does. The shared resolver must match the mention against full member display
  names (e.g. longest-member-name-at-cursor — the current scanner's logic moved
  into `lib/mention.ts`), or multi-word-name mentions that work today will break.

> **Alternative (rejected as default):** keep strict full-name-only matching — zero
> behavior change, but it does not fix the dropped-partial bug this story's own
> contract promises. Flip to this if the team prefers no change to notify volume;
> it is a one-line matcher swap.

## Relevant Product Docs

- `docs/product/notifications.md` — mention → `MENTIONED` notification trigger.
- `docs/product/boards-and-cards.md` — comments / mentions on cards.

## Acceptance Criteria

- `notifyMentioned` resolves mentions through **one shared resolver in
  `lib/mention.ts`**. The two existing exports are not sufficient on their own:
  `parseMentions` (`/@(\w+)/`) cannot capture multi-word names and
  `mentionMatchesName` is a boolean word-boundary-prefix test. So this story **adds
  `resolveMentions(content, members)`** — the `notification.ts:260-288` scanner
  logic moved into `lib/mention.ts`, returning the matched members (+ boundaries for
  the highlighter) and enforcing the exactly-one-live-member rule; `parseMentions` /
  `mentionMatchesName` become helpers inside it. `lib/mention.test.ts` covers it.
- The two divergent copies are removed/reconciled: the inline longest-exact-name
  scanner in `lib/notification.ts:260-288` and the highlighter/matcher copy in
  `components/boards/card-detail-sheet.tsx:1230`.
- Resolution follows the Matching Semantics above: an **unambiguous** partial
  mention (`@jo` → exactly one member) resolves the same way in autocomplete and
  the notify path (today the inline scanner requires the full name, so a submitted
  partial silently produces no notification); an **ambiguous** prefix resolves to
  no one; multi-word display names still resolve.
- The `notifyMentioned` tests are **rewritten**, not just extended: the 5
  `notifyMentioned` tests (`notification.test.ts:60-138`) pass today with `./mention`
  mocked (`:35-39`) — resolution currently runs through the inline scanner, so the
  mock is inert and the matching logic is unproven. After unification those 5 must
  assert matcher parity (autocomplete vs notify), the ambiguous-prefix → no-notify
  case, and a multi-word-name resolution, with a mocked `db`. (The 5 `notifyDueDate`
  tests at `:140-224` are unaffected.)
- Mention emails are sent with `Promise.allSettled` instead of the serial
  `for...of await` at `lib/notification.ts:309` — no dropped failures, no blocking
  the request per recipient.

## Design Notes

- **Three implementations today** (validation-confirmed): `lib/mention.ts`
  (word-boundary **prefix** match, tested in `lib/mention.test.ts`, no caller on
  the notify path), `notification.ts:260` (inline **full-name** scanner, live —
  the notify path *is* covered by `notification.test.ts`, but those tests mock
  `./mention`, so the scanner's own matching logic is unproven), and
  `card-detail-sheet.tsx:1230` (full-name **highlighter** that returns React
  `<span>`s — sharing "the matcher" means extracting match *boundaries*, not a
  drop-in of a boolean). Collapse to one — the tested `lib/mention.ts`.
- **Divergence is narrow:** `selectMember` inserts the *full* name when a user
  picks a suggestion, so the mismatch only bites when a user submits a partial
  mention *without* selecting from the dropdown. Real, but not every mention.
- Domain rule to preserve: a mention resolves only to members of the card's
  workspace.
- Queries / API / Tables: none new. UI surface: `card-detail-sheet.tsx` mention
  highlighter shares the matcher.

## Dependencies

- Independent. (Notification `createMany` fan-out is a separate backlog item;
  this story only touches matching + the mention-email loop.)

## Validation

`scripts/bin/harness-cli story update --id US-057 --unit 1 --integration 0 --e2e 0 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | `mentionMatchesName` used by the notify path; autocomplete-vs-notify parity for an **unambiguous** partial mention; **ambiguous prefix → zero notifications**; a **multi-word display name** resolves; `notifyMentioned` creates one `MENTIONED` notification per resolved member (mocked `db`); `Promise.allSettled` email path surfaces per-recipient failures without aborting. |
| Integration | n/a (covered by unit with mocked `db` / `sendEmail`). |
| E2E | n/a — no harness. |
| Platform | n/a. |
| Release | Manual: comment an **unambiguous** `@partial` without picking a suggestion → correct member notified; an ambiguous prefix notifies no one. |

## Harness Delta

None planned.

## Evidence

Add after implementation.
