/**
 * UI flow helpers for the realtime E2E harness — drive the real app the way a
 * user does (sign up, create workspace/board, add list/card). Selectors mirror
 * the live components (see add-list-button.tsx, list-column.tsx,
 * create-{workspace,board}-modal.tsx). Fresh signup per run keeps logins
 * deterministic; callers pass unique emails.
 */
import { expect, type Page } from "@playwright/test";

export type Creds = { name: string; email: string; password: string };

/** Sign up a brand-new user via /sign-up; resolves once on the boards page. */
export async function signUp(page: Page, creds: Creds): Promise<void> {
  await page.goto("/sign-up");
  await page.locator("#name").fill(creds.name);
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.waitForURL(/\/boards/, { timeout: 30_000 });
}

/** Create a workspace from the boards page; returns its id (from the URL). */
export async function createWorkspace(page: Page, name: string): Promise<string> {
  await page.getByRole("button", { name: /create workspace/i }).first().click();
  await page.locator("#workspaceName").fill(name);
  await page.getByRole("button", { name: /^create$/i }).click();
  await page.waitForURL(/\/boards\?workspace=/, { timeout: 30_000 });
  const id = new URL(page.url()).searchParams.get("workspace");
  expect(id, "workspace id should be in the URL").toBeTruthy();
  return id as string;
}

/** Create a board in the current workspace; returns its id (from the URL). */
export async function createBoard(page: Page, title: string): Promise<string> {
  await page.getByRole("button", { name: /create board/i }).first().click();
  await page.locator("#boardTitle").fill(title);
  await page.getByRole("button", { name: /^create$/i }).click();
  await page.waitForURL(/\/boards\/[0-9a-f-]{36}/i, { timeout: 30_000 });
  const id = page.url().split("/boards/")[1]?.split(/[?#]/)[0];
  expect(id, "board id should be in the URL").toBeTruthy();
  return id as string;
}

/** Add a list to the open board; resolves once the list title is visible. */
export async function addList(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: /add a list/i }).click();
  await page.getByPlaceholder("Enter list title...").fill(title);
  await page.getByRole("button", { name: /^add list$/i }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

/** Add a card to the (only/first) list's composer on the open board. */
export async function addCard(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: /add a card/i }).first().click();
  await page.getByPlaceholder("Enter card title...").fill(title);
  await page.getByRole("button", { name: /^add card$/i }).click();
}
