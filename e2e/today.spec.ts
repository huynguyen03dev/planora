/**
 * US-083 W6 — `/today` cross-workspace personal read model, end to end.
 *
 *  - All four buckets (Overdue / Due Today / Due This Week / Later) render
 *    with count badges; cards are assigned to the viewing user only (an
 *    unassigned card on the same board never appears — AC1/AC4). Bucket
 *    arrangements cover both interior points AND the exact calendar-day
 *    boundaries (+7 = last Due This Week day, +8 = first Later day), so the
 *    E2E itself proves the window edges; the per-edge arithmetic is
 *    unit-proven in lib/today.test.ts.
 *  - Cross-workspace: a card on a board in the user's SECOND workspace
 *    appears too, with its workspace · board · list context.
 *  - Foreign-workspace exclusion: a card ASSIGNED to the viewer on a board in
 *    a workspace the viewer is NOT a member of (created by a second user in a
 *    second browser context) never appears on /today, while the viewer's own
 *    card in their own workspace does — the membership-derived scope is the
 *    isolation boundary (AC1).
 *  - Deep link (AC3): a tile navigates to `/boards/{boardId}?cardId={id}` and
 *    the existing Card Detail Sheet opens — no in-place sheet on /today.
 *  - Refresh removal (AC5): archiving a card through the real UI, and
 *    archiving a board through the real board menu, removes each from /today
 *    on the next refresh.
 *  - Empty states: a user with zero workspace memberships gets the accessible
 *    "No workspaces yet" state; a member with no assigned cards gets
 *    "Nothing assigned".
 *
 * Arrangement: users/workspaces/boards/lists/cards are created through the
 * real UI; due dates and card assignments are seeded directly in Postgres
 * (arrange steps — the UI date-picker and assign paths are proven elsewhere,
 * US-039/US-011; mirrors the `addLabel` arrange precedent). Bucket dates are
 * RELATIVE to run time (calendar-day buckets, so no midnight flake). Every
 * DB write is parameterized and torn down via the per-workspace `cleanup`
 * entries in `created`.
 *
 * RUN 2026-08-02 (W6 gate, shared-server lock): 4/4 passed (1.1m). One
 * arrange defect was found and fixed on the way: `createWorkspace` only
 * worked from the zero-workspace empty state; it now falls back to the real
 * user-menu "Create workspace" item for members who already have workspaces
 * (test 1 creates its second workspace mid-flow). Run with:
 * npm run test:e2e -- e2e/today.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

import {
  signUp,
  createWorkspace,
  createBoard,
  addList,
  addCardToList,
  archiveCard,
} from "./helpers/app";
import {
  getUserIdByEmail,
  getListIdsByTitle,
  getCardIdByTitle,
  setCardDueDate,
  assignCardMember,
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

/** A Date `days` from today at 09:00 local — calendar-day buckets keep every
 *  relative offset stable regardless of the run's wall-clock time. */
function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date;
}

/** The /today `<section>` whose heading has the exact name (count badge lives
 *  beside the heading; tiles live inside). */
function todaySection(page: Page, name: string) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

