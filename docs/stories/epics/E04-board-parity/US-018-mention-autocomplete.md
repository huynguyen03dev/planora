# US-018 Mention autocomplete UI in comment composer

## Status

implemented

## Lane

normal (UI-only — no new Server Action, no schema change, no auth path)

Follow-up to US-017 (backend mention parsing + MENTIONED notifications). US-017
added `notifyMentioned` which parses `@username` text after submit. This story
adds the **autocomplete dropdown** so users can discover and select workspace
members when typing `@` in the comment textarea — the GitHub/Slack-style UX.

Risk flags: public-contract (new client-visible behavior), existing-behavior
(touches the comment composer UI). ~2 flags → normal lane. No hard gate: reuses
existing `comment:["create"]` permission, no schema migration, no new Server
Action.

## Scope

**Comment composer in the card detail sheet only.** When a user types `@`
followed by characters, a dropdown appears showing workspace members whose
names match the typed prefix. Selecting a member inserts their display name
into the textarea. Deferred:

- **Mentions in card descriptions** — comments only.
- **Mention in other surfaces** (activity, checklist names) — out of scope.
- **Rich text / markdown rendering of mentions** — plain text display for now.
- **Keyboard navigation of the dropdown** — mouse/click only for this slice;
  keyboard nav (arrow keys + Enter) can be added as polish.

## Product Contract

When typing in the comment composer textarea, typing `@` triggers a dropdown
of workspace members. As the user continues typing after `@`, the list filters
to members whose name starts with the typed prefix (case-insensitive,
word-boundary matching — same rule as US-017 `mentionMatchesName`). Clicking a
member inserts their full display name at the cursor position, replacing the
`@prefix` text. The dropdown closes after selection. Pressing Escape or clicking
outside closes the dropdown without inserting.

## Relevant Product Docs

- `docs/product/notifications.md` — mention trigger contract (US-017)

## Acceptance Criteria

- The `CommentComposer` component receives `assignableMembers` (already
  available as a prop on the parent `CardDetailSheet`) — type
  `AssignableWorkspaceMemberRecord[]` (`{ id, name, image, email, role }`).
- When the user types `@` in the textarea, a dropdown appears below the
  cursor position showing all workspace members (name + optional avatar).
- As the user types after `@` (e.g., `@jo`), the dropdown filters to members
  whose name contains a word starting with the typed prefix (case-insensitive).
  Use the same `mentionMatchesName` logic from US-017 (import from
  `lib/notification.ts`).
- Clicking a member in the dropdown inserts their display name at the `@`
  position (e.g., typing `@jo` and clicking "John Doe" produces `@John Doe `).
- The dropdown closes after selection, on Escape key, or on click outside.
- If no members match the prefix, the dropdown shows a "No matches" message.
- The dropdown renders as a positioned panel (shadcn `Popover` or custom
  absolute-positioned div) below the textarea, max 200px height with scroll.
- The dropdown shows the member's avatar (if available) + name + role badge.
- Self is included in the dropdown (users can mention themselves if they want).

## Design Notes

- **Component:** Add a `MentionDropdown` component inside
  `components/boards/card-detail-sheet.tsx` (or a new file
  `components/boards/mention-dropdown.tsx`). It receives the filtered members,
  position, onSelect, and onClose callbacks.
- **State:** Add state to `CommentComposer` for: `mentionQuery` (the text
  after `@`), `mentionStartIndex` (cursor position of `@`), `showMention`
  (boolean).
- **Detection:** On textarea `onChange`, check if the character before the
  cursor is `@` or if we're in an active mention (the text between
  `mentionStartIndex` and cursor matches `@\w*`). If `@` is detected, set
  `showMention: true` and `mentionStartIndex`. If the user types a space or
  the `@` is deleted, close the dropdown.
- **Filtering:** Use `mentionMatchesName(mentionQuery, member.name)` from
  `lib/notification.ts` to filter `assignableMembers`.
- **Insertion:** On select, replace the text from `mentionStartIndex` to
  cursor with `@${member.name} ` (add trailing space). Update `content`
  state and close dropdown.
- **Positioning:** Place the dropdown directly below the textarea. Use
  `textarea.selectionStart` to estimate cursor line, or simply anchor below
  the textarea (simpler, acceptable for v1).
- **shadcn:** Run `npx shadcn add popover` to get the Popover component, OR
  build a simple absolute-positioned div with a ref-based click-outside
  handler. Popover is preferred for consistency.
- **Avatar:** Use shadcn `Avatar` component (`npx shadcn add avatar`) or a
  simple `<img>` with fallback initials, matching the existing `CommentItem`
  avatar pattern.
- **No new API:** The `assignableMembers` list is already fetched server-side
  and passed as a prop. No client-side fetch needed.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-018 --unit 1 --integration 0 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | Test the mention detection logic: `extractMentionQuery(text, cursorPos)` returns `{ query, startIndex }` or `null`. Test filtering with `mentionMatchesName`. Test insertion logic. |
| Integration | n/a — pure client-side UI, no Server Action change. |
| E2E | Manual browser QA: type `@` in comment textarea → dropdown appears with workspace members → type `@jo` → filters to "John Doe" → click → inserts `@John Doe ` → post comment → mention notification fires (US-017 backend). |
| Platform | n/a |
| Release | `npx tsc --noEmit`, `npm run lint`, `npm test` green. |

## Harness Delta

Sixth child of epic `E04-board-parity` (Theme B of IN-01). No new artifact
locations. Completes the mention feature started in US-017.

## Evidence

_Add commands, reports, screenshots, or links after validation exists._
