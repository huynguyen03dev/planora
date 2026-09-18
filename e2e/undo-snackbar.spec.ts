/**
 * US-083 W8 — bounded undo snackbar, end to end.
 *
 * Coverage intent (maps to the locked W8 contract, decision 0031):
 *  - Card archive → snackbar offers Undo → Undo calls the REAL
 *    restoreCardAction → the card reappears in place on the already-loaded
 *    page (no reload, no navigation — tripwire counters pinned), and the DB
 *    row is un-archived (same-row restore, no clone).
 *  - List archive → Undo → restoreListAction → the list column reappears with
 *    its cards; the DB row is un-archived.
 *  - Sequential two-client race: A archives the card (snackbar offered), B
 *    archives the parent list, A's snackbar SURVIVES B's realtime update,
 *    A clicks Undo → restoreCardAction fails truthfully ("Restore the list
 *    first.", assertive alert) and the card is NOT restored invisibly (DB +
 *    UI assertions).
 *  - Non-goal absence (decision 0031): no undo affordance after permanent
 *    list deletion, member removal, or label deletion.
 *
 * Race note: B's archive COMMITS before A clicks Undo, so A hits the
 * sequential discriminator in `getArchivedCardWithListAndBoard` — the
 * dedicated message is truthful there because the card exists, remains
 * archived, its parent list is archived, and A is authorized. The true
 * in-transaction race (list archived between A's pre-read and A's commit) is
 * proven by the real-Postgres interleaving proof
 * (`tests/db-undo-race-proof.test.ts`) and the mocked-tx action tests
 * (`tests/server-actions/undo-restore.test.ts`); the E2E proves the surfaced
 * failure path end to end.
 *
 * Tripwire discipline: the W1 masking tripwire (reload / socket reconnect /
 * route-POST counters) is armed on pages that must NOT re-read from the
 * server. Acting pages legitimately POST their own action, so route-POST is
 * only asserted on observer windows (the race test's survive window);
 * acting-page windows check reloads/wsOpens/wsCloses only.
 */
import { test, expect, type Page } from "@playwright/test";

import {
  signUp,
  createWorkspace,
  createBoard,
  addList,
  addCardToList,
  archiveCard,
  archiveList,
  openCardDetail,
  assignMemberInOpenCard,
  removeFirstMemberInOpenCard,
  assignedMemberRemoveButtons,
  deleteBoardLabel,
  cardInListById,
  listColumnById,
  watcherAvatars,
} from "./helpers/app";
import {
  addWorkspaceMember,
  addLabel,
  getUserIdByEmail,
  getListIdsByTitle,
  getCardIdByTitle,
  getCardArchivedAt,
  getListArchivedAt,
  listExists,
  cleanup,
  disconnect,
} from "./helpers/db";

const PASSWORD = "e2e-password-123";

const created: Array<{ workspaceId?: string; emails: string[] }> = [];

test.afterAll(async () => {
  for (const target of created) {
    await cleanup(target);
  }
  await disconnect();
});

// ── W8 snackbar locators ──────────────────────────────────────────────────

function undoSnackbar(page: Page) {
  return page.getByRole("status").filter({ hasText: /archived/i });
}

function undoAlert(page: Page) {
// The failure snackbar is the app's own assertive alert; exclude Next.js's
// permanent `#__next-route-announcer__` (also role="alert") so positive and
// negative assertions are unambiguous.
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

function undoButton(page: Page) {
  return page.getByRole("button", { name: /^Undo archive of/ });
}

function dismissButton(page: Page) {
  return page.getByRole("button", { name: "Dismiss" });
}

/**
 * Deterministic Radix-dialog close: click the TOPMOST modal overlay's corner.
 * Escape is focus-dependent — after a confirm AlertDialog closes, focus can
 * fall to <body> where the dialog's Escape listener never fires.
 */
async function closeTopmostDialog(page: Page) {
  await page
    .locator('[data-slot="dialog-overlay"]')
    .last()
    .click({ position: { x: 10, y: 10 } });
}

/** Masking tripwire — W1 discipline (see the file header for window rules). */
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
    check(
      baseline: typeof counts,
      windowLabel: string,
      opts: { expectNoRoutePosts?: boolean } = {},
    ) {
      expect(counts.reloads, `${windowLabel}: full reload during the proof window`).toBe(baseline.reloads);
      expect(counts.wsOpens, `${windowLabel}: socket (re)connect during the proof window`).toBe(baseline.wsOpens);
      expect(counts.wsCloses, `${windowLabel}: socket disconnect during the proof window`).toBe(baseline.wsCloses);
      if (opts.expectNoRoutePosts) {
        expect(counts.routePosts, `${windowLabel}: route re-render POST during the proof window`).toBe(baseline.routePosts);
      }
    },
  };
}

