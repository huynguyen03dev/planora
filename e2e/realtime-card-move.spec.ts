/**
 * US-009 slice 2 — two-client realtime: card MOVE propagation + the drag-aware
 * deferral invariant (the headline real-time rule, see docs/ARCHITECTURE.md
 * "Real-time: Drag-Aware Deferral").
 *
 * Two tests, two real users on one board, driven over the real server.ts +
 * Socket.io wire:
 *
 *  1. card:moved propagates — Alice drags a card across lists; it relocates on
 *     Bob's already-loaded board with no reload.
 *  2. drag-aware deferral — while Bob is mid-drag, a remote STRUCTURAL event
 *     (a card archive) is DEFERRED (not applied to the list array under
 *     @hello-pangea/dnd), then reconciled via router.refresh() when Bob drops.
 *     A live-applied rename is used as a delivery barrier so the deferral
 *     assertion is deterministic, not timing-based.
 *
 * Card drags are driven with the keyboard sensor (focus handle → Space →
 * arrows → Space); @hello-pangea/dnd ignores synthetic pointer/CDP drags. The
 * deferral test deliberately triggers the remote event with the MOUSE (archive
 * via the card menu), because a second keyboard drag in the other browser would
 * contend for foreground focus and could cancel Bob's held drag. The invariant
 * is event-type-agnostic (moved/created/deleted/archived all defer), so a
 * mouse-driven archive proves it without that fragility; test 1 already proves
 * card:moved specifically. See e2e/helpers/app.ts.
 */
import { test, expect, type Page } from "@playwright/test";

import {
  signUp,
  createWorkspace,
  createBoard,
  addList,
  addCardToList,
  dragCardToNextList,
  liftCard,
  dropCard,
  archiveCard,
  openCardDetail,
  renameOpenCard,
  cardInListById,
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
 * Arrange (fast path, not under test): Alice signs up and owns a workspace +
 * board with the given lists (left→right in array order); Bob signs up and is
 * seeded as an editor member directly. Returns both pages and the ids. `tag`
 * keeps per-test emails unique.
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

test("a card moved across lists by one user relocates live for another (no reload)", async ({
  browser,
}) => {
  const tag = `${Date.now()}-move`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag, ["To Do", "Doing"]);

  const lists = await getListIdsByTitle(boardId);
  const todo = lists["To Do"];
  const doing = lists["Doing"];

  // Alice seeds a card in "To Do".
  await addCardToList(alicePage, todo, "Card X");
  const cardId = await getCardIdByTitle(boardId, "Card X");

  // Bob opens the board; the card starts in "To Do" and is NOT in "Doing".
  await bobPage.goto(`/boards/${boardId}`);
  await expect(cardInListById(bobPage, todo, "Card X")).toBeVisible();
  await expect(cardInListById(bobPage, doing, "Card X")).toHaveCount(0);

  // Act: Alice keyboard-drags the card "To Do" → "Doing".
  await dragCardToNextList(alicePage, cardId);
  await expect(cardInListById(alicePage, doing, "Card X")).toBeVisible(); // author sanity

  // Assert: it relocates on Bob's board with no reload — pure realtime card:moved.
  await expect(cardInListById(bobPage, doing, "Card X")).toBeVisible();
  await expect(cardInListById(bobPage, todo, "Card X")).toHaveCount(0);
});

test("a structural remote event is deferred while the observer is mid-drag, then reconciled on drop", async ({
  browser,
}) => {
  const tag = `${Date.now()}-defer`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag, ["To Do", "Doing"]);

  const lists = await getListIdsByTitle(boardId);
  const todo = lists["To Do"];
  const doing = lists["Doing"];

  // Bob's card lives in "To Do" (the list he will keep dragging within), while
  // the cards Alice mutates live in "Doing" — so the live rename re-render never
  // touches Bob's dragged list's array.
  await addCardToList(alicePage, todo, "Bob card");
  await addCardToList(alicePage, doing, "Alice card");
  await addCardToList(alicePage, doing, "Marker");
  const bobCardId = await getCardIdByTitle(boardId, "Bob card");
  const aliceCardId = await getCardIdByTitle(boardId, "Alice card");

  // Bob opens the board; all three cards present in their starting lists.
  await bobPage.goto(`/boards/${boardId}`);
  await expect(cardInListById(bobPage, todo, "Bob card")).toBeVisible();
  await expect(cardInListById(bobPage, doing, "Alice card")).toBeVisible();
  await expect(cardInListById(bobPage, doing, "Marker")).toBeVisible();

  // Bob lifts his card and HOLDS it — a keyboard drag is now in flight, so the
  // store's isDragging gate is armed and structural remote events defer.
  await liftCard(bobPage, bobCardId);

  // Alice archives her card (mouse only — does not disturb Bob's held drag).
  // This emits a structural card:archived that Bob must defer.
  await archiveCard(alicePage, aliceCardId);
  // Confirm it committed on Alice (so card:archived has been emitted) before the
  // rename below. socket.io delivers archive-before-rename on Bob's connection.
  await expect(cardInListById(alicePage, doing, "Alice card")).toHaveCount(0);

  // Alice renames "Marker". card:updated is an in-place patch applied LIVE on
  // the observer even mid-drag — so Bob receiving it is a delivery barrier:
  // once the rename shows on Bob, the earlier card:archived was delivered too.
  await openCardDetail(alicePage, "Marker");
  await renameOpenCard(alicePage, "Marker RENAMED");

  // Barrier reached on Bob's still-dragging board.
  await expect(cardInListById(bobPage, doing, "Marker RENAMED")).toBeVisible();

  // ── Deferral proof ────────────────────────────────────────────────────────
  // The archive was delivered (the rename, emitted after it, is already showing)
  // yet NOT applied: "Alice card" is still present on Bob's board — it was not
  // removed from the list array under the active drag.
  await expect(cardInListById(bobPage, doing, "Alice card")).toHaveCount(1);

  // Bob drops his card. onDragEnd consumes the pending resync and pulls
  // canonical server state via router.refresh().
  await dropCard(bobPage);

  // ── Reconciliation proof ──────────────────────────────────────────────────
  // The deferred archive now folds in: "Alice card" disappears on Bob's view,
  // while the live rename remains.
  await expect(cardInListById(bobPage, doing, "Alice card")).toHaveCount(0);
  await expect(cardInListById(bobPage, doing, "Marker RENAMED")).toBeVisible();
});
