/**
 * US-083 W7 — Global Quick Capture, end to end.
 *
 * Coverage intent (maps to the locked contract):
 *  - `/today` invocation via the bare `C` shortcut, with the dialog opening
 *    immediately and defaulting to the deterministic first-creatable board /
 *    left-most list (US-078 AC1/AC2/AC3).
 *  - Optional fields (description / due date / priority) ride the SAME
 *    createCardAction submit and persist — asserted on the card face
 *    (priority chip) and in the detail sheet after the deep link (AC4).
 *  - Success feedback: the self-contained `role="status"` toast with the
 *    "View Card on Board" deep link `/boards/{boardId}?cardId={cardId}`;
 *    no auto-navigation (AC7).
 *  - Default/fallback destination: after one successful capture, reopening
 *    from `/today` defaults to the SAVED destination, not the first board.
 *  - Route default: on `/boards/{boardId}` the dialog defaults to the
 *    current route board.
 *  - `C` input-focus guard: with a real input focused (the card detail
 *    title), C types instead of opening capture; the guard releases after
 *    the focus leaves the input.
 *  - `Cmd/Ctrl+K`: one dedicated opener test. Browser CHROME may reserve
 *    Ctrl+K / Cmd+K (address bar / find) in real browsers — headless
 *    Chromium passes the key to the page, but portability is NOT claimed
 *    here; the authoritative K proof is the RTL + unit guard suites. If the
 *    shared-server run flakes at the Ctrl+K press, swap that opener to `C`
 *    (the reliable demo path) — do not weaken the guard.
 *  - Two-client liveness: Alice captures from `/today`; Bob's ALREADY-LOADED
 *    board page shows the card (and its priority chip) live — with the W1
 *    barrier + masking-tripwire discipline (presence barrier proves Bob's
 *    socket joined the board room; the tripwire fails any proof window on
 *    reload / socket reconnect / route re-render POST, so a removed emit
 *    can never turn green from an onConnect fallback).
 *
 * Arrangement: users/workspaces/boards/lists/cards through the real UI;
 * Bob's membership seeded directly in Postgres (W1 convention). Every DB
 * write is parameterized and torn down via the per-workspace `cleanup`
 * entries in `created`.
 */
import { test, expect, type Page } from "@playwright/test";

