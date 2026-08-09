/**
 * US-012 — two-client realtime: comment propagation + list reorder. Closes the
 * two slices the test matrix listed as pending (see docs/product/realtime-sync.md).
 * The six events that once lacked dedicated cross-client proof (card:updated,
 * list:created/updated/deleted, notification:new, analytics:refresh) are now
 * proven by US-083 W1 in e2e/realtime-event-proof.spec.ts (committed 937e75f),
 * with per-event emit-removal sabotage runs and a masking tripwire. This spec
 * covers the two remaining event families: comment:created + list:moved.
 *
 *  1. comment:created (in-place / live) — Alice posts a comment on a card; it
 *     appears live in Bob's already-open detail sheet (no reload).
 *  2. list:moved (STRUCTURAL) — Alice keyboard-reorders a list; Bob (not
 *     dragging) sees the columns reorder live. This is the first proof that a
 *     structural LIST event applies live on an observer — card structural events
 *     were proven in US-009, lists were not.
 *
 * Comments render only in the open card detail sheet; list order is read from
 * the columns' left-edge x. List drags use the keyboard sensor (the "Drag list"
 * handle shares the card drag-handle attribute), since @hello-pangea/dnd ignores
 * synthetic pointer/CDP drags.
 */
import { test, expect, type Page } from "@playwright/test";

import {
  signUp,
  createWorkspace,
  createBoard,
  addList,
  addCardToList,
  openCardDetail,
  postComment,
  dragListLeft,
  listColumnX,
  listColumnById,
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
};

/**
 * Arrange (fast path, not under test): Alice owns a workspace + board with the
 * given lists; Bob is seeded as an editor member directly. Mirrors the arrange
 * helper in the other realtime specs (kept local so those proven specs stay
 * untouched).
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
  return { alicePage, bobPage, boardId };
}

test("a comment posted by one user appears live in another's open card sheet (no reload)", async ({
  browser,
}) => {
  const tag = `${Date.now()}-comment`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag, ["To Do"]);

  const todo = (await getListIdsByTitle(boardId))["To Do"];
  await addCardToList(alicePage, todo, "Task");
  await getCardIdByTitle(boardId, "Task");

  await bobPage.goto(`/boards/${boardId}`);
  await openCardDetail(bobPage, "Task");
  await expect(bobPage.getByText("Hello from Alice", { exact: true })).toHaveCount(0);

  await alicePage.goto(`/boards/${boardId}`);
  await openCardDetail(alicePage, "Task");
  await postComment(alicePage, "Hello from Alice");
  await expect(alicePage.getByText("Hello from Alice", { exact: true })).toBeVisible(); // author sanity

  await expect(bobPage.getByText("Hello from Alice", { exact: true })).toBeVisible();
});

test("a list reordered by one user relocates live for another observer (no reload)", async ({
  browser,
}) => {
  const tag = `${Date.now()}-list-reorder`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag, ["To Do", "Doing"]);

  const lists = await getListIdsByTitle(boardId);
  const todo = lists["To Do"];
  const doing = lists["Doing"];

  await bobPage.goto(`/boards/${boardId}`);
  await expect(listColumnById(bobPage, todo)).toBeVisible();
  expect(await listColumnX(bobPage, todo)).toBeLessThan(await listColumnX(bobPage, doing));

  await alicePage.goto(`/boards/${boardId}`);
  await dragListLeft(alicePage, doing);
  await expect // author sanity: order flipped on Alice
    .poll(async () => (await listColumnX(alicePage, doing)) < (await listColumnX(alicePage, todo)))
    .toBe(true);

  // Structural list:moved applies on Bob (he is not dragging) — no reload.
  await expect
    .poll(async () => (await listColumnX(bobPage, doing)) < (await listColumnX(bobPage, todo)))
    .toBe(true);
});
