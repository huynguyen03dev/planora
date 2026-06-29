/**
 * US-041 — two-client realtime: live board presence ("who's viewing now").
 *
 * When two users have the same board open, each should see BOTH avatars in the
 * header's "Viewing now" group — and one disappears live when its user leaves.
 *
 * Reproduces the reported bug: an invited viewer opens the board, but each side
 * only ever shows itself (presence never crosses).
 *
 * The live signal is the count of avatars inside the AvatarGroup
 * (`aria-label="Viewing now"`); each watcher renders one `[data-slot="avatar"]`.
 */
import { test, expect, type Page, type Browser } from "@playwright/test";

import {
  signUp,
  createWorkspace,
  createBoard,
  addList,
} from "./helpers/app";
import {
  addWorkspaceMember,
  getUserIdByEmail,
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

function watcherAvatars(page: Page) {
  return page.locator('[aria-label="Viewing now"] [data-slot="avatar"]');
}

async function setUpTwoUserBoard(browser: Browser, tag: string) {
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
  await addWorkspaceMember(workspaceId, bobId, "viewer");

  created.push({ workspaceId, emails: [alice.email, bob.email] });
  return { alicePage, bobPage, boardId };
}

test("both users viewing one board each see two presence avatars, and one drops on leave", async ({
  browser,
}) => {
  const tag = `${Date.now()}-presence`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag);

  // Alice opens the board first — she alone is viewing.
  await alicePage.goto(`/boards/${boardId}`);
  await expect(watcherAvatars(alicePage)).toHaveCount(1);

  // Bob (a viewer) opens the same board. Now BOTH sides should show two avatars.
  await bobPage.goto(`/boards/${boardId}`);
  await expect(watcherAvatars(bobPage)).toHaveCount(2);
  await expect(watcherAvatars(alicePage)).toHaveCount(2);

  // Bob leaves; Alice's presence drops back to just herself, live.
  await bobPage.close();
  await expect(watcherAvatars(alicePage)).toHaveCount(1);
});