import {
  signUp,
  createWorkspace,
  createBoard,
  addList,
  addCardToList,
  openCardDetail,
  cardInListById,
  watcherAvatars,
} from "./helpers/app";
import {
  addWorkspaceMember,
  getUserIdByEmail,
  getListIdsByTitle,
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

function quickCaptureDialog(page: Page) {
  return page.getByRole("dialog", { name: "Quick capture" });
}

function captureTitle(page: Page) {
  return page.getByRole("textbox", { name: "Title" });
}

function boardSelect(page: Page) {
  return page.getByRole("combobox", { name: "Board" });
}

function listSelect(page: Page) {
  return page.getByRole("combobox", { name: "List" });
}

async function openCapture(page: Page) {
  // The header button is server-rendered before the client shortcut listener
  // attaches; wait on the listener-owned readiness marker so a fast
  // navigation cannot lose the first keydown during hydration.
  await expect(page.getByRole("button", { name: "Quick capture" })).toHaveAttribute(
    "data-shortcuts-ready",
    "true",
  );
  await page.keyboard.press("c");
  await expect(quickCaptureDialog(page)).toBeVisible();
}

/** Fill the title and the three optional fields; submit; expect the toast. */
async function submitCapture(
  page: Page,
  title: string,
  opts: { description?: string; dueDate?: string; priority?: string } = {},
) {
  await captureTitle(page).fill(title);
  if (opts.description) {
    await page.getByRole("textbox", { name: "Description (optional)" }).fill(opts.description);
  }
  if (opts.dueDate) {
    await page.getByLabel("Due date (optional)").fill(opts.dueDate);
  }
  if (opts.priority) {
    await page.getByRole("combobox", { name: "Priority (optional)" }).click();
    await page.getByRole("option", { name: new RegExp(opts.priority) }).click();
  }
  await page.getByRole("button", { name: "Create card" }).click();
  await expect(page.getByRole("status")).toContainText("Card created");
  await expect(page.getByRole("status")).toContainText("View Card on Board");
}

test("C from /today captures to the default board with optional fields and the deep-link toast", async ({
  page,
}) => {
  const stamp = Date.now();
  const owner = { name: "Owner", email: `owner-capture-${stamp}@e2e.test`, password: PASSWORD };
  await signUp(page, owner);
  const workspaceId = await createWorkspace(page, "Acme");
  created.push({ workspaceId, emails: [owner.email] });
  const boardId = await createBoard(page, "Product Roadmap");
  await addList(page, "To Do");
  await addList(page, "Backlog");

  // AC1/AC2/AC3: bare C from /today opens the dialog immediately; the only
  // creatable board (deterministic first) and its left-most list are default.
  await page.goto("/today");
  await openCapture(page);
  await expect(boardSelect(page)).toHaveText("Product Roadmap");
  await expect(listSelect(page)).toHaveText("To Do");

  // AC4: optional fields ride the same submit.
  await submitCapture(page, "Captured from today", {
    description: "Captured with the global dialog",
    dueDate: "2030-01-15",
    priority: "Urgent",
  });

  // AC7: the self-contained toast carries the deep link; clicking navigates
  // to the board with the card detail sheet open (no auto-navigation).
  await page.getByRole("link", { name: "View Card on Board" }).click();
  await expect(page).toHaveURL(new RegExp(`/boards/${boardId}\\?cardId=`));
  await expect(page.locator("#card-detail-title")).toHaveValue("Captured from today");
  // The optional fields persisted: priority in the detail sheet, due date
  // on the due control (match the stable suffix of its accessible name).
  await expect(page.getByRole("combobox", { name: "Priority" })).toContainText("Urgent");
  await expect(page.getByRole("button", { name: /Change due date/ })).toBeVisible();
});

test("the destination defaults to the last successful capture (saved-destination fallback)", async ({
  page,
}) => {
  const stamp = Date.now();
  const owner = { name: "Owner", email: `owner-fallback-${stamp}@e2e.test`, password: PASSWORD };
  await signUp(page, owner);
  const workspaceId = await createWorkspace(page, "Acme");
  created.push({ workspaceId, emails: [owner.email] });
  const alphaId = await createBoard(page, "Alpha");
  await addList(page, "To Do");
  // Second board from the boards home — the "Create board" button lives
  // there, not on a board page (W6 today-spec precedent).
  await page.goto(`/boards?workspace=${workspaceId}`);
  const betaId = await createBoard(page, "Beta");
  await addList(page, "To Do");
  expect(betaId).not.toBe(alphaId);

  // First open from /today: deterministic first creatable board = Alpha.
  await page.goto("/today");
  await openCapture(page);
  await expect(boardSelect(page)).toHaveText("Alpha");
  await page.getByRole("button", { name: "Cancel" }).click();

  // Capture once to Beta (explicitly selected) — the successful destination
  // is persisted to localStorage.
  await openCapture(page);
  await boardSelect(page).click();
  await page.getByRole("option", { name: "Beta" }).click();
  await expect(listSelect(page)).toHaveText("To Do");
  await submitCapture(page, "Beta capture");
  await expect(page.getByRole("status")).toBeVisible();

  // Reopen from /today: the SAVED destination (Beta) wins over the
  // deterministic first board (Alpha).
  await openCapture(page);
  await expect(boardSelect(page)).toHaveText("Beta");
  await expect(listSelect(page)).toHaveText("To Do");
});

test("C never opens capture from a focused input; the route board is the default; the guard releases", async ({
  page,
}) => {
  const stamp = Date.now();
  const owner = { name: "Owner", email: `owner-guard-${stamp}@e2e.test`, password: PASSWORD };
  await signUp(page, owner);
  const workspaceId = await createWorkspace(page, "Acme");
  created.push({ workspaceId, emails: [owner.email] });
  // NON-VACUOUS route default: Alpha is created FIRST, so it is the
  // deterministic first-creatable board from /today; the route board
  // (Roadmap, created second) still wins on its own page.
  await createBoard(page, "Alpha");
  await addList(page, "To Do");
  await page.goto(`/boards?workspace=${workspaceId}`);
  const boardId = await createBoard(page, "Roadmap");
  await addList(page, "To Do");
  const todo = (await getListIdsByTitle(boardId))["To Do"];
  await addCardToList(page, todo, "Guard target");

  // Route default: on the board page, C opens capture defaulted to THIS
  // board — the route rule, not the first-creatable fallback, picks Roadmap.
  await page.goto(`/boards/${boardId}`);
  await openCapture(page);
  await expect(boardSelect(page)).toHaveText("Roadmap");
  await page.getByRole("button", { name: "Cancel" }).click();

  // Input-focus guard: with the detail sheet's title input focused, C types
  // into the input and never opens capture.
  await openCardDetail(page, "Guard target");
  const titleInput = page.locator("#card-detail-title");
  await titleInput.click();
  await page.keyboard.press("c");
  await expect(quickCaptureDialog(page)).toHaveCount(0);
  await expect(titleInput).toHaveValue(/c$/);

  // US-043: the first Escape reverts an unsaved title edit and keeps the
  // sheet open; the second Escape closes it, releasing input focus so the
  // global C guard lifts.
  await page.keyboard.press("Escape");
  await expect(titleInput).toHaveValue("Guard target");
  await page.keyboard.press("Escape");
  await expect(page.locator("#card-detail-title")).toHaveCount(0);
  await page.keyboard.press("c");
  await expect(quickCaptureDialog(page)).toBeVisible();
});

/**
 * Masking tripwire — copied from the W1 proof spec (realtime-event-proof
 * spec-local helper): fails the proof window on any full reload, socket.io
 * disconnect/reconnect, or route re-render POST on the observer page, so a
 * removed `card:created` emit can never turn green from an onConnect
 * fallback reading persisted DB state.
 */
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
    check(baseline: typeof counts, windowLabel: string) {
      expect(counts.reloads, `${windowLabel}: full reload during the proof window`).toBe(baseline.reloads);
      expect(counts.wsOpens, `${windowLabel}: socket (re)connect during the proof window`).toBe(baseline.wsOpens);
      expect(counts.wsCloses, `${windowLabel}: socket disconnect during the proof window`).toBe(baseline.wsCloses);
      expect(counts.routePosts, `${windowLabel}: route re-render POST during the proof window`).toBe(baseline.routePosts);
    },
  };
}

