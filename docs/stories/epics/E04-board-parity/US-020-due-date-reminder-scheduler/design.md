# Design

> Revised after Oracle review (2026-06-25). Findings folded in: HIGH-1 (dedup
> invalidation on dueDate change), HIGH-2 (archive/delete filter), MEDIUM-1
> (claim-rollback on notify failure), MEDIUM-3 (unbounded OVERDUE window),
> MEDIUM-4 (per-card error isolation). See "Review findings" appendix.

## Domain Model

A **reminder milestone** is a point in the card's lifecycle at which a
notification should fire:

| Milestone | Trigger window (relative to `dueDate`) | Condition |
| --- | --- | --- |
| `DUE_SOON` | `dueDate - 24h <= now < dueDate` | card not completed, not archived, not deleted |
| `OVERDUE` | `now >= dueDate + 1h` | card not completed, not archived, not deleted |

A milestone is **due to fire** for a recipient when the card is in the trigger
window AND no reminder for that (card, recipient, milestone) has been sent yet.

Business rules:

- Completed cards (`completedAt IS NOT NULL`) never receive reminders, including
  the overdue one if they were completed before the window opened.
- Archived cards (`archivedAt IS NOT NULL`) and soft-deleted cards
  (`deletedAt IS NOT NULL`) are excluded from the scan entirely — an archived
  card is out of sight; a deleted card must never remind. *(HIGH-2)*
- Removed due dates (`dueDate IS NULL`) cancel any *unsent* reminders; sent ones
  stay (historical record).
- **Changed due dates invalidate prior reminders.** When the due-date setter
  updates `Card.dueDate` (set, change, or clear), it deletes all `CardReminder`
  rows for that card. This ensures a pushed-out due date gets a fresh DUE_SOON,
  and a card completed-then-reopened with a new date is re-reminded. *(HIGH-1)*
- Self-reminder suppression is irrelevant here — there is no single "actor"; the
  scheduler is the actor. All recipients (members + creator) are notified.

## Application Flow

```text
Scheduler tick (every 15 min)
  |
  v
SELECT cards WHERE "dueDate" IS NOT NULL
  AND "completedAt" IS NULL
  AND "archivedAt"  IS NULL        -- HIGH-2
  AND "deletedAt"   IS NULL        -- HIGH-2
  AND (
        ("dueDate" > now() AND "dueDate" <= now() + INTERVAL '24 hours')  -- DUE_SOON candidates
        OR
        ("dueDate" <= now() - INTERVAL '1 hour')                          -- OVERDUE candidates, UNBOUNDED low side (MEDIUM-3)
  )
  |
  v
For each card (wrapped in try/catch — MEDIUM-4):
  compute active milestones for current time
  resolve recipients = uniq(card.members[].userId + card.createdById)
  for each (recipient, milestone):
    --- claim-first with rollback (MEDIUM-1) ---
    try INSERT CardReminder(cardId, userId, milestone)
      on P2002 unique violation -> already sent, skip (count as skipped)
      on success -> proceed to notify
    notifyDueDate(...)           -- createNotification(type="DUE_DATE") + sendEmail
    if createNotification throws -> DELETE the CardReminder row (release the claim)
                                   so the next tick retries; count as error
```

`notifyDueDate` lives in `lib/notification.ts` next to `notifyMentioned`,
reusing the private `createNotification` helper and the best-effort
`sendEmail` pattern (email failure logs, never throws).

**Why claim-first + rollback (not notify-first):** The INSERT acts as the race
brake — only one of two overlapping ticks can win the claim, so only one
notifies. Notify-first would let both ticks create a notification before either
tried to claim, producing a duplicate. The cost of claim-first is one `DELETE`
in the rare failure path, which restores the claim for retry. No transaction is
needed (the codebase never uses `db.$transaction`; this stays consistent).

## Interface Contract

A single HTTP route drives the scheduler so it is identical in dev and prod:

```text
POST /api/cron/due-date-reminders
  Header: Authorization: Bearer ${CRON_SECRET}
  -> 200 { processed, notified, skipped, errors, elapsedMs }
  -> 401 if CRON_SECRET unset or bearer mismatch   -- route self-guards (LOW-3)
```

Idempotent: safe to call repeatedly; dedup prevents duplicate notifications.
Safe under overlapping ticks, dual drivers (in-process + external), and
restarts.

Two callers drive it (only one is active per environment):

1. **Dev / self-hosted** — an in-process `setInterval` in `server.ts` hits the
   route every 15 min with the secret. Lost on restart, harmless (next tick
   recovers via dedup).
2. **Prod (optional)** — external cron (system cron, GitHub Actions scheduled
   workflow, or a cron service) hits the route. Documented, not required for
   slice 1 to function.

> No public API contract change: this is a new internal route, not a client-facing
> endpoint. The route self-guards: if `CRON_SECRET` is unset it returns 401, so a
> misconfigured deploy never runs the scheduler unauthenticated.

## Data Model

`DUE_DATE` already exists in `enum NotificationType`. One new table for
idempotency:

```prisma
model CardReminder {
  id        String   @id @default(uuid())
  cardId    String
  card      Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  userId    String
  milestone String   // "DUE_SOON" | "OVERDUE"
  sentAt    DateTime @default(now())

  @@unique([cardId, userId, milestone])   // the dedup key
  @@index([cardId])
  @@map("cardReminder")
}
```

The `@@unique([cardId, userId, milestone])` is the dedup invariant: inserting a
duplicate throws (P2002), which the scheduler treats as "already sent, skip."
No ON CONFLICT upsert needed — try-insert-and-catch-P2002 is simplest in Prisma.

