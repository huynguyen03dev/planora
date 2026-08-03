/**
 * US-083 — locked demo-path rehearsal from the SEEDED fixture state.
 *
 * One continuous test() runs the entire locked demo path
 * (overview.md "Demo path (locked)") in order, on the real UI, starting from
 * the W3-seeded fixture (`planora-us083-demo`, owner + collaborator, 2 boards
 * / 5 lists / 7 cards, relative due dates):
 *
 *   1. /today — the seeded relative-date relationships render in the four
 *      buckets (owner: +0 → Due Today, +1 and +7 → Due This Week, completed
 *      card excluded).
 *   2. Quick capture — owner captures from /today via the bare C shortcut;
 *      the deterministic default (Product Roadmap → Inbox) is asserted.
 *   3. Cross-client realtime — the collaborator, already loaded on the board
 *      (W1 presence barrier + connect-resync settle + masking tripwire),
 *      sees the captured card appear LIVE.
 *   4. Archive card → Undo (real restoreCardAction; in place, tripwire
 *      clean; DB archivedAt NULL).
 *   5. Archive list → Undo (real restoreListAction; list and its cards back;
 *      DB asserts).
 *   6. Live invitation badge — the owner invites a registered outsider
 *      through the real members dialog; the outsider's already-loaded page
 *      (tripwire + settle barrier) shows the badge increment with no reload;
 *      the inbox lists the invitation.
 *
 * This spec is NOT an independent proof of each step (W1/W2/W6/W7/W8 specs
 * already prove each surface): it proves the CONTINUOUS path runs on the
 * same fixture in one sitting — the rehearsal itself.
 *
 * SELF-PROVISIONING (CI-safe): the spec has no external precondition. In its
 * setup it (a) ensures the two fixed demo users exist — signing them up
 * through the REAL sign-up form + Mailpit verification when absent, or
 * reusing them only when they authenticate with the documented demo password
 * (`demo-password-123`); incompatible state fails loudly with the remedy —
 * and (b) re-seeds the reserved demo fixture through the CHECKED-IN
 * `npm run demo:seed` code path, so every run starts from a fresh, same-day
 * fixture (the seed fails closed on a mismatched ownership marker). A fresh
 * CI database therefore needs nothing but Postgres + Mailpit.
 *
 * Teardown: the SEEDED fixture is preserved exactly — only rows created by
 * THIS rehearsal are removed (the captured card + its history rows and the
 * outsider user + invitation, all scoped to the demo workspace / the
 * rehearsal's own generated email); the demo workspace itself is never
 * deleted.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

import { test, expect, type Browser, type Page } from "@playwright/test";

import {
  signUp,
  inviteMember,
  archiveList,
  watcherAvatars,
  cardInListById,
} from "./helpers/app";
import { clearMailbox } from "./helpers/mail";
import {
  getCardIdByTitle,
  getListIdsByTitle,
  getCardArchivedAt,
  getListArchivedAt,
  listExists,
  cleanup,
  disconnect,
} from "./helpers/db";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const REPO_ROOT = path.resolve(__dirname, "..");

/** The documented demo-user password (DEMO_RUNBOOK + US-083 packet). */
const PASSWORD = "demo-password-123";
const OWNER_EMAIL = "owner@example.com";
const COLLABORATOR_EMAIL = "collaborator@example.com";
const DEMO_SLUG = "planora-us083-demo";

const DEMO_USERS = [
  { name: "Demo Owner", email: OWNER_EMAIL },
  { name: "Demo Collaborator", email: COLLABORATOR_EMAIL },
] as const;

let outsiderEmail = "";

/** The seeded demo workspace id — read once after the fixture is ensured. */
let demoWorkspaceId: string | null = null;

test.setTimeout(300_000);

async function getDemoWorkspaceId(): Promise<string> {
  const { rows } = await pool.query(`SELECT id FROM "workspace" WHERE slug = $1`, [DEMO_SLUG]);
  if (!rows[0]) {
    throw new Error(
      `demo:seed did not produce workspace "${DEMO_SLUG}" — see the seed output above.`,
    );
  }
  return rows[0].id;
}