test("a capture from /today appears live on the observer's board (two-client, W1 barriers)", async ({
  browser,
}) => {
  const tag = `${Date.now()}-capture-live`;
  const alice = { name: "Alice", email: `alice-${tag}@e2e.test`, password: PASSWORD };
  const bob = { name: "Bob", email: `bob-${tag}@e2e.test`, password: PASSWORD };

  const alicePage = await (await browser.newContext()).newPage();
  const bobPage = await (await browser.newContext()).newPage();

  await signUp(alicePage, alice);
  const workspaceId = await createWorkspace(alicePage, `WS ${tag}`);
  const boardId = await createBoard(alicePage, `Board ${tag}`);
  await addList(alicePage, "To Do");
  const todo = (await getListIdsByTitle(boardId))["To Do"];

  await signUp(bobPage, bob);
  await addWorkspaceMember(workspaceId, await getUserIdByEmail(bob.email), "editor");
  created.push({ workspaceId, emails: [alice.email, bob.email] });

  // Observer-side cleanliness gate: armed before Bob's page loads.
  const tripwire = armProofTripwire(bobPage, `/boards/${boardId}`);

  // Presence barrier (W1 discipline): BOTH sides see two avatars — Bob's
  // socket joined the board room BEFORE Alice acts. Alice joins the board
  // first (so Bob's join is confirmed by the server's own broadcast), then
  // moves to /today to capture — leaving the room is not a page lifecycle
  // event on Bob's page (the tripwire stays clean).
  const resyncSettled = bobPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/boards/${boardId}`,
    { timeout: 20_000 },
  );
  await alicePage.goto(`/boards/${boardId}`);
  await bobPage.goto(`/boards/${boardId}`);
  await expect(watcherAvatars(alicePage)).toHaveCount(2);
  await expect(watcherAvatars(bobPage)).toHaveCount(2);
  await resyncSettled;

  // The observer's board is settled: the target card does not exist yet.
  await expect(cardInListById(bobPage, todo, "Live capture")).toHaveCount(0);
  const baseline = { ...tripwire.counts };

  // Act: Alice captures from /today (her only creatable board = this one).
  await alicePage.goto("/today");
  await openCapture(alicePage);
  await expect(boardSelect(alicePage)).toHaveText(`Board ${tag}`);
  await submitCapture(alicePage, "Live capture", { priority: "Urgent" });

  // Assert: Bob's ALREADY-LOADED board shows the card live — no reload, no
  // reconnect, no route re-render POST in the window (tripwire clean); the
  // priority chip proves the W7 dueDate/priority payload fidelity.
  await expect(cardInListById(bobPage, todo, "Live capture")).toBeVisible();
  await expect(bobPage.getByText("Urgent", { exact: true })).toBeVisible();
  tripwire.check(baseline, "quick capture live appearance proof window");
});

test("Cmd/Ctrl+K opens the dialog (browser-chrome reservation caveat)", async ({ page }) => {
  const stamp = Date.now();
  const owner = { name: "Owner", email: `owner-k-${stamp}@e2e.test`, password: PASSWORD };
  await signUp(page, owner);
  created.push({ emails: [owner.email] });

  await page.goto("/today");
  // Lowercase "k": Playwright's press("Control+K") synthesizes key "K"
  // (the shifted character, no shiftKey flag), which the product predicate
  // intentionally does not match — a REAL keyboard delivers key "k" for
  // Ctrl+K (and "K" with shiftKey for Shift+Ctrl+K, excluded).
  await page.keyboard.press("Control+k");
  await expect(quickCaptureDialog(page)).toBeVisible();
});
