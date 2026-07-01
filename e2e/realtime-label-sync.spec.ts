/**
 * US-010 — two-client realtime: board-label CRUD propagation.
 *
 * Completes a documented limitation of US-005: attaching/detaching a label
 * already broadcasts (`card:labels-updated`), but renaming/recoloring or
 * deleting a label did NOT — `updateLabelAction`/`deleteLabelAction` only
 * `revalidatePath`, so other viewers saw stale chips until reload. US-010 makes
 * those actions fan the same in-place `card:labels-updated` event out to every
 * card carrying the label.
 *
 * Two real users on one board, over the real server.ts + Socket.io wire:
 *
 *  1. rename — Alice renames a label attached to a card; the chip text updates
 *     live on Bob's already-loaded board with no reload.
 *  2. delete — Alice deletes a label; the chip disappears live on Bob's board.
 *
 * The label + attachment are seeded directly in the DB (arrange, not under
 * test — like membership in the other specs); the rename/delete ACT goes through
 * the real card-detail-sheet UI so the genuine Server Action emits. Label events
 * are in-place/live (never deferred), so no drag is involved.
 */
import { test, expect, type Page } from "@playwright/test";

import {
  signUp,
  createWorkspace,
  createBoard,
  addList,
  addCardToList,
  openCardDetail,
  renameBoardLabel,
  deleteBoardLabel,
  cardLabelInListById,
} from "./helpers/app";
import {
  addWorkspaceMember,
  getUserIdByEmail,
  getListIdsByTitle,
  getCardIdByTitle,
  addLabel,
  attachLabel,
  cleanup,
  disconnect,
} from "./helpers/db";

const PASSWORD = "e2e-password-123";

// Track every workspace/user created so afterAll can cascade-delete them all.
const created: Array<{ workspaceId?: string; emails: string[] }> = [];

test.afterAll(async () => {
  for (const target of created) {
    await cleanup(target);
  }
  await disconnect();
});

type TwoUserBoard = {
  alicePage: Page;
  bobPage: Page;
  workspaceId: string;
  boardId: string;
};

/**
 * Arrange (fast path, not under test): Alice owns a workspace + board with the
 * given lists; Bob is seeded as an editor member directly. Mirrors the arrange
 * helper in realtime-card-move.spec.ts (kept local so that proven spec is
 * untouched). `tag` keeps per-test emails unique.
 */
async function setUpTwoUserBoard(
  browser: import("@playwright/test").Browser,
  tag: string,
  listTitles: string[],
): Promise<TwoUserBoard> {
  const alice = { name: "Alice", email: `alice-${tag}@e2e.test`, password: PASSWORD };
  const bob = { name: "Bob", email: `bob-${tag}@e2e.test`, password: PASSWORD };

  const alicePage = await (await browser.newContext()).newPage();
  const bobPage = await (await browser.newContext()).newPage();

  await signUp(alicePage, alice);
  const workspaceId = await createWorkspace(alicePage, `WS ${tag}`);
  const boardId = await createBoard(alicePage, `Board ${tag}`);
  for (const title of listTitles) {
    await addList(alicePage, title);
  }

  await signUp(bobPage, bob);
  const bobId = await getUserIdByEmail(bob.email);
  await addWorkspaceMember(workspaceId, bobId, "editor");

  created.push({ workspaceId, emails: [alice.email, bob.email] });
  return { alicePage, bobPage, workspaceId, boardId };
}

test("a label renamed by one user updates the chip live for another (no reload)", async ({
  browser,
}) => {
  const tag = `${Date.now()}-label-rename`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag, ["To Do"]);

  const todo = (await getListIdsByTitle(boardId))["To Do"];

  // Seed a card carrying a label "Triage" (label name distinct from the card
  // title so a chip assertion can't match the title by accident).
  await addCardToList(alicePage, todo, "Task");
  const cardId = await getCardIdByTitle(boardId, "Task");
  const labelId = await addLabel(boardId, "Triage", "#0079BF");
  await attachLabel(cardId, labelId);

  // Bob opens the board; the "Triage" chip is on the card face.
  await bobPage.goto(`/boards/${boardId}`);
  await expect(cardLabelInListById(bobPage, todo, "Triage")).toBeVisible();

  // Act: Alice opens the card and renames the label via the detail sheet.
  await openCardDetail(alicePage, "Task");
  await renameBoardLabel(alicePage, "Triage", "Renamed-Triage");

  // Assert: the chip text updates live on Bob's board — no reload.
  await expect(cardLabelInListById(bobPage, todo, "Renamed-Triage")).toBeVisible();
  await expect(cardLabelInListById(bobPage, todo, "Triage")).toHaveCount(0);
});

test("a label deleted by one user removes the chip live for another (no reload)", async ({
  browser,
}) => {
  const tag = `${Date.now()}-label-delete`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag, ["To Do"]);

  const todo = (await getListIdsByTitle(boardId))["To Do"];

  await addCardToList(alicePage, todo, "Task");
  const cardId = await getCardIdByTitle(boardId, "Task");
  const labelId = await addLabel(boardId, "Obsolete", "#B04632");
  await attachLabel(cardId, labelId);

  // Bob opens the board; the "Obsolete" chip is on the card face.
  await bobPage.goto(`/boards/${boardId}`);
  await expect(cardLabelInListById(bobPage, todo, "Obsolete")).toBeVisible();

  // Act: Alice opens the card and deletes the label via the detail sheet.
  await openCardDetail(alicePage, "Task");
  await deleteBoardLabel(alicePage, "Obsolete");

  // Assert: the chip disappears live on Bob's board — no reload.
  await expect(cardLabelInListById(bobPage, todo, "Obsolete")).toHaveCount(0);
});