test("card archive offers undo and Undo restores the card in place — no reload, no navigation", async ({
  page,
}) => {
  const stamp = Date.now();
  const owner = { name: "Owner", email: `owner-card-undo-${stamp}@e2e.test`, password: PASSWORD };
  await signUp(page, owner);
  const workspaceId = await createWorkspace(page, "Acme");
  created.push({ workspaceId, emails: [owner.email] });
  const boardId = await createBoard(page, "Board");
  await addList(page, "To Do");
  const todo = (await getListIdsByTitle(boardId))["To Do"];
  await addCardToList(page, todo, "Restore me");
  const cardId = await getCardIdByTitle(boardId, "Restore me");

  // Tripwire armed BEFORE the page loads; acting-page windows check reload/
  // socket counters only (the page's own action POSTs are expected).
  const tripwire = armProofTripwire(page, `/boards/${boardId}`);
  await page.goto(`/boards/${boardId}`);
  await expect(cardInListById(page, todo, "Restore me")).toBeVisible();

  await archiveCard(page, cardId);

  // The offer appears and survives the archived card's unmount.
  const snackbar = undoSnackbar(page);
  await expect(snackbar).toBeVisible();
  await expect(snackbar).toContainText("Card archived");
  await expect(undoButton(page)).toBeVisible();

  // Settle the acting page's own post-archive work (RSC revalidate refresh,
  // sheet-close replace) before the baseline so the undo window starts
  // from a quiescent page.
  await page.waitForLoadState("networkidle");

  const baseline = { ...tripwire.counts };
  await undoButton(page).click();

  await expect(page.getByRole("status").filter({ hasText: "Card restored" })).toBeVisible();
  await expect(cardInListById(page, todo, "Restore me")).toBeVisible();
  tripwire.check(baseline, "card undo restore window");

  // DB truth: same-row restore (archivedAt cleared — never a clone).
  expect(await getCardArchivedAt(cardId)).toBeNull();
});

test("list archive offers undo and Undo restores the list with its cards", async ({ page }) => {
  const stamp = Date.now();
  const owner = { name: "Owner", email: `owner-list-undo-${stamp}@e2e.test`, password: PASSWORD };
  await signUp(page, owner);
  const workspaceId = await createWorkspace(page, "Acme");
  created.push({ workspaceId, emails: [owner.email] });
  const boardId = await createBoard(page, "Board");
  await addList(page, "To Go");
  const toGo = (await getListIdsByTitle(boardId))["To Go"];
  await addCardToList(page, toGo, "Pack the demo");
  const cardId = await getCardIdByTitle(boardId, "Pack the demo");

  // Tripwire armed BEFORE the page loads: the list's in-place reappearance
  // must need no reload/reconnect (acting page's own action POSTs expected).
  const tripwire = armProofTripwire(page, `/boards/${boardId}`);
  await page.goto(`/boards/${boardId}`);
  await archiveList(page, toGo);

  const snackbar = undoSnackbar(page);
  await expect(snackbar).toBeVisible();
  await expect(snackbar).toContainText("List archived");
  await page.waitForLoadState("networkidle");
  const baseline = { ...tripwire.counts };

  await undoButton(page).click();

  await expect(page.getByRole("status").filter({ hasText: "List restored" })).toBeVisible();
  await expect(listColumnById(page, toGo)).toBeVisible();
  await expect(cardInListById(page, toGo, "Pack the demo")).toBeVisible();
  tripwire.check(baseline, "list undo restore window");
  expect(await getListArchivedAt(toGo)).toBeNull();
  expect(await getCardArchivedAt(cardId)).toBeNull();
});

