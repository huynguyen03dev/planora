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

/**
 * Add a card to a specific list's composer. The list is scoped by its id via
 * the column's `data-rfd-draggable-id` (a list column is draggable under id =
 * list.id), so this is unambiguous even with several same-named buttons around.
 */
export async function addCardToList(page: Page, listId: string, cardTitle: string): Promise<void> {
  const column = listColumnById(page, listId);
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Enter card title...").fill(cardTitle);
  await column.getByRole("button", { name: /^add card$/i }).click();
  await expect(cardInListById(page, listId, cardTitle)).toBeVisible();
}

// ── Keyboard drag-and-drop ────────────────────────────────────────────────
// @hello-pangea/dnd's pointer/CDP drag does NOT engage the sensor; the keyboard
// sensor does. Each step is gated on the library's own `aria-live` announcement
// (a visually-hidden `[id^="rfd-announcement-"]` region), which is the
// deterministic signal that the lift/move/drop actually took effect — far less
// flaky than fixed waits.

/** The board's @hello-pangea/dnd screen-reader announcement region. */
function announcement(page: Page) {
  return page.locator('[id^="rfd-announcement-"]').first();
}

/**
 * Focus a card's drag handle and lift it (Space). Resolves once lifted.
 *
 * `bringToFront()` first: the @hello-pangea/dnd keyboard sensor only engages the
 * Space keydown when the page is the active one. Even then, a page that has just
 * come to the foreground can swallow its very first Space, so we retry — but
 * only re-press while the live region shows the card is NOT yet lifted, so a
 * lift that landed is never accidentally dropped by a second Space.
 */
export async function liftCard(page: Page, cardId: string): Promise<void> {
  await page.bringToFront();
  const handle = page.locator(`[data-rfd-drag-handle-draggable-id="${cardId}"]`);
  const region = announcement(page);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (/lifted an item/i.test((await region.textContent()) ?? "")) return;
    await handle.focus();
    await page.keyboard.press("Space");
    try {
      await expect(region).toContainText(/lifted an item/i, { timeout: 1500 });
      return;
    } catch {
      // Foreground not settled yet — the press was swallowed; loop and retry.
    }
  }
  throw new Error(`liftCard: keyboard lift never engaged for card ${cardId}`);
}

/** Move a lifted card one step in a direction (across lists with Left/Right). */
export async function moveLifted(
  page: Page,
  key: "ArrowRight" | "ArrowLeft" | "ArrowUp" | "ArrowDown",
): Promise<void> {
  await page.keyboard.press(key);
  await expect(announcement(page)).toContainText(/moved the item/i, { timeout: 10_000 });
}

/** Drop the currently-lifted card (Space). Resolves once dropped. */
export async function dropCard(page: Page): Promise<void> {
  await page.keyboard.press("Space");
  await expect(announcement(page)).toContainText(/dropped the item/i, { timeout: 10_000 });
}

/** Lift a card, move it into the adjacent list to the right, and drop it. */
export async function dragCardToNextList(page: Page, cardId: string): Promise<void> {
  await liftCard(page, cardId);
  await moveLifted(page, "ArrowRight");
  await dropCard(page);
}

/**
 * Archive a card via its actions menu (mouse only — no keyboard sensor, so it
 * never disturbs another page's in-flight keyboard drag). Scoped to the card by
 * id via the draggable wrapper. Emits a structural `card:archived`.
 */
export async function archiveCard(page: Page, cardId: string): Promise<void> {
  await page
    .locator(`[data-rfd-draggable-id="${cardId}"]`)
    .getByRole("button", { name: "Card actions" })
    .click();
  await page.getByRole("menuitem", { name: /archive/i }).click();
  await page.getByRole("button", { name: /archive card/i }).click();
}

// ── Card detail / rename ──────────────────────────────────────────────────

/** Open a card's detail sheet by clicking its title button. */
export async function openCardDetail(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: title, exact: true }).first().click();
  await expect(page.locator("#card-detail-title")).toBeVisible();
}

/**
 * Rename the card whose detail sheet is open and save. Resolves once the save
 * action has resolved (button back to "Save changes" and disabled because the
 * draft now matches the persisted title) — i.e. the `card:updated` emit fired.
 */
export async function renameOpenCard(page: Page, newTitle: string): Promise<void> {
  await page.locator("#card-detail-title").fill(newTitle);
  const save = page.getByRole("button", { name: /save changes/i });
  await save.click();
  await expect(save).toHaveText(/save changes/i);
  await expect(save).toBeDisabled();
}

// ── List/card scoping locators (strict, id-based) ─────────────────────────

/** A list column root, scoped by list id (the column is draggable under that id). */
export function listColumnById(page: Page, listId: string) {
  return page.locator(`[data-rfd-draggable-id="${listId}"]`);
}

/** A card by title, scoped to a specific list's droppable (by list id). */
export function cardInListById(page: Page, listId: string, cardTitle: string) {
  return page.locator(`[data-rfd-droppable-id="${listId}"]`).getByText(cardTitle, { exact: true });
}
