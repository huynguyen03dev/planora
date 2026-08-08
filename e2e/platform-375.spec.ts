/**
 * US-083 — 375px platform proof for the three new demo surfaces.
 *
 * Platform row contract (validation.md): the Today page, the Quick Capture
 * dialog, and the undo snackbar must render at a 375px viewport with NO
 * horizontal document overflow, and the global C shortcut must stay inert
 * while a keyboard is focused on an editable field (mobile-keyboard focus).
 *
 * This is a DOM-level proof, not visual-test infrastructure: overflow is
 * asserted via scrollWidth/clientWidth (1px subpixel slack), usability via
 * the real actions (capture submit, undo restore). No screenshots, no image
 * diffing.
 *
 * Arrangement mirrors the other US-083 specs: fresh signUp per test (real UI
 * + Mailpit verification), UI-created workspace/board/list, due dates via the
 * DB arrange precedent (today.spec.ts) — the surfaces themselves are the
 * system under test.
 */
import { test, expect, type Page } from "@playwright/test";

import { signUp, createWorkspace, createBoard, addList, addCard, archiveCard } from "./helpers/app";
import {
  getUserIdByEmail,
  getCardIdByTitle,
  setCardDueDate,
  assignCardMember,
  cleanup,
  disconnect,
} from "./helpers/db";

const PASSWORD = "e2e-password-123";

const created: Array<{ workspaceId?: string; emails: string[] }> = [];

test.use({ viewport: { width: 375, height: 812 } });

test.afterAll(async () => {
  for (const target of created) {
    await cleanup(target);
  }
  await disconnect();
});

/** Assert the document itself does not scroll horizontally at 375px. */
async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docOverflow:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(metrics.innerWidth, "viewport should be 375px").toBe(375);
  expect(metrics.docOverflow, `documentElement overflow (${metrics.docOverflow}px)`).toBeLessThanOrEqual(1);
  expect(metrics.bodyOverflow, `body overflow (${metrics.bodyOverflow}px)`).toBeLessThanOrEqual(1);
}

function quickCaptureDialog(page: Page) {
  return page.getByRole("dialog", { name: "Quick capture" });
}

function undoSnackbar(page: Page) {
  return page.getByRole("status").filter({ hasText: /archived/i });
}

/** addCard + deterministic settle: the card face renders only after the
 *  Server Action committed and the RSC refresh landed — a DB query before
 *  that point races the commit (observed RED on the first 375px run). */
async function addCardAndSettle(page: Page, title: string): Promise<void> {
  await addCard(page, title);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

function todaySection(page: Page, name: string) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

/** A Date `days` from today at 09:00 local (today.spec.ts precedent). */
function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date;
}

