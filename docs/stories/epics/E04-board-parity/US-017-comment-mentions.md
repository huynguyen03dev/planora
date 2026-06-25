# US-017 @mention parsing in comments → MENTIONED notifications

## Status

implemented

## Lane

normal (with stronger validation — touches the comment + notification boundary)

Spec slice from `docs/stories/initiatives/IN-01-production-readiness-and-trello-parity.md`
(Theme B — Daily-use Parity, "@mention parsing in comments → `MENTIONED`
notifications"). The `MENTIONED` notification type exists in the Prisma schema
but **never fires**. `createCommentAction` already notifies card members/creators
via `notifyCommentOnCard` (type `COMMENT`), but does not parse `@username`
patterns in comment content. This slice closes that gap.

Risk flags: public-contract (new trigger behavior users will rely on),
existing-behavior (touches the comment + notification flow already in place),
weak-proof (notification triggers are untested). ~3 effective flags → normal
lane with a security/integration suite on the mention path. No hard gate:
reuses existing `comment:["create"]` permission, no external system, no schema
migration (`MENTIONED` enum value already exists).

## Scope

**@mentions in card comments only.** The comment content is parsed for
`@username` patterns, matched against workspace members, and triggers
`MENTIONED` notifications for matched users (excluding the commenter). Deferred:

- **Rich text / markdown mentions** — plain `@username` text only, no
  markdown/HTML parsing.
- **Mention autocomplete in the comment input** — UI polish, not the data
  contract; tracked separately.
- **Email notifications for mentions** — in-app + realtime only for this slice;
  email template can be added later.
- **Mentions in card descriptions or other surfaces** — comments only.

## Product Contract

When a user posts a comment containing `@username` (where `username` matches a
workspace member's display name), each mentioned user (who is not the commenter)
receives a `MENTIONED` notification. The notification appears in-app and is
pushed realtime to the user's socket. Duplicate mentions of the same user in one
comment produce one notification. Self-mentions are ignored.

## Relevant Product Docs

- `docs/product/notifications.md` — notification model, triggers, delivery

## Acceptance Criteria

- A `notifyMentioned` function in `lib/notification.ts` parses `@username`
  patterns from comment content, resolves usernames to workspace member user
  IDs, and creates `MENTIONED` notifications for each matched user (excluding
  the commenter).
- Username matching is **case-insensitive** and matches against `user.name`
  within the workspace's member set. A `@john` matches a member named "John
  Doe" only if "john" is a prefix/word-boundary match of the name (not
  substring). Exact rule: `@mention` matches if the workspace member's `name`
  contains a word starting with the mention text (case-insensitive).
- Duplicate mentions (`@alice @alice` in one comment) produce exactly one
  notification to Alice.
- Self-mentions (`@self` when the commenter is that user) are ignored.
- The `createCommentAction` in `app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts`
  calls `notifyMentioned` after `notifyCommentOnCard` (best-effort, same error
  pattern — catch + console.error, does not roll back the comment).
- The notification title follows the pattern: `Mentioned in "Card Title"`.
- The notification message follows the pattern: `User Name mentioned you in a
  comment on "Card Title" in "Board Title".`.
- The notification `linkUrl` points to `/boards/${boardId}` (same as comment
  notifications).
- A denied caller (signed out / viewer / wrong workspace) cannot create
  comments at all — the existing `createCommentAction` gate handles this; no
  new auth path is introduced.

## Design Notes

- **Parsing:** Extract all `@word` tokens from comment content using a regex
  like `/@(\w+)/g`. Collect unique mentions (lowercased) to avoid duplicate
  notifications.
- **Resolution:** Query workspace members with matching `user.name`:
  `db.workspaceMember.findMany({ where: { workspaceId, user: { name: { in: mentionNames, mode: 'insensitive' } } }, select: { userId: true, user: { select: { name: true } } } })`.
  Then do a word-boundary prefix match in JS to implement the "starts a word"
  rule (not raw SQL substring).
- **Dedup:** Use a `Set<string>` of resolved `userId`s before creating
  notifications.
- **Exclusion:** Filter out the commenter's `userId` from the recipient set.
- **Notification creation:** Reuse existing `createNotification` with
  `type: "MENTIONED"`, same as other notification types.
- **Integration point:** Add `notifyMentioned` call in `createCommentAction`
  after `notifyCommentOnCard`, inside the same try/catch block. Pass the
  comment `content`, `cardId`, `cardTitle`, `boardId`, `boardTitle`,
  `commenterUserId`, `commenterName`, and `workspaceId`.
- **No schema change:** `NotificationType.MENTIONED` already exists in Prisma.
  `createNotification` type cast at line 88 currently allows `"ASSIGNED" |
  "COMMENT" | "INVITE"` — add `"MENTIONED"` to the union.
- **Realtime:** `createNotification` already calls `emitNotificationNew` — no
  new socket event needed.

## Validation

When updating durable proof status, use numeric booleans:
`scripts/bin/harness-cli story update --id US-017 --unit 1 --integration 1 --e2e 0 --platform 0`.

| Layer | Expected proof |
| --- | --- |
| Unit | `lib/mention.test.ts` — parseMentions regex extraction, dedup, case-insensitive matching, word-boundary prefix rule, self-exclusion, empty input, no-match input. |
| Integration | `tests/server-actions/list-card.test.ts` — `createCommentAction` with mention content: A1 auth gate (existing), A2 permission gate (existing), A3 workspace isolation (existing), plus new mention-specific cases: mentioned user receives MENTIONED notification, self-mention ignored, duplicate mention deduped, non-workspace member name not matched. |
| E2E | Manual browser QA: post comment with `@username`, verify mentioned user sees notification in bell + realtime push. Automated E2E deferred (same board-UI debt as US-005/013/014/015). |
| Platform | n/a |
| Release | `npx tsc --noEmit`, `npm run lint`, `npm test` green. |

## Harness Delta

Fifth child of epic `E04-board-parity` (Theme B of IN-01). No new artifact
locations. Establishes the mention-parsing pattern that could be reused for
card descriptions or other surfaces in future slices.

## Evidence

_Add commands, reports, screenshots, or links after validation exists._
