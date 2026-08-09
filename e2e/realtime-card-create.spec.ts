/**
 * US-009 slice 1 — two-client realtime: card-create propagation.
 *
 * Proves the whole realtime wire end to end with two real users on one board:
 * socket connect → board:join room → Server Action emitCardCreated → broadcast
 * to the board room → client receives card:created → store apply → DOM update.
 *
 * The proof hinges on ORDERING: Bob loads the board and is confirmed present
 * BEFORE Alice creates the card. So the card cannot have arrived via Bob's SSR
 * page load — its appearance on Bob's screen, with no reload, is realtime or
 * nothing.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

import {
  signUp,
  createWorkspace,
  createBoard,
  addList,
  addCard,
  watcherAvatars,
} from "./helpers/app";
import { addWorkspaceMember, getUserIdByEmail, cleanup, disconnect } from "./helpers/db";

const PASSWORD = "e2e-password-123";
const stamp = Date.now();
const alice = { name: "Alice", email: `alice-${stamp}@e2e.test`, password: PASSWORD };
const bob = { name: "Bob", email: `bob-${stamp}@e2e.test`, password: PASSWORD };

let aliceCtx: BrowserContext;
let bobCtx: BrowserContext;
let alicePage: Page;
let bobPage: Page;
let workspaceId: string | undefined;

test.afterAll(async () => {
  await cleanup({ workspaceId, emails: [alice.email, bob.email] });
  await disconnect();
});

test("a card created by one user appears live for another on the same board", async ({ browser }) => {
  // Isolated sessions for the two users.
  aliceCtx = await browser.newContext();
  bobCtx = await browser.newContext();
  alicePage = await aliceCtx.newPage();
  bobPage = await bobCtx.newPage();

  // Arrange: Alice owns a workspace + board with one list
  await signUp(alicePage, alice);
  workspaceId = await createWorkspace(alicePage, `WS ${stamp}`);
  const boardId = await createBoard(alicePage, `Board ${stamp}`);
  await addList(alicePage, "To Do");

  // Arrange: Bob exists and is a member of Alice's workspace
  await signUp(bobPage, bob);
  const bobId = await getUserIdByEmail(bob.email);
  await addWorkspaceMember(workspaceId, bobId, "editor");

  // Bob opens the board and is confirmed present (joined the room)
  // Presence barrier (W1 discipline): BOTH sides must see two avatars — i.e.
  // Bob's socket CONNECTED AND JOINED the board room — before Alice acts. A
  // bare "list title visible" check only proves the page loaded; under load
  // the room join can land after Alice's emit, and the card:created broadcast
  // misses Bob with no fallback (observed RED on the 2026-08-02 full-suite
  // run). The connect-time badge resync (the one Server Action that POSTs to
  // the route on socket connect) is awaited the same way as the W1 specs, so
  // it can neither mask nor race the delivery.
  const resyncSettled = bobPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/boards/${boardId}`,
    { timeout: 20_000 },
  );
  await bobPage.goto(`/boards/${boardId}`);
  await resyncSettled;
  await expect(watcherAvatars(alicePage)).toHaveCount(2);
  await expect(watcherAvatars(bobPage)).toHaveCount(2);
  await expect(bobPage.getByText("To Do", { exact: true })).toBeVisible();

  const cardTitle = `Realtime card ${stamp}`;
  // Card does not exist anywhere yet — prove it from Bob's loaded board.
  await expect(bobPage.getByText(cardTitle)).toHaveCount(0);

  // Act: Alice creates the card (emits card:created to the board room)
  await addCard(alicePage, cardTitle);
  await expect(alicePage.getByText(cardTitle)).toBeVisible(); // sanity: author sees it

  // Assert: it appears on Bob's screen with NO reload — pure realtime
  await expect(bobPage.getByText(cardTitle)).toBeVisible();
});