test.afterAll(async () => {
  if (!demoWorkspaceId) {
    // The fixture was never ensured (setup failed) — nothing of ours to clean.
    await pool.end();
    await disconnect();
    return;
  }

  // Remove ONLY rows created by THIS rehearsal, scoped to the demo workspace
  // (title-scoped deletes could touch a same-titled card in another
  // workspace — reviewer finding, correction pass 2026-08-02).
  await pool
    .query(
      `DELETE FROM "cardHistoryEvent"
        WHERE "workspaceId" = $1
          AND "cardId" IN (
            SELECT c.id FROM "card" c
            JOIN "list" l ON l.id = c."listId"
            JOIN "board" b ON b.id = l."boardId"
            WHERE b."workspaceId" = $1 AND c.title = 'Rehearsal capture card'
          )`,
      [demoWorkspaceId],
    )
    .catch(() => {});
  await pool
    .query(
      `DELETE FROM "card"
        WHERE "listId" IN (
          SELECT l.id FROM "list" l
          JOIN "board" b ON b.id = l."boardId"
          WHERE b."workspaceId" = $1
        ) AND title = 'Rehearsal capture card'`,
      [demoWorkspaceId],
    )
    .catch(() => {});
  await pool
    .query(`DELETE FROM "invitation" WHERE email = $1 AND "organizationId" = $2`, [
      outsiderEmail,
      demoWorkspaceId,
    ])
    .catch(() => {});
  // The outsider user is generated with a unique per-run email — deleting it
  // (cascades sessions/accounts) removes only this rehearsal's user.
  await cleanup({ emails: [outsiderEmail] });

  // Fixture preservation proof: the seeded logical shape is intact after the
  // rehearsal (the rehearsal card + history rows are gone; the demo workspace
  // was never deleted).
  const { rows: shape } = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM "board" b WHERE b."workspaceId" = $1) AS boards,
       (SELECT count(*)::int FROM "list" l JOIN "board" b ON b.id = l."boardId" WHERE b."workspaceId" = $1) AS lists,
       (SELECT count(*)::int FROM "card" c JOIN "list" l ON l.id = c."listId" JOIN "board" b ON b.id = l."boardId" WHERE b."workspaceId" = $1 AND c."archivedAt" IS NULL) AS cards`,
    [demoWorkspaceId],
  );
  expect(shape[0]).toEqual({ boards: 2, lists: 5, cards: 7 });

  await pool.end();
  await disconnect();
});

/** Masking tripwire (W1 discipline — same window rules as the other specs). */
function armProofTripwire(page: Page, routePathname: string) {
  const counts = { reloads: 0, wsOpens: 0, wsCloses: 0, routePosts: 0 };
  page.on("load", () => {
    counts.reloads += 1;
  });
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/socket.io/")) return;
    counts.wsOpens += 1;
    ws.on("close", () => {
      counts.wsCloses += 1;
    });
  });
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === routePathname) {
      counts.routePosts += 1;
    }
  });
  return {
    counts,
    check(baseline: typeof counts, windowLabel: string, opts: { expectNoRoutePosts?: boolean } = {}) {
      expect(counts.reloads, `${windowLabel}: full reload during the proof window`).toBe(baseline.reloads);
      expect(counts.wsOpens, `${windowLabel}: socket (re)connect during the proof window`).toBe(baseline.wsOpens);
      expect(counts.wsCloses, `${windowLabel}: socket disconnect during the proof window`).toBe(baseline.wsCloses);
      if (opts.expectNoRoutePosts) {
        expect(counts.routePosts, `${windowLabel}: route re-render POST during the proof window`).toBe(baseline.routePosts);
      }
    },
  };
}

/** Sign the seeded users in through the REAL sign-in form. */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/boards/, { timeout: 30_000 });
}

/**
 * Existing demo users may be reused ONLY when they authenticate with the
 * documented demo password. Probe through the real sign-in form and fail
 * loudly (with the remedy) on incompatible state — wrong password, or an
 * existing-but-unverified user (the app gates unverified sessions on
 * /verify-email). A missing user is signed up fresh below instead.
 */
async function probeExistingUser(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  const reachedBoards = page.waitForURL(/\/boards/, { timeout: 10_000 }).then(
    () => "boards" as const,
    () => "timeout" as const,
  );
  const verdict = await reachedBoards;
  if (verdict === "boards" || /\/boards/.test(new URL(page.url()).pathname)) return;

  const url = new URL(page.url());
  const errorAlert = page.getByRole("alert").filter({ hasText: /invalid email or password/i });
  if (url.pathname === "/verify-email" || (await errorAlert.count()) === 0) {
    throw new Error(
      `Rehearsal setup: demo user ${email} exists but is NOT verified (or the sign-in did ` +
        "not reach /boards). Verify it through the real email flow or delete the row " +
        "(`DELETE FROM \"user\" WHERE email = '<email>'`); the rehearsal will re-sign-up " +
        "and re-verify it.",
    );
  }
  throw new Error(
    `Rehearsal setup: demo user ${email} exists but does NOT authenticate with the ` +
      `documented demo password ("${PASSWORD}"). Reset its password to the documented ` +
      "value or delete the row (`DELETE FROM \"user\" WHERE email = '<email>'`); the " +
      "rehearsal will re-sign-up and re-verify it.",
  );
}