test("assigned cards across workspaces land in the four buckets; deep links and refresh removal work", async ({ page }) => {
  const stamp = Date.now();
  const bob = { name: "Bob", email: `bob-today-${stamp}@e2e.test`, password: PASSWORD };

  await signUp(page, bob);
  const bobUserId = await getUserIdByEmail(bob.email);

  // ── Workspace A: the primary board with one card per bucket ─────────────
  const acmeWsId = await createWorkspace(page, "Acme");
  created.push({ workspaceId: acmeWsId, emails: [bob.email] });
  const roadmapId = await createBoard(page, "Product Roadmap");
  await addList(page, "To Do");
  const roadmapLists = await getListIdsByTitle(roadmapId);
  const todoId = roadmapLists["To Do"];
  expect(todoId, "list id should be resolved from the seeded list").toBeTruthy();

  const overdueTitle = "Overdue card";
  const todayTitle = "Due today card";
  const weekTitle = "Due this week card";
  const weekBoundaryTitle = "Week boundary card"; // +7 → last Due This Week day
  const laterTitle = "Later card";
  const laterBoundaryTitle = "Later boundary card"; // +8 → first Later day
  const noDueTitle = "No due date card";
  const notMineTitle = "Not mine";
  const archivedTitle = "Archived card";

  for (const title of [
    overdueTitle,
    todayTitle,
    weekTitle,
    weekBoundaryTitle,
    laterTitle,
    laterBoundaryTitle,
    noDueTitle,
    notMineTitle,
    archivedTitle,
  ]) {
    await addCardToList(page, todoId, title);
  }

  // Due dates: Overdue -3d, Today 0d, Week +3d AND the exact +7 boundary,
  // Later +30d AND the exact +8 boundary, none for the no-due card; "Not
  // mine" and "Archived card" are also due today so they would land in Due
  // Today if the filters failed.
  await setCardDueDate(await getCardIdByTitle(roadmapId, overdueTitle), daysFromNow(-3));
  await setCardDueDate(await getCardIdByTitle(roadmapId, todayTitle), daysFromNow(0));
  await setCardDueDate(await getCardIdByTitle(roadmapId, weekTitle), daysFromNow(3));
  await setCardDueDate(await getCardIdByTitle(roadmapId, weekBoundaryTitle), daysFromNow(7));
  await setCardDueDate(await getCardIdByTitle(roadmapId, laterTitle), daysFromNow(30));
  await setCardDueDate(await getCardIdByTitle(roadmapId, laterBoundaryTitle), daysFromNow(8));
  await setCardDueDate(await getCardIdByTitle(roadmapId, notMineTitle), daysFromNow(0));
  await setCardDueDate(await getCardIdByTitle(roadmapId, archivedTitle), daysFromNow(0));

  for (const title of [
    overdueTitle,
    todayTitle,
    weekTitle,
    weekBoundaryTitle,
    laterTitle,
    laterBoundaryTitle,
    noDueTitle,
    archivedTitle,
  ]) {
    await assignCardMember(await getCardIdByTitle(roadmapId, title), bobUserId);
  }

  // ── Workspace B: one cross-workspace card due today ─────────────────────
  const globexWsId = await createWorkspace(page, "Globex");
  created.push({ workspaceId: globexWsId, emails: [bob.email] });
  const sprintId = await createBoard(page, "Sprint");
  await addList(page, "Backlog");
  const sprintLists = await getListIdsByTitle(sprintId);
  const backlogId = sprintLists["Backlog"];
  const crossTitle = "Cross workspace card";
  await addCardToList(page, backlogId, crossTitle);
  await setCardDueDate(await getCardIdByTitle(sprintId, crossTitle), daysFromNow(0));
  await assignCardMember(await getCardIdByTitle(sprintId, crossTitle), bobUserId);

  // ── Archive "Archived card" through the real UI (AC5 setup) ─────────────
  const archivedCardId = await getCardIdByTitle(roadmapId, archivedTitle);
  await page.goto(`/boards/${roadmapId}`);
  await archiveCard(page, archivedCardId);

  // ── /today: four buckets, cross-workspace, unassigned/archived excluded ──
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();

  const overdue = todaySection(page, "Overdue");
  await expect(overdue.getByText("1", { exact: true })).toBeVisible();
  await expect(
    overdue.getByRole("link", { name: "Open card Overdue card" }),
  ).toBeVisible();

  const dueToday = todaySection(page, "Due Today");
  await expect(dueToday.getByText("2", { exact: true })).toBeVisible();
  await expect(
    dueToday.getByRole("link", { name: "Open card Due today card" }),
  ).toBeVisible();
  await expect(
    dueToday.getByRole("link", { name: "Open card Cross workspace card" }),
  ).toBeVisible();
  await expect(dueToday.getByText("Globex · Sprint · Backlog")).toBeVisible();
  // Filters: unassigned and archived cards never surface.
  await expect(
    dueToday.getByRole("link", { name: "Open card Not mine" }),
  ).toHaveCount(0);
  await expect(
    dueToday.getByRole("link", { name: "Open card Archived card" }),
  ).toHaveCount(0);

  const week = todaySection(page, "Due This Week");
  await expect(week.getByText("2", { exact: true })).toBeVisible();
  await expect(
    week.getByRole("link", { name: "Open card Due this week card" }),
  ).toBeVisible();
  // Exact +7 boundary: the LAST Due This Week day stays in the week bucket.
  await expect(
    week.getByRole("link", { name: "Open card Week boundary card" }),
  ).toBeVisible();

  const later = todaySection(page, "Later");
  await expect(later.getByText("3", { exact: true })).toBeVisible();
  await expect(
    later.getByRole("link", { name: "Open card Later card" }),
  ).toBeVisible();
  // Exact +8 boundary: the FIRST Later day leaves the week bucket.
  await expect(
    later.getByRole("link", { name: "Open card Later boundary card" }),
  ).toBeVisible();
  await expect(
    later.getByRole("link", { name: "Open card No due date card" }),
  ).toBeVisible();

  // ── AC3: tile → real board/card deep link, detail sheet opens ──────────
  await dueToday.getByRole("link", { name: "Open card Due today card" }).click();
  await expect(page).toHaveURL(new RegExp(`/boards/${roadmapId}\\?cardId=`));
  await expect(page.locator("#card-detail-title")).toBeVisible();

  // ── AC5 (board half): archive the Sprint board, refresh → card gone ─────
  await page.goto(`/boards/${sprintId}`);
  await page.getByRole("button", { name: "Board menu" }).click();
  await page.getByRole("menuitem", { name: "Archive board" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await page.goto("/today");
  await expect(todaySection(page, "Due Today").getByText("1", { exact: true })).toBeVisible();
  await expect(
    todaySection(page, "Due Today").getByRole("link", { name: "Open card Cross workspace card" }),
  ).toHaveCount(0);
});

test("a card assigned to the viewer in a workspace they are not a member of never appears", async ({ page, browser }) => {
  const stamp = Date.now();
  const bob = { name: "Bob", email: `bob-foreign-${stamp}@e2e.test`, password: PASSWORD };
  const mallory = { name: "Mallory", email: `mallory-foreign-${stamp}@e2e.test`, password: PASSWORD };

  await signUp(page, bob);
  const bobUserId = await getUserIdByEmail(bob.email);

  // Bob's own workspace: one assigned card due today. It proves the read
  // model is LIVE (non-trivial query) while the foreign card is asserted
  // absent — the Due Today count must stay 1, not 2.
  const acmeWsId = await createWorkspace(page, "Acme");
  created.push({ workspaceId: acmeWsId, emails: [bob.email] });
  const roadmapId = await createBoard(page, "Product Roadmap");
  await addList(page, "To Do");
  const todoId = (await getListIdsByTitle(roadmapId))["To Do"];
  const mineTitle = "My card";
  await addCardToList(page, todoId, mineTitle);
  await setCardDueDate(await getCardIdByTitle(roadmapId, mineTitle), daysFromNow(0));
  await assignCardMember(await getCardIdByTitle(roadmapId, mineTitle), bobUserId);

  // Foreign workspace — Bob is NOT a member. Created by a separate user in a
  // separate browser context; the card is ASSIGNED to Bob and due today, so
  // it would surface in Due Today if the membership-derived scope leaked.
  const malloryCtx = await browser.newContext();
  const malloryPage = await malloryCtx.newPage();
  try {
    await signUp(malloryPage, mallory);
    const foreignWsId = await createWorkspace(malloryPage, "Foreign Co");
    created.push({ workspaceId: foreignWsId, emails: [mallory.email] });
    const foreignBoardId = await createBoard(malloryPage, "R&D");
    await addList(malloryPage, "Backlog");
    const foreignListId = (await getListIdsByTitle(foreignBoardId))["Backlog"];
    const foreignTitle = "Foreign card";
    await addCardToList(malloryPage, foreignListId, foreignTitle);
    await setCardDueDate(await getCardIdByTitle(foreignBoardId, foreignTitle), daysFromNow(0));
    await assignCardMember(await getCardIdByTitle(foreignBoardId, foreignTitle), bobUserId);
  } finally {
    await malloryCtx.close();
  }

  // Bob's /today: his own card IS visible; the foreign card never is — the
  // count badge (1, not 2) is the strong assertion, the absent link the
  // explicit one.
  await page.goto("/today");
  const dueToday = todaySection(page, "Due Today");
  await expect(dueToday.getByText("1", { exact: true })).toBeVisible();
  await expect(
    dueToday.getByRole("link", { name: "Open card My card" }),
  ).toBeVisible();
  await expect(
    dueToday.getByRole("link", { name: "Open card Foreign card" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Foreign Co/)).toHaveCount(0);
});

test("a user with zero workspace memberships gets the accessible empty state", async ({ page }) => {
  const stamp = Date.now();
  const solo = { name: "Solo", email: `solo-today-${stamp}@e2e.test`, password: PASSWORD };
  await signUp(page, solo);
  created.push({ emails: [solo.email] });

  await page.goto("/today");

  await expect(
    page.getByRole("heading", { name: "No workspaces yet" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to boards" })).toHaveAttribute(
    "href",
    "/boards",
  );
});

test("a member with no assigned cards gets the nothing-assigned empty state", async ({ page }) => {
  const stamp = Date.now();
  const idle = { name: "Idle", email: `idle-today-${stamp}@e2e.test`, password: PASSWORD };
  await signUp(page, idle);
  const wsId = await createWorkspace(page, "Empty Workspace");
  created.push({ workspaceId: wsId, emails: [idle.email] });

  await page.goto("/today");

  await expect(
    page.getByRole("heading", { name: "Nothing assigned" }),
  ).toBeVisible();
});