test("/today renders all four buckets at 375px without horizontal overflow", async ({ page }) => {
  const stamp = Date.now();
  const user = { name: "Platform Today", email: `platform-today-${stamp}@e2e.test`, password: PASSWORD };

  await signUp(page, user);
  const userId = await getUserIdByEmail(user.email);
  const workspaceId = await createWorkspace(page, "Acme");
  created.push({ workspaceId, emails: [user.email] });
  const boardId = await createBoard(page, "Product Roadmap");
  await addList(page, "To Do");
  await addCardAndSettle(page, "Overdue card");
  await addCardAndSettle(page, "Due today card");
  const overdueId = await getCardIdByTitle(boardId, "Overdue card");
  const todayId = await getCardIdByTitle(boardId, "Due today card");
  await setCardDueDate(overdueId, daysFromNow(-2));
  await setCardDueDate(todayId, daysFromNow(0));
  await assignCardMember(overdueId, userId);
  await assignCardMember(todayId, userId);

  await page.goto("/today");

  // Buckets render after the client-mounted boundary; sections are real.
  await expect(todaySection(page, "Overdue").getByRole("heading", { name: "Overdue" })).toBeVisible();
  await expect(todaySection(page, "Overdue").getByText("Overdue card")).toBeVisible();
  await expect(todaySection(page, "Due Today").getByText("Due today card")).toBeVisible();
  await expect(todaySection(page, "Due This Week").getByText("Nothing here yet.")).toBeVisible();
  await expect(todaySection(page, "Later").getByText("Nothing here yet.")).toBeVisible();
  // Completion status at 375px: the end-of-list state is a plain muted line
  // that must not overflow the narrow viewport.
  await expect(page.getByText("All assigned cards are shown")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Quick Capture opens, captures, and stays inert while typing at 375px", async ({ page }) => {
  const stamp = Date.now();
  const user = { name: "Platform Capture", email: `platform-capture-${stamp}@e2e.test`, password: PASSWORD };

  await signUp(page, user);
  const workspaceId = await createWorkspace(page, "Acme");
  created.push({ workspaceId, emails: [user.email] });
  await createBoard(page, "Product Roadmap");
  await addList(page, "To Do");

  await page.goto("/today");
  // The header button is server-rendered before the shortcut listener
  // attaches; the readiness marker is listener-owned (quick-capture.spec.ts).
  await expect(page.getByRole("button", { name: "Quick capture" })).toHaveAttribute(
    "data-shortcuts-ready",
    "true",
  );
  await page.keyboard.press("c");
  await expect(quickCaptureDialog(page)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Usable at 375px: a real capture lands on the board.
  await page.getByRole("textbox", { name: "Title" }).fill("375px capture");
  await page.getByRole("button", { name: "Create card" }).click();
  await expect(page.getByRole("status")).toContainText("Card created");
  await page.keyboard.press("Escape");
  await expect(quickCaptureDialog(page)).toHaveCount(0);

  // Mobile-keyboard focus guard: typing C into an editable field must NOT
  // open the dialog; the keystroke goes to the field.
  await page.goto("/boards");
  await page.getByRole("link", { name: /product roadmap/i }).click();
  await page.waitForURL(/\/boards\/[0-9a-f-]{36}/i);
  await page.getByRole("button", { name: /add a list/i }).click();
  const composer = page.getByPlaceholder("Enter list title...");
  await composer.focus();
  await page.keyboard.type("c", { delay: 10 });
  await expect(quickCaptureDialog(page)).toHaveCount(0);
  await expect(composer).toHaveValue("c");

  // Focus leaves the editable (Tab to the composer's Add list button) → the
  // guard releases and the bare C shortcut works at 375px.
  await page.keyboard.press("Tab");
  await page.keyboard.press("c");
  await expect(quickCaptureDialog(page)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("undo snackbar restores an archived card at 375px without overflow", async ({ page }) => {
  const stamp = Date.now();
  const user = { name: "Platform Undo", email: `platform-undo-${stamp}@e2e.test`, password: PASSWORD };

  await signUp(page, user);
  const workspaceId = await createWorkspace(page, "Acme");
  created.push({ workspaceId, emails: [user.email] });
  const boardId = await createBoard(page, "Product Roadmap");
  await addList(page, "To Do");
  await addCardAndSettle(page, "Undo me at 375");
  const cardId = await getCardIdByTitle(boardId, "Undo me at 375");

  const counts = { reloads: 0, wsOpens: 0, wsCloses: 0 };
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

  await archiveCard(page, cardId);
  await expect(undoSnackbar(page)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: /^Undo archive of/ }).click();
  await expect(page.getByText("Undo me at 375", { exact: true })).toBeVisible();
  await expect(undoSnackbar(page)).toHaveCount(0);

  // In place — no reload and no socket reconnect in the undo window.
  expect(counts.reloads, "full reload during the undo window").toBe(0);
  expect(counts.wsOpens, "socket (re)connect during the undo window").toBe(0);
  expect(counts.wsCloses, "socket disconnect during the undo window").toBe(0);
});
