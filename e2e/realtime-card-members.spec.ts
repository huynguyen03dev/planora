/**
 * US-011 — two-client realtime: card-member assign/remove propagation.
 *
 * Sibling of US-010 (label CRUD): assignCardMemberAction / removeCardMemberAction
 * mutated the DB but emitted no card-member socket event, so a viewer with the
 * card's detail sheet open saw a stale assignee list until reload. US-011 makes
 * both actions emit the in-place `card:members-updated` event.
 *
 * Members render ONLY in the card detail sheet (never on the card face), so the
 * proof keeps the OBSERVER's sheet open and watches the assignee list:
 *
 *  1. assign — Alice assigns Bob; Bob's already-open sheet gains the assignee
 *     live (no reload).
 *  2. remove — Alice unassigns Bob; Bob's sheet drops the assignee live.
 *
 * The live signal is the per-assignee "Remove" button count inside the Members
 * section (editor-only; one per assignee). Member events are in-place/live, so
 * no drag is involved.
 */
import { test, expect, type Page } from "@playwright/test";

import {
  signUp,
  createWorkspace,
  createBoard,
  addList,
  addCardToList,
  openCardDetail,
  assignMemberInOpenCard,
  removeFirstMemberInOpenCard,
  assignedMemberRemoveButtons,
} from "./helpers/app";
import {
  addWorkspaceMember,
  getUserIdByEmail,
  getListIdsByTitle,
  getCardIdByTitle,
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

type TwoUserBoard = {
  alicePage: Page;
  bobPage: Page;
  boardId: string;
  bobEmail: string;
};

/**
 * Arrange (fast path, not under test): Alice owns a workspace + board + one list;
 * Bob is seeded as an editor member directly. Mirrors the arrange helper in the
 * other realtime specs (kept local so those proven specs stay untouched).
 */
async function setUpTwoUserBoard(
  browser: import("@playwright/test").Browser,
  tag: string,
): Promise<TwoUserBoard> {
  const alice = { name: "Alice", email: `alice-${tag}@e2e.test`, password: PASSWORD };
  const bob = { name: "Bob", email: `bob-${tag}@e2e.test`, password: PASSWORD };

  const alicePage = await (await browser.newContext()).newPage();
  const bobPage = await (await browser.newContext()).newPage();

  await signUp(alicePage, alice);
  const workspaceId = await createWorkspace(alicePage, `WS ${tag}`);
  const boardId = await createBoard(alicePage, `Board ${tag}`);
  await addList(alicePage, "To Do");

  await signUp(bobPage, bob);
  const bobId = await getUserIdByEmail(bob.email);
  await addWorkspaceMember(workspaceId, bobId, "editor");

  created.push({ workspaceId, emails: [alice.email, bob.email] });
  return { alicePage, bobPage, boardId, bobEmail: bob.email };
}

test("assigning and removing a card member propagates live to another viewer's open sheet (no reload)", async ({
  browser,
}) => {
  const tag = `${Date.now()}-members`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag);

  const todo = (await getListIdsByTitle(boardId))["To Do"];
  await addCardToList(alicePage, todo, "Task");
  await getCardIdByTitle(boardId, "Task"); // ensure the card committed before observers open it

  // Both users open the board, then the card. Bob opens first and sees NO
  // assignees yet.
  await bobPage.goto(`/boards/${boardId}`);
  await openCardDetail(bobPage, "Task");
  await expect(assignedMemberRemoveButtons(bobPage)).toHaveCount(0);

  // Alice opens the same card and assigns Bob via the "Add members" list.
  await alicePage.goto(`/boards/${boardId}`);
  await openCardDetail(alicePage, "Task");
  await assignMemberInOpenCard(alicePage, "Bob");

  // Assert: Bob's already-open sheet gains the assignee live — no reload.
  // (Remove-button count = assignee count; it was 0, now 1.)
  await expect(assignedMemberRemoveButtons(bobPage)).toHaveCount(1);

  // Alice unassigns Bob (her sheet refreshed to show his Remove control).
  await removeFirstMemberInOpenCard(alicePage);

  // Assert: Bob's sheet drops the assignee live.
  await expect(assignedMemberRemoveButtons(bobPage)).toHaveCount(0);
});