/**
 * CI-safe self-provisioning: ensure the two fixed demo users (real sign-up +
 * Mailpit verification when absent; password-probed reuse when present), then
 * re-seed the reserved fixture through the CHECKED-IN `demo:seed` code path so
 * every run starts fresh and same-day. No /tmp prerequisite, no skip.
 */
async function ensureDemoFixture(browser: Browser): Promise<void> {
  for (const user of DEMO_USERS) {
    const { rows } = await pool.query(`SELECT id, "emailVerified" FROM "user" WHERE email = $1`, [
      user.email,
    ]);
    if (rows[0]) {
      const probePage = await (await browser.newContext()).newPage();
      try {
        await probeExistingUser(probePage, user.email);
      } finally {
        await probePage.close();
      }
    } else {
      // The real sign-up flow needs an unambiguous Mailpit inbox for the
      // fixed demo email (a stale verification link from a previous run would
      // otherwise be picked up first). Established pattern (helpers/mail.ts).
      await clearMailbox();
      const page = await (await browser.newContext()).newPage();
      try {
        await signUp(page, { name: user.name, email: user.email, password: PASSWORD });
      } finally {
        await page.close();
      }
    }
  }

  // Seed through the checked-in script (scripts/demo-fixture.ts + lib/):
  // replaces an existing marker-matching workspace (fresh, same-day) and
  // FAILS CLOSED on a mismatched marker or missing/unverified users.
  const result = execFileSync(
    "npm",
    ["run", "demo:seed", "--", "--owner-email", OWNER_EMAIL, "--collaborator-email", COLLABORATOR_EMAIL],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: 120_000 },
  );
  process.stdout.write(result);
}

/** The /today `<section>` whose heading has the exact name. */
function todaySection(page: Page, name: string) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

function quickCaptureDialog(page: Page) {
  return page.getByRole("dialog", { name: "Quick capture" });
}

function undoSnackbar(page: Page) {
  return page.getByRole("status").filter({ hasText: /archived/i });
}

function undoButton(page: Page) {
  return page.getByRole("button", { name: /^Undo archive of/ });
}

function bell(page: Page) {
  return page.getByRole("button", { name: /^Notifications/ });
}

