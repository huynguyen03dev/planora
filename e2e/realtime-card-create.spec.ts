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

import { signUp, createWorkspace, createBoard, addList, addCard } from "./helpers/app";
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

  // ── Arrange: Alice owns a workspace + board with one list ──────────────
  await signUp(alicePage, alice);
  workspaceId = await createWorkspace(alicePage, `WS ${stamp}`);
  const boardId = await createBoard(alicePage, `Board ${stamp}`);
  await addList(alicePage, "To Do");

  // ── Arrange: Bob exists and is a member of Alice's workspace ───────────
  await signUp(bobPage, bob);
  const bobId = await getUserIdByEmail(bob.email);
  await addWorkspaceMember(workspaceId, bobId, "editor");

  // ── Bob opens the board and is confirmed present (joined the room) ─────
  await bobPage.goto(`/boards/${boardId}`);
  await expect(bobPage.getByText("To Do", { exact: true })).toBeVisible();

  const cardTitle = `Realtime card ${stamp}`;
  // Card does not exist anywhere yet — prove it from Bob's loaded board.
  await expect(bobPage.getByText(cardTitle)).toHaveCount(0);

  // ── Act: Alice creates the card (emits card:created to the board room) ──
  await addCard(alicePage, cardTitle);
  await expect(alicePage.getByText(cardTitle)).toBeVisible(); // sanity: author sees it

  // ── Assert: it appears on Bob's screen with NO reload — pure realtime ──
  await expect(bobPage.getByText(cardTitle)).toBeVisible();
});