**Invalidation (HIGH-1):** the unique key does NOT encode `dueDate` by design —
encoding it would leak a microsecond timestamp into the key. Instead, the
due-date setter (`app/.../boards/[boardId]/actions.ts` update path) deletes
`CardReminder` rows for the card whenever `dueDate` changes:

```ts
// inside the card-update server action, when dueDate is in the patch:
if ("dueDate" in patch) {
  await db.cardReminder.deleteMany({ where: { cardId } });
}
```

This keeps the dedup key simple while still re-reminding after a date change.
`onDelete: Cascade` on the relation already cleans reminders when a card is
hard-deleted.

Indexes: add `@@index([dueDate, completedAt])` to `Card` if the scan isn't fast
enough; likely unnecessary at current scale.

Also widen the cast in `lib/notification.ts` `createNotification`:

```ts
type: data.type as NotificationType,  // was: "ASSIGNED" | "COMMENT" | "INVITE" | "MENTIONED"
```

## UI / Platform Impact

- No new UI in slice 1. The existing notification bell + dropdown render
  `DUE_DATE` notifications via the generic renderer — **confirmed no type
  switch excludes it** (Oracle LOW-5). `linkUrl` is `/boards/${boardId}` for
  consistency with every other notification helper (LOW-2).
- Email: new template `emails/due-date-email.tsx` mirroring
  `emails/mention-email.tsx` (card title, board name, due time, card link).
- `server.ts` gains a single `setInterval` block guarded by `CRON_SECRET` being
  set; if unset, the in-process driver is a no-op (prod uses external cron).
  The interval **must** be cleared on shutdown (MEDIUM-2):

  ```ts
  const reminderInterval = setInterval(tick, 15 * 60 * 1000);

  const shutdown = () => {
    clearInterval(reminderInterval);
    io.close();
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  ```

- **Single-instance requirement (LOW-4):** the in-process interval assumes one
  server process. Document that the app must not run in PM2 cluster /
  multi-replica mode for the in-process driver (external cron + the idempotent
  route is the multi-instance-safe path). At current scale this is a
  non-issue — no PM2/Docker config exists today.

## Observability

- The cron route returns a JSON tally `{ processed, notified, skipped, errors,
  elapsedMs }` and logs a structured line per tick: `[due-date-scheduler]
  processed=N notified=M skipped=K errors=E elapsedMs=...`.
- Per-card failures are caught and logged (`[due-date-scheduler] Failed to
  process card <id>: ...`) so one bad card doesn't abort the tick (MEDIUM-4).
- `notifyDueDate` logs email-send failures via the existing
  `[notification] Failed to send ...` pattern — never throws.
- Dedup collisions (P2002) are counted as `skipped`, not errors.

## Alternatives Considered

1. **In-process `setInterval` only, no HTTP route.** Simplest, but can't be
   driven by external cron and runs scheduler logic inside the long-lived
   server process mixed with request handling. Rejected — the HTTP route is a
   thin layer that makes the same code testable and prod-deployable.
2. **Dedup via the `Notification` table (no new table).** Query
   `Notification(type=DUE_DATE, userId, linkUrl=cardUrl)` before firing. Rejected
   as primary — it overloads `linkUrl` as a join key and can't cleanly encode the
   `milestone`, making "fire DUE_SOON and OVERDUE" ambiguous. Kept as a fallback
   if a new table is deemed too heavy.
3. **Dedup via `Notification.metadata Json?`** (add a JSON column). Fewer rows
   than a dedicated table, but Prisma JSON filtering is awkward and it mixes
   scheduler bookkeeping into the notification log. Rejected.
4. **A real job queue (BullMQ / Bree / Inngest).** Overkill for two milestones
   per card; introduces Redis/worker infra the project doesn't have. Deferred to
   when cadence complexity grows.
5. **Recompute reminder schedule on due-date set** (event-driven, no scheduler).
   Catches the DUE_SOON window but not OVERDUE (which depends on "still
   incomplete at dueDate+1h"), and loses reminders across restarts. Scheduler
   poll is the robust choice for a stateless web process.
6. **Encode `dueDate` in the dedup key** (`@@unique([cardId, userId, milestone,
   dueDate])`) instead of invalidating on change. Rejected — leaks a
   microsecond timestamp into the key (reminder fires once per exact-ts),
   forcing a day-bucket column. Setter-side invalidation is simpler and matches
   the existing "removed due dates cancel reminders" rule.

## Review findings (Oracle, 2026-06-25)

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| HIGH-1 | 🔴 | Dedup key blocks re-reminders after dueDate change | Fixed — setter deletes `CardReminder` rows on dueDate change |
| HIGH-2 | 🔴 | Archived/deleted cards not filtered from scan | Fixed — added to scan WHERE + business rules |
| MEDIUM-1 | 🟡 | INSERT-first risks lost notification on notify failure | Fixed — claim-first + rollback DELETE in catch |
| MEDIUM-2 | 🟡 | No SIGTERM/SIGINT handler → process won't exit | Fixed — shutdown handler clears interval + closes io/server |
| MEDIUM-3 | 🟡 | OVERDUE scan window bounded but shouldn't be | Fixed — split into two conditions, OVERDUE arm unbounded low |
| MEDIUM-4 | 🟡 | No per-card try/catch in tick loop | Fixed — each card wrapped, `errors` in tally |
| LOW-1 | 🔵 | Email volume per-user cap | Deferred to validation.md follow-up slice |
| LOW-2 | 🔵 | `linkUrl` unspecified | Fixed — `/boards/${boardId}` |
| LOW-3 | 🔵 | Route should self-guard missing CRON_SECRET | Fixed — returns 401 if unset |
| LOW-4 | 🔵 | Single-instance requirement undocumented | Fixed — noted in UI/Platform Impact |
| LOW-5 | ✅ | Notification UI excludes DUE_DATE? | Confirmed no — generic renderer handles all types |