test("two-client race: B archives the parent list, A's Undo fails truthfully and never restores invisibly", async ({
  browser,
}) => {
  const tag = `${Date.now()}-undo-race`;
  const alice = { name: "Alice", email: `alice-${tag}@e2e.test`, password: PASSWORD };
  const bob = { name: "Bob", email: `bob-${tag}@e2e.test`, password: PASSWORD };

  const alicePage = await (await browser.newContext()).newPage();
  const bobPage = await (await browser.newContext()).newPage();

  await signUp(alicePage, alice);
  const workspaceId = await createWorkspace(alicePage, `WS ${tag}`);
  const boardId = await createBoard(alicePage, `Board ${tag}`);
  await addList(alicePage, "To Do");
  const todo = (await getListIdsByTitle(boardId))["To Do"];
  await addCardToList(alicePage, todo, "Race card");
  const cardId = await getCardIdByTitle(boardId, "Race card");

  await signUp(bobPage, bob);
  await addWorkspaceMember(workspaceId, await getUserIdByEmail(bob.email), "editor");
  created.push({ workspaceId, emails: [alice.email, bob.email] });

  // Observer-window tripwire on ALICE's page: during Bob's archive she runs
  // no action, so all four counters must stay clean (no reload masking the
  // snackbar's survival). Armed before either page loads.
  const tripwire = armProofTripwire(alicePage, `/boards/${boardId}`);
  const resyncSettled = alicePage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/boards/${boardId}`,
    { timeout: 20_000 },
  );
  await alicePage.goto(`/boards/${boardId}`);
  await bobPage.goto(`/boards/${boardId}`);
  // Presence barrier: both sockets joined the board room before anyone acts.
  await expect(watcherAvatars(alicePage)).toHaveCount(2);
  await expect(watcherAvatars(bobPage)).toHaveCount(2);
  await resyncSettled;

  await archiveCard(alicePage, cardId);
  await expect(undoSnackbar(alicePage)).toBeVisible();
  await expect(undoSnackbar(alicePage)).toContainText("Card archived");
  expect(await getCardArchivedAt(cardId)).not.toBeNull();
  await alicePage.waitForLoadState("networkidle");

  // B archives the parent list — B's action commits first.
  const baseline = { ...tripwire.counts };
  await archiveList(bobPage, todo);

  // IMMEDIATELY reassert A's snackbar: it must survive the list:deleted
  // realtime update — no reload, no reconnect, no route re-render POST on A.
  await expect(undoSnackbar(alicePage)).toBeVisible();
  await expect(undoSnackbar(alicePage)).toContainText("Card archived");
  tripwire.check(baseline, "undo offer survives B's list archive", { expectNoRoutePosts: true });

  // A hits Undo → the real restore action discriminates truthfully: the card
  // exists, remains archived, the parent list is archived, A is authorized.
  const failBaseline = { ...tripwire.counts };
  await undoButton(alicePage).click();
  await expect(undoAlert(alicePage)).toContainText("Restore the list first.");

  // No invisible restore: card stays archived in the DB and absent from A's
  // board (the list itself is archived/absent from the active view).
  expect(await getCardArchivedAt(cardId)).not.toBeNull();
  expect(await getListArchivedAt(todo)).not.toBeNull();
  await expect(cardInListById(alicePage, todo, "Race card")).toHaveCount(0);
  await expect(listColumnById(alicePage, todo)).toHaveCount(0);
  // A's window: the Undo click POSTs A's own action — reload/socket only.
  tripwire.check(failBaseline, "undo failure window");
});

test("non-goal absence: member removal and label deletion offer no undo", async ({ browser }) => {
  const stamp = Date.now();
  const owner = { name: "Owner", email: `owner-nongoal-${stamp}@e2e.test`, password: PASSWORD };
  const carol = { name: "Carol", email: `carol-${stamp}@e2e.test`, password: PASSWORD };
  // Two contexts: signUp ends authenticated on /boards, so a second sign-up
  // on the same page would redirect away from /sign-up.
  const page = await (await browser.newContext()).newPage();
  const carolPage = await (await browser.newContext()).newPage();
  await signUp(page, owner);
  const workspaceId = await createWorkspace(page, "Acme");
  await signUp(carolPage, carol);
  await addWorkspaceMember(workspaceId, await getUserIdByEmail(carol.email), "editor");
  created.push({ workspaceId, emails: [owner.email, carol.email] });

  const boardId = await createBoard(page, "Board");
  await addList(page, "To Do");
  const todo = (await getListIdsByTitle(boardId))["To Do"];
  await addCardToList(page, todo, "Assigned card");
  // A label must exist so its DELETION is a real flow (decision 0031
  // non-goal); seeding the row directly is the arrange step, the delete below
  // runs real deleteLabelAction through the manage-labels dialog.
  await addLabel(boardId, `Label ${stamp}`, "#0079BF");
  await page.goto(`/boards/${boardId}`);

  await openCardDetail(page, "Assigned card");
  await assignMemberInOpenCard(page, carol.name);
  await removeFirstMemberInOpenCard(page);
  // Decisive: the removal actually ran (not vacuous) — no remove buttons left.
  await expect(assignedMemberRemoveButtons(page)).toHaveCount(0);

  // CLOSE the detail sheet first: while the Radix modal is open the page is
  // aria-hidden, so absence assertions would pass vacuously.
  await closeTopmostDialog(page);
  await expect(page.locator("#card-detail-title")).toHaveCount(0);
  await expect(undoSnackbar(page)).toHaveCount(0);
  await expect(undoAlert(page)).toHaveCount(0);
  // Settle the sheet-close router.replace before re-opening: the replace must
  // COMMIT (cardId gone from the URL) or the reopen push to the same ?cardId=
  // URL is deduped by Next's router and the sheet never opens (observed
  // flake). networkidle alone does not cover a replace whose fetch has not
  // started yet.
  await expect(page).not.toHaveURL(/cardId=/);
  await page.waitForLoadState("networkidle");

  await openCardDetail(page, "Assigned card");
  await deleteBoardLabel(page, `Label ${stamp}`);
  // The shared helper leaves the "Manage board labels" dialog open (other
  // specs rely on that contract — not changed here). Close BOTH overlay
  // layers before the absence assertions — manage dialog first (topmost),
  // then the card-detail sheet — each gated on its own locator being gone,
  // so no-status/no-alert cannot run against an aria-hidden page.
  await expect(page.getByRole("dialog", { name: /manage board labels/i })).toBeVisible();
  await closeTopmostDialog(page);
  await expect(page.getByRole("dialog", { name: /manage board labels/i })).toHaveCount(0);
  await closeTopmostDialog(page);
  await expect(page.locator("#card-detail-title")).toHaveCount(0);
  await expect(undoSnackbar(page)).toHaveCount(0);
  await expect(undoAlert(page)).toHaveCount(0);
});

test("non-goal absence: permanent list deletion offers no undo (decision 0031)", async ({ page }) => {
  const stamp = Date.now();
  const owner = { name: "Owner", email: `owner-purge-${stamp}@e2e.test`, password: PASSWORD };
  await signUp(page, owner);
  const workspaceId = await createWorkspace(page, "Acme");
  created.push({ workspaceId, emails: [owner.email] });
  const boardId = await createBoard(page, "Board");
  await addList(page, "Doomed");
  const doomed = (await getListIdsByTitle(boardId))["Doomed"];

  await page.goto(`/boards/${boardId}`);
  // Archive the list (no cards — permanent delete needs no force), dismiss the
  // archive undo offer so the absence assertion below is clean, then purge.
  await archiveList(page, doomed);
  await expect(undoSnackbar(page)).toBeVisible();
  await dismissButton(page).click();
  await expect(undoSnackbar(page)).toHaveCount(0);

  await page.getByRole("button", { name: "View archived items" }).click();
  await page.getByRole("tab", { name: /^Lists/ }).click();
  await page.getByRole("button", { name: `Delete Doomed permanently` }).click();
  await page
    .getByRole("alertdialog", { name: `Permanently delete "Doomed"?` })
    .getByLabel("Type the list title to confirm permanent deletion")
    .fill("Doomed");
  await page
    .getByRole("alertdialog", { name: `Permanently delete "Doomed"?` })
    .getByRole("button", { name: "Permanently delete" })
    .click();
  await expect(page.getByRole("alertdialog", { name: `Permanently delete "Doomed"?` })).toHaveCount(0);

  // CLOSE the archived-items dialog first: while it is open the page is
  // aria-hidden, so absence assertions would pass vacuously; the row-gone DB
  // assertion is the decisive completion observation.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Archived items" })).toHaveCount(0);
  await expect(undoSnackbar(page)).toHaveCount(0);
  await expect(undoAlert(page)).toHaveCount(0);
  expect(await listExists(doomed)).toBe(false);
});
