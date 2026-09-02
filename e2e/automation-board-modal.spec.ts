/**
 * US-067 — Board-level Automation entry: the board header "Automation" button
 * opens a modal (Radix Dialog) for managing that board's rules, reusing the
 * existing automation engine.
 *
 * This spec proves the acceptance items end-to-end through the real UI:
 *  1. Automation button visible in board header
 *  2. Click → modal opens, URL unchanged (no navigation)
 *  3. "New rule" → builder opens, board-scope defaults to current board
 *  4. Create rule → rules list shows it in the modal
 *  5. Trigger rule by creating a card → execution log shows success
 *
 * When two Radix dialogs are open at once (board modal + rule builder), the
 * background dialog gets aria-hidden. Always interact with the topmost dialog
 * first, then wait for it to close before asserting on the underlying one.
 */
import { test, expect, type Page } from "@playwright/test";
import "dotenv/config";

import {
  signUp,
  createWorkspace,
  createBoard,
  addList,
  addCardToList,
} from "./helpers/app";
import { getListIdsByTitle, cleanup, disconnect } from "./helpers/db";

const PASSWORD = "e2e-password-123";
const stamp = Date.now();
const user = {
  name: "Board Modal QA",
  email: `auto-bm-${stamp}@e2e.test`,
  password: PASSWORD,
};

let page: Page;
let workspaceId: string | undefined;

test.afterAll(async () => {
  await cleanup({ workspaceId, emails: [user.email] });
  await disconnect();
});

test("board automation modal — create rule, trigger, verify log", async ({ browser }) => {
  const ctx = await browser.newContext();
  page = await ctx.newPage();

  // Step 1: sign up, create workspace + board + list
  console.log("Step 1: Sign up, create workspace, board, and list");
  await signUp(page, user);
  workspaceId = await createWorkspace(page, "Board Modal QA");
  const boardId = await createBoard(page, "Ops");
  await addList(page, "To Do");
  const lists = await getListIdsByTitle(boardId);
  const listId = lists["To Do"];
  expect(listId, "list id should be resolved from the seeded list").toBeTruthy();
  console.log("✓ Step 1: workspace 'Board Modal QA', board 'Ops', list 'To Do' created");

  // Step 2: Automation button is visible in the header
  const boardUrl = page.url();
  console.log(`Step 2: On board page ${boardUrl}`);
  const automationButton = page.getByRole("button", { name: "Automation" });
  await expect(automationButton).toBeVisible();
  console.log("✓ Step 2: 'Automation' button visible in board header");

  // Step 3: Click Automation → dialog opens, URL unchanged
  console.log("Step 3: Click 'Automation', verify modal opens without navigation");
  await automationButton.click();

  const boardModal = page.getByRole("dialog", { name: "Automation" });
  await expect(boardModal).toBeVisible({ timeout: 10_000 });

  // URL must still be /boards/{boardId} — no navigation happened
  expect(page.url()).toBe(boardUrl);
  console.log(`✓ Step 3: Automation dialog visible, URL unchanged at ${page.url()}`);

  await page.screenshot({
    path: "e2e/.qa-artifacts/us067-modal-open.png",
    fullPage: true,
  });

  // Step 4: New rule → builder opens, board scope = "Ops"
  console.log("Step 4: Click 'New rule', verify board scope defaults to 'Ops'");
  await boardModal.getByRole("button", { name: "New rule" }).click();

  // Now the rule builder is the topmost dialog; the board modal becomes aria-hidden
  const builderDialog = page.getByRole("dialog", { name: "New automation rule" });
  await expect(builderDialog).toBeVisible({ timeout: 10_000 });

  const boardScopeTrigger = builderDialog.locator("#rule-board");
  await expect(boardScopeTrigger).toContainText("Ops");
  console.log("✓ Step 4a: Board scope defaults to 'Ops' (not 'All boards in this workspace')");

  await page.locator("#rule-name").fill("Board Rule");

  await page.getByRole("button", { name: "Create rule" }).click();

  await expect(builderDialog).not.toBeVisible();
  console.log("✓ Step 4b: Rule 'Board Rule' created, builder closed");

  // Step 5: Rules list shows "Board Rule" in the board modal
  // The board modal is the active dialog again (no longer aria-hidden)
  console.log("Step 5: Verify rules list shows 'Board Rule'");
  await expect(boardModal.getByText("Board Rule", { exact: true })).toBeVisible({ timeout: 10_000 });
  console.log("✓ Step 5: 'Board Rule' appears in rules list inside the modal");

  await page.screenshot({
    path: "e2e/.qa-artifacts/us067-rule-created.png",
    fullPage: true,
  });

  // Step 6: Close modal, trigger the rule via card creation
  console.log("Step 6: Close modal, trigger the rule by creating a card");
  await page.keyboard.press("Escape");
  await expect(boardModal).not.toBeVisible();

  // card-created fires the rule (trigger = card-created, action = set-priority)
  await addCardToList(page, listId, "Trigger card");
  console.log("✓ Step 6: Card 'Trigger card' created — rule should have fired");

  // Step 7: Reopen modal, verify execution log
  console.log("Step 7: Reopen Automation modal, verify execution log");

  await automationButton.click();
  await expect(boardModal).toBeVisible({ timeout: 10_000 });

  // The empty state must NOT be showing
  const emptyState = boardModal.getByText(
    "No rule executions yet. Runs appear here as rules fire.",
  );

  try {
    await expect(emptyState).toHaveCount(0, { timeout: 4_000 });
  } catch {
    console.log("  Log initially empty, clicking Refresh...");
    await boardModal.getByRole("button", { name: "Refresh" }).click();
    await page.waitForTimeout(2000);
    await expect(emptyState).toHaveCount(0, { timeout: 8_000 });
  }

  const logEntry = boardModal
    .locator("div")
    .filter({ hasText: "Board Rule" })
    .filter({ hasText: /success/i })
    .first();
  await expect(logEntry).toBeVisible({ timeout: 10_000 });

  const logRuleName = logEntry.locator("span").filter({ hasText: "Board Rule" }).first();
  await expect(logRuleName).toBeVisible();
  console.log("✓ Step 7: Execution log shows 'Board Rule' with success status");

  await page.screenshot({
    path: "e2e/.qa-artifacts/us067-log.png",
    fullPage: true,
  });

  console.log("✓ All acceptance items passed!");
});
