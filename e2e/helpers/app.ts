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
 * Keyboard-reorder a LIST one slot to the left. Lists are a horizontal droppable
 * whose drag handle (the list header — US-069) carries the same
 * `data-rfd-drag-handle-draggable-id`
 * attribute (= list.id) the card helpers use, so liftCard/moveLifted/dropCard are
 * reused verbatim — the keyboard sensor is draggable-type agnostic. Emits the
 * STRUCTURAL `list:moved`.
 */
export async function dragListLeft(page: Page, listId: string): Promise<void> {
  await liftCard(page, listId);
  await moveLifted(page, "ArrowLeft");
  await dropCard(page);
}

/** Left edge (x) of a list column — used to assert relative list order. */
export async function listColumnX(page: Page, listId: string): Promise<number> {
  const box = await listColumnById(page, listId).boundingBox();
  return box?.x ?? -1;
}

// ── Comments (composer in the open card detail sheet) ─────────────────────

/** Post a comment in the open card detail sheet; resolves once the composer clears. */
export async function postComment(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder("Write a comment...").fill(text);
  await page.getByRole("button", { name: /post comment/i }).click();
  await expect(page.getByPlaceholder("Write a comment...")).toHaveValue("");
}

/**
 * Archive a card via its detail sheet (mouse only — no keyboard sensor, so it
 * never disturbs another page's in-flight keyboard drag). The board face no
 * longer carries an actions menu: quick-actions are hover-only, and
 * archive-from-face is offered on completed cards only (US-069), so every card
 * is archived from the detail header. Scoped to the card by id via the
 * draggable wrapper. Emits a structural `card:archived`.
 */
export async function archiveCard(page: Page, cardId: string): Promise<void> {
  // The draggable wrapper IS the role="button" open surface (US-069 put both
  // data-rfd-draggable-id and role=button on the same div), so click it
  // directly — a descendant-scoped getByRole would match nothing.
  await page.locator(`[data-rfd-draggable-id="${cardId}"]`).click();
  // Header quick-action (aria-label) opens the confirm dialog.
  await page.getByRole("button", { name: "Archive card" }).first().click();
  // Confirm inside the alert dialog (scoped so it can't match the header button).
  await page
    .getByRole("alertdialog", { name: "Archive this card?" })
    .getByRole("button", { name: "Archive card" })
    .click();
}

// ── Card detail / rename ──────────────────────────────────────────────────

/**
 * Open a card's detail sheet by clicking its body. US-069 made the whole card
 * the open surface (the title is no longer its own button); the card exposes
 * `role="button"` with the accessible name "Open card <title>".
 */
export async function openCardDetail(page: Page, title: string): Promise<void> {
  await page
    .getByRole("button", { name: `Open card ${title}`, exact: true })
    .first()
    .click();
  await expect(page.locator("#card-detail-title")).toBeVisible();
}

/**
 * Rename the card whose detail sheet is open and save. US-032 removed the
 * "Save changes" button — every field now autosaves on blur. So: fill the
 * title, press Enter (which blurs → triggers the autosave transition), then
 * wait for the inline "Saving…" status to clear, i.e. the `card:updated` emit
 * has fired and the action resolved.
 */
export async function renameOpenCard(page: Page, newTitle: string): Promise<void> {
  const title = page.locator("#card-detail-title");
  await title.fill(newTitle);
  await title.press("Enter");
  await expect(page.getByText(/saving/i)).toHaveCount(0);
}

// ── Label management (in the open card detail sheet) ──────────────────────
// US-033 moved board-label CRUD (rename / recolor / delete / create) out of the
// inline card list into a "Manage labels" dialog (card-labels-section.tsx →
// ManageLabelsDialog). Each label there is an <li> that renders its name as text
// plus Edit / Delete controls. Driving rename/delete here exercises the real
// updateLabelAction / deleteLabelAction — the Server Actions whose realtime emit
// US-010 adds.

/** Open the "Manage labels" dialog from the open card sheet; returns its locator. */
async function openManageLabelsDialog(page: Page) {
  await page.getByRole("button", { name: /manage labels/i }).click();
  const dialog = page.getByRole("dialog", { name: /manage board labels/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Rename a board label via the "Manage labels" dialog: open → Edit → fill name →
 * Save. Resolves once the inline editor has closed (the action resolved and
 * router.refresh reseeded), i.e. the `card:labels-updated` fan-out was emitted.
 */
export async function renameBoardLabel(
  page: Page,
  currentName: string,
  newName: string,
): Promise<void> {
  const dialog = await openManageLabelsDialog(page);
  await dialog
    .locator("li")
    .filter({ hasText: currentName })
    .getByRole("button", { name: /^edit$/i })
    .click();
  const nameInput = dialog.getByPlaceholder("Label name");
  await nameInput.fill(newName);
  await dialog.getByRole("button", { name: /^save$/i }).click();
  await expect(nameInput).toHaveCount(0);
}

/**
 * Delete a board label via the "Manage labels" dialog. Resolves once the label
 * row is gone (the delete resolved), i.e. the fan-out has been emitted.
 */
export async function deleteBoardLabel(page: Page, name: string): Promise<void> {
  const dialog = await openManageLabelsDialog(page);
  const row = dialog.locator("li").filter({ hasText: name });
  await row.getByRole("button", { name: /^delete$/i }).click();
  await expect(row).toHaveCount(0);
}

// ── Card members (in the open card detail sheet) ──────────────────────────
// Members render ONLY in the card detail sheet (never on the card face), so the
// realtime proof observes the open sheet. assignCardMemberAction /
// removeCardMemberAction are the actions whose realtime emit US-011 adds.

/**
 * The Members section of the open card detail sheet. US-043/052 replaced the
 * old `<section>` + "Members" heading with a `<div id="card-section-members">`
 * (a plain label span, no heading), so scope by that id.
 */
export function cardMembersSection(page: Page) {
  return page.locator("#card-section-members");
}

/**
 * Assigned-member remove buttons in the open sheet — exactly one per assignee.
 * US-043 made each an icon-only "×" button labelled `aria-label="Remove {name}"`
 * (not a text "Remove" button), so match names starting "Remove ". Count is
 * therefore the live assignee count.
 */
export function assignedMemberRemoveButtons(page: Page) {
  return cardMembersSection(page).getByRole("button", { name: /^remove\s/i });
}

/**
 * Assign a member to the open card. US-043/052 moved the assignable list behind
 * an "Add" popover: click the trigger, then pick the member (by name/email)
 * from the portaled popover content.
 */
export async function assignMemberInOpenCard(page: Page, match: string | RegExp): Promise<void> {
  await cardMembersSection(page).getByRole("button", { name: /^add$/i }).click();
  const popover = page
    .locator('[data-slot="popover-content"]')
    .filter({ hasText: "Assign members" });
  await popover
    .getByRole("button", { name: typeof match === "string" ? new RegExp(match) : match })
    .click();
}

/** Remove the first assigned member from the open card (clicks their "Remove"). */
export async function removeFirstMemberInOpenCard(page: Page): Promise<void> {
  await assignedMemberRemoveButtons(page).first().click();
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

/**
 * A card-face label mark by name, scoped to a list's droppable. US-044 renders
 * labels as a compact color "bar" by default (name only in `aria-label`/`title`,
 * no visible text node) and as a text "chip" when labels are expanded — so
 * `getByText` misses the default. Both variants set `title={label.name}`, so
 * match by title to cover either rendering.
 */
export function cardLabelInListById(page: Page, listId: string, labelName: string) {
  return page.locator(`[data-rfd-droppable-id="${listId}"]`).getByTitle(labelName, { exact: true });
}