test("the locked demo path runs continuously from the seeded fixture", async ({ browser }) => {
  // ── Setup: self-provision users + fresh same-day fixture (no precondition). ─
  await ensureDemoFixture(browser);
  demoWorkspaceId = await getDemoWorkspaceId();

  const ownerPage = await (await browser.newContext()).newPage();
  const collabPage = await (await browser.newContext()).newPage();

  // ── Step 1: /today shows the seeded relative-date relationships. ─────────
  await signIn(ownerPage, OWNER_EMAIL);
  await ownerPage.goto("/today");
  await expect(todaySection(ownerPage, "Due Today").getByText("Review graduation demo script")).toBeVisible();
  await expect(todaySection(ownerPage, "Due This Week").getByText("Prove realtime card updates")).toBeVisible();
  await expect(todaySection(ownerPage, "Due This Week").getByText("Prepare weekly planning")).toBeVisible();
  await expect(todaySection(ownerPage, "Overdue").getByText("Nothing here yet.")).toBeVisible();
  await expect(todaySection(ownerPage, "Later").getByText("Nothing here yet.")).toBeVisible();
  // Completed card excluded (owner-assigned, -3d, completed):
  await expect(todaySection(ownerPage, "Overdue").getByText("Document safety invariants")).toHaveCount(0);
  // Collaborator's own overdue card is not on the owner's /today (it is
  // collaborator-assigned): Overdue stays empty above.

  // ── Steps 2–3: collaborator joins the board; owner captures from /today;
  //    the collaborator sees the card live (W1 barriers). ──────────────────
  await signIn(collabPage, COLLABORATOR_EMAIL);
  const { rows: boardRows } = await pool.query(
    `SELECT b.id, b.title FROM "board" b JOIN "workspace" w ON w.id = b."workspaceId" WHERE w.slug = $1 ORDER BY b.title`,
    [DEMO_SLUG],
  );
  const roadmapId = boardRows.find((b: { title: string }) => b.title === "Product Roadmap").id;
  const tripwire = armProofTripwire(collabPage, `/boards/${roadmapId}`);
  const resyncSettled = collabPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/boards/${roadmapId}`,
    { timeout: 20_000 },
  );
  await ownerPage.goto(`/boards/${roadmapId}`);
  await collabPage.goto(`/boards/${roadmapId}`);
  await expect(watcherAvatars(ownerPage)).toHaveCount(2);
  await expect(watcherAvatars(collabPage)).toHaveCount(2);
  await resyncSettled;
  const inboxId = (await getListIdsByTitle(roadmapId))["Inbox"];
  await expect(cardInListById(collabPage, inboxId, "Rehearsal capture card")).toHaveCount(0);
  const baseline = { ...tripwire.counts };

  // Owner captures from /today with the bare C shortcut; the deterministic
  // default target is Product Roadmap → Inbox.
  await ownerPage.goto("/today");
  await expect(ownerPage.getByRole("button", { name: "Quick capture" })).toHaveAttribute(
    "data-shortcuts-ready",
    "true",
  );
  await ownerPage.keyboard.press("c");
  await expect(quickCaptureDialog(ownerPage)).toBeVisible();
  await ownerPage.getByRole("textbox", { name: "Title" }).fill("Rehearsal capture card");
  await ownerPage.getByRole("button", { name: "Create card" }).click();
  await expect(ownerPage.getByRole("status")).toContainText("Card created");

  // Live on the collaborator's already-loaded board — no reload/reconnect/
  // route POST in the window.
  await expect(cardInListById(collabPage, inboxId, "Rehearsal capture card")).toBeVisible();
  tripwire.check(baseline, "rehearsal quick-capture live window", { expectNoRoutePosts: true });

  // ── Step 4: archive the captured card → Undo restores it in place. ───────
  // The shared archiveCard helper's `Archive card ... .first()` is ambiguous
  // on this board: the seeded fixture has a COMPLETED card ("Document safety
  // invariants"), and completed card faces render their own
  // aria-label="Archive card" button (US-069) which sorts BEFORE the sheet
  // portal in DOM order — the first rehearsal run archived the completed card
  // instead (RED, run log). Pin the sheet-scoped archive here and assert the
  // archived/offered/restored card by title + DB state (non-vacuous).
  await ownerPage.goto(`/boards/${roadmapId}`);
  await expect(ownerPage.getByText("Rehearsal capture card", { exact: true })).toBeVisible();
  const captureCardId = await getCardIdByTitle(roadmapId, "Rehearsal capture card");
  const completedCardId = await getCardIdByTitle(roadmapId, "Document safety invariants");
  const ownerTripwire = armProofTripwire(ownerPage, `/boards/${roadmapId}`);

  await ownerPage.locator(`[data-rfd-draggable-id="${captureCardId}"]`).click();
  const sheet = ownerPage.getByRole("dialog", { name: "Rehearsal capture card" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Archive card" }).click();
  await ownerPage
    .getByRole("alertdialog", { name: "Archive this card?" })
    .getByRole("button", { name: "Archive card" })
    .click();
  await expect(undoButton(ownerPage)).toHaveAccessibleName("Undo archive of Rehearsal capture card");
  expect(await getCardArchivedAt(captureCardId), "the captured card is the archived one").not.toBeNull();
  expect(await getCardArchivedAt(completedCardId), "the seeded completed card stays live").toBeNull();
  // Settle the acting page's own post-archive work (revalidate RSC refresh,
  // sheet-close replace) before the baseline, so the undo window starts from
  // a quiescent page (W8-spec pattern).
  await ownerPage.waitForLoadState("networkidle");
  const ownerBaseline = { ...ownerTripwire.counts };
  await undoButton(ownerPage).click();
  await expect(ownerPage.getByRole("status").filter({ hasText: "Card restored" })).toBeVisible();
  await expect(ownerPage.getByText("Rehearsal capture card", { exact: true })).toBeVisible();
  await expect(undoSnackbar(ownerPage)).toHaveCount(0);
  ownerTripwire.check(ownerBaseline, "rehearsal card undo window");
  expect(await getCardArchivedAt(captureCardId), "card restored in the DB").toBeNull();
  expect(await getCardArchivedAt(completedCardId), "seeded completed card never archived").toBeNull();

  // ── Step 5: archive the Inbox list → Undo restores the list with cards. ──
  await archiveList(ownerPage, inboxId);
  await expect(undoButton(ownerPage)).toHaveAccessibleName("Undo archive of Inbox");
  expect(await getListArchivedAt(inboxId), "the Inbox list is the archived one").not.toBeNull();
  await ownerPage.waitForLoadState("networkidle");
  const listBaseline = { ...ownerTripwire.counts };
  await undoButton(ownerPage).click();
  await expect(ownerPage.getByRole("status").filter({ hasText: "List restored" })).toBeVisible();
  await expect(ownerPage.getByText("Inbox", { exact: true })).toBeVisible();
  await expect(undoSnackbar(ownerPage)).toHaveCount(0);
  ownerTripwire.check(listBaseline, "rehearsal list undo window");
  expect(await listExists(inboxId), "list restored in the DB").toBe(true);
  expect(await getListArchivedAt(inboxId), "list un-archived in the DB").toBeNull();
  // The seeded cards of the list are back with it:
  await expect(cardInListById(ownerPage, inboxId, "Review graduation demo script")).toBeVisible();
  await expect(cardInListById(ownerPage, inboxId, "Triage customer feedback")).toBeVisible();

  // ── Step 6: live invitation badge for a registered outsider. ─────────────
  const stamp = Date.now();
  outsiderEmail = `rehearsal-outsider-${stamp}@e2e.test`;
  const outsiderPage = await (await browser.newContext()).newPage();
  await signUp(outsiderPage, { name: "Rehearsal Outsider", email: outsiderEmail, password: PASSWORD });
  const outsiderTripwire = armProofTripwire(outsiderPage, "/boards");
  const outsiderSettled = outsiderPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/boards",
    { timeout: 20_000 },
  );
  await outsiderPage.goto("/boards");
  await outsiderSettled;
  await expect(bell(outsiderPage)).toHaveAccessibleName("Notifications");
  const outsiderBaseline = { ...outsiderTripwire.counts };

  // Owner invites through the real members dialog.
  await inviteMember(ownerPage, DEMO_SLUG, outsiderEmail);

  // The outsider's already-loaded page shows the live badge — no reload.
  await expect(bell(outsiderPage)).toHaveAccessibleName("Notifications (1 unread)");
  outsiderTripwire.check(outsiderBaseline, "rehearsal live invitation badge window");
  // The inbox lists the invitation (DB-truth on open):
  await bell(outsiderPage).click();
  await expect(outsiderPage.getByText(/invitation to/i).first()).toBeVisible();

  await outsiderPage.close();
  await collabPage.close();
  await ownerPage.close();
});
