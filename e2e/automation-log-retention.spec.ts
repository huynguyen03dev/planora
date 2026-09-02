/**
 * US-066 — automation rule execution logs MUST survive deletion of the rule.
 *
 * Before the fix, deleting a rule cascade-wiped its RuleExecutionLog rows.
 * After the fix, RuleExecutionLog denormalizes workspaceId + ruleName and the
 * rule FK is onDelete: SetNull, so logs persist with the remembered name.
 *
 * This spec proves it end-to-end through the real UI:
 *  create rule → trigger it → verify log exists → delete rule → reload →
 *  verify log STILL shows the rule name (not "Deleted rule", not empty).
 */
import { test, expect, type Page } from "@playwright/test";
import "dotenv/config";

import { Pool } from "pg";

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
  name: "Auto QA",
  email: `auto-log-${stamp}@e2e.test`,
  password: PASSWORD,
};

let page: Page;
let workspaceId: string | undefined;

test.afterAll(async () => {
  await cleanup({ workspaceId, emails: [user.email] });
  await disconnect();
});

/** Resolve a workspace slug from its id (direct DB — arrange step, not under test). */
async function getWorkspaceSlug(id: string): Promise<string> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query<{ slug: string }>(
      `SELECT slug FROM "workspace" WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (!rows[0]) throw new Error(`No workspace found for id ${id}`);
    return rows[0].slug;
  } finally {
    await pool.end();
  }
}

test("execution log survives rule deletion", async ({ browser }) => {
  const ctx = await browser.newContext();
  page = await ctx.newPage();

  // Step 1: sign up, create workspace + board + list
  await signUp(page, user);
  workspaceId = await createWorkspace(page, "Automation QA");
  const boardId = await createBoard(page, "Board");
  await addList(page, "To Do");
  const lists = await getListIdsByTitle(boardId);
  const listId = lists["To Do"];
  expect(listId, "list id should be resolved from the seeded list").toBeTruthy();

  const slug = await getWorkspaceSlug(workspaceId);

  // Step 2: create an automation rule
  await page.goto(`/workspace/${slug}/automation`);
  await page.getByRole("button", { name: "New rule" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("New automation rule")).toBeVisible();

  await page.locator("#rule-name").fill("Retention Rule");

  // Defaults are fine: trigger = "card-created", action = "set-priority" → Medium
  await page.getByRole("button", { name: "Create rule" }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Retention Rule", { exact: true })).toBeVisible();

  // Step 3: trigger the rule by creating a card
  await page.goto(`/boards/${boardId}`);
  await addCardToList(page, listId, "Trigger card");

  // Step 4: verify the execution log exists
  await page.goto(`/workspace/${slug}/automation`);

  // The log panel's empty state must NOT be showing
  await expect(
    page.getByText("No rule executions yet. Runs appear here as rules fire."),
  ).toHaveCount(0);

  const logEntry = page
    .locator("div")
    .filter({ hasText: "Retention Rule" })
    .filter({ hasText: /success/i })
    .first();
  await expect(logEntry).toBeVisible({ timeout: 10_000 });

  const logRuleName = logEntry.locator("span").filter({ hasText: "Retention Rule" }).first();
  await expect(logRuleName).toBeVisible();

  console.log("✓ Step 4: execution log exists with rule name 'Retention Rule' and status success");

  await page.screenshot({
    path: "e2e/.qa-artifacts/automation-log-pre-delete.png",
    fullPage: true,
  });

  // Step 5: delete the rule
  const deleteButton = page.getByRole("button", { name: "Delete Retention Rule" });
  await deleteButton.click();

  const alertDialog = page.getByRole("alertdialog", { name: "Delete this rule?" });
  await expect(alertDialog).toBeVisible();

  await alertDialog.getByRole("button", { name: "Delete rule" }).click();

  // Rule gone from the list — empty state appears
  await expect(
    page.getByText("No automation rules yet"),
  ).toBeVisible({ timeout: 10_000 });

  console.log("✓ Step 5: rule 'Retention Rule' deleted from the rules list");

  // Step 6: reload — the execution log MUST survive
  await page.reload();

  // The rules section must still show empty state
  await expect(
    page.getByText("No automation rules yet"),
  ).toBeVisible({ timeout: 10_000 });

  // THE CORE ASSERTION: the execution log is STILL present, and it STILL
  // shows the denormalized rule name "Retention Rule" — NOT "Deleted rule"
  // and NOT the empty "No rule executions yet" state.
  const postReloadEmpty = page.getByText(
    "No rule executions yet. Runs appear here as rules fire.",
  );
  await expect(postReloadEmpty).toHaveCount(0);

  const postReloadLogEntry = page
    .locator("div")
    .filter({ hasText: "Retention Rule" })
    .filter({ hasText: /success/i })
    .first();
  await expect(postReloadLogEntry).toBeVisible({ timeout: 10_000 });

  const postReloadRuleName = postReloadLogEntry
    .locator("span")
    .filter({ hasText: "Retention Rule" })
    .first();
  await expect(postReloadRuleName).toBeVisible();

  // Must NOT show "Deleted rule" fallback
  await expect(
    page.getByText("Deleted rule"),
  ).toHaveCount(0);

  console.log("✓ Step 6: after reload, log still shows rule name 'Retention Rule' — log SURVIVED deletion");

  await page.screenshot({
    path: "e2e/.qa-artifacts/automation-log-post-delete.png",
    fullPage: true,
  });
});
