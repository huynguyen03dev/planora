/**
 * US-083 W1 — two-client realtime proof for the six remaining events.
 *
 * The demo-ready daily work loop (W3 fixture) depends on six realtime events
 * that existed in production but had no dedicated cross-client proof:
 * `card:updated`, `list:created`, `list:updated`, `list:deleted` (the archive
 * path), `notification:new`, and `analytics:refresh`. This spec closes that
 * proof gap: for every event, one test drives the REAL Server Action from
 * client A and asserts the observable change appears live on client B's
 * already-loaded page — the assertion path contains no navigation, reload, or
 * socket reconnect, so an emit-removal sabotage run cannot be masked by a
 * fallback refresh.
 *
 * Ordering discipline (US-009): Bob is confirmed present — both sides show two
 * presence avatars, i.e. Bob's socket joined the board room — BEFORE Alice
 * acts. Nothing on Bob's screen can therefore have arrived via his initial
 * page load; it is realtime or nothing. No fixed sleeps are used as delivery
 * proof: every assertion waits on the browser observable itself. Two barriers
 * make the proof window clean: (1) the connect-resync settle — the header's
 * connect-time unread resync is a Server Action that re-renders the current
 * route, so it is awaited before Alice acts (it would otherwise revert
 * observer changes or refresh from DB); (2) the masking tripwire — after the
 * barrier, any full reload, socket.io disconnect/reconnect, or route
 * re-render POST on Bob's page fails the test, so a removed emit can never
 * turn green from an onConnect fallback (header unread resync / board
 * provider reconnect refresh) reading persisted DB state.
 *
 * Observables:
 * - card:updated: card face title changes on Bob's board (applyRemoteCardUpdated).
 * - list:created: new list title appears on Bob's board (applyRemoteListCreated).
 * - list:updated: renamed list title on Bob's board (applyRemoteListUpdated).
 * - list:deleted: archived list column leaves Bob's board (applyRemoteListDeleted).
 * - notification:new: Alice mentions Bob through the real comment UI; Bob is a
 *   workspace member ONLY (not card member/creator — so exactly one
 *   notification exists), stays on the board page, and his bell badge shows
 *   exactly "Notifications (1 unread)". The tripwire excludes the unread-count
 *   reconnect fallback specifically — not just browser load.
 * - analytics:refresh: Bob's dashboard FlowChart "Created" metric appears after
 *   Alice creates a card (workspace-room signal → 700ms debounce →
 *   router.refresh — an RSC GET, so the route-POST tripwire is armed on the
 *   dashboard route too). The dashboard starts EMPTY (FlowChart empty state)
 *   and the test first waits for the header's connect-time unread resync — a
 *   Server Action that re-renders the current route and would otherwise mask a
 *   removed emit — to settle before Alice acts. The metric is exposed via the
 *   data-testid `flow-chart-created-total` — the only production change —
 *   because the DOM otherwise offers no stable hook for that figure.
 *
 * Sabotage evidence (emit removed in lib/realtime/server.ts → observer red for
 * each event) is recorded in the US-083 execplan.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";

import {
  signUp,
  createWorkspace,
  createBoard,
  addList,
  addCardToList,
  openCardDetail,
  renameOpenCard,
  renameList,
  archiveList,
  postComment,
  listColumnById,
  cardInListById,
  watcherAvatars,
  flowChartCreatedTotal,
} from "./helpers/app";
import {
  addWorkspaceMember,
  getUserIdByEmail,
  getListIdsByTitle,
  getWorkspaceSlug,
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
 * given lists; Bob is seeded as a workspace member directly (default editor).
 * Mirrors the arrange helpers in the other realtime specs. `tag` keeps
 * per-test emails unique.
 */
async function setUpTwoUserBoard(
  browser: Browser,
  tag: string,
  listTitles: string[],
  bobRole: "admin" | "editor" | "viewer" = "editor",
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
  await addWorkspaceMember(workspaceId, bobId, bobRole);

  created.push({ workspaceId, emails: [alice.email, bob.email] });
  return { alicePage, bobPage, workspaceId, boardId };
}

type TripwireCounts = {
  reloads: number;
  wsOpens: number;
  wsCloses: number;
  routePosts: number;
};

/**
 * Masking tripwire — the observer-side cleanliness gate for every proof
 * window. Counts the lifecycle events that can re-render Bob's page from
 * persisted DB state and turn a sabotage run green without the emitter:
 *
 * - `load`: full page reload (fresh SSR from DB, fresh socket connect).
 * - socket.io websocket open/close: a socket disconnect/reconnect runs the
 *   production onConnect fallbacks — the header unread-count Server Action
 *   (`getInboxBadgeCountsAction` — US-083 W2 combined unread+invitation resync) and the board provider's reconnect
 *   `router.refresh()` (board-store-provider.tsx) — both of which re-render
 *   from the DB.
 * - POST to the current route: the observable form of any soft route re-render
 *   / resync Server Action. Armed for EVERY proof window — Next.js
 *   `router.refresh()` is an RSC GET (observed on the wire), so a route POST
 *   is never legitimate delivery. In the analytics window this is what catches
 *   a polling-transport reconnect: it produces no websocket events at all, but
 *   the onConnect header unread resync still POSTs to the dashboard route.
 *
 * Usage: arm BEFORE the page loads, snapshot `counts` AFTER the connect/resync
 * barrier settles (baseline = initial load + initial WS + barrier resync), then
 * `check(baseline)` after the observer assertion. Any delta fails the test, so
 * the proof window is clean or the test is red — a removed emit can never turn
 * green from a fallback refresh. (The HMR websocket also connects in dev; only
 * `/socket.io/` sockets are counted.)
 */
function armProofTripwire(page: Page, routePathname?: string) {
  const counts: TripwireCounts = { reloads: 0, wsOpens: 0, wsCloses: 0, routePosts: 0 };

  page.on("load", () => {
    counts.reloads += 1;
  });
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/socket.io/")) return;
    counts.wsOpens += 1;
    ws.on("close", () => {
      counts.wsCloses += 1;
    });
  });
  if (routePathname) {
    page.on("request", (req) => {
      if (req.method() === "POST" && new URL(req.url()).pathname === routePathname) {
        counts.routePosts += 1;
      }
    });
  }

  return {
    counts,
    check(baseline: TripwireCounts, windowLabel: string) {
      expect(
        counts.reloads,
        `${windowLabel}: full reload during the proof window`,
      ).toBe(baseline.reloads);
      expect(
        counts.wsOpens,
        `${windowLabel}: socket (re)connect during the proof window`,
      ).toBe(baseline.wsOpens);
      expect(
        counts.wsCloses,
        `${windowLabel}: socket disconnect during the proof window`,
      ).toBe(baseline.wsCloses);
      if (routePathname) {
        expect(
          counts.routePosts,
          `${windowLabel}: route re-render POST during the proof window`,
        ).toBe(baseline.routePosts);
      }
    },
  };
}

/**
 * Presence barrier: Bob opens the board and BOTH sides see two presence
 * avatars, proving Bob's socket connected AND joined the board room before any
 * act. Alice's avatar count is asserted first so Bob's join is confirmed from
 * the server's own broadcast, not just Bob's self-render.
 *
 * Also awaits Bob's connect-time badge resync (`getInboxBadgeCountsAction`
 * from the header, US-062 mn8): that Server Action re-renders the CURRENT route
 * server-side and returns a fresh RSC payload, so if it committed AFTER an
 * observer assertion it would revert the store-applied change and mask a
 * removed emit (observed flake on card:updated). Awaiting it closes the race
 * for every board test — from here on Bob's board DOM only changes via
 * socket events.
 */
async function joinBoardAndConfirmPresence(
  alicePage: Page,
  bobPage: Page,
  boardId: string,
): Promise<void> {
  const resyncSettled = bobPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/boards/${boardId}`,
    { timeout: 20_000 },
  );
  await bobPage.goto(`/boards/${boardId}`);
  await expect(watcherAvatars(alicePage)).toHaveCount(2);
  await expect(watcherAvatars(bobPage)).toHaveCount(2);
  await resyncSettled;
}

test("card:updated — a card renamed by one user updates the face live for another (no reload)", async ({
  browser,
}) => {
  const tag = `${Date.now()}-card-updated`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag, ["To Do"]);

  const todo = (await getListIdsByTitle(boardId))["To Do"];
  await addCardToList(alicePage, todo, "Original card");

  const tripwire = armProofTripwire(bobPage, `/boards/${boardId}`);
  await joinBoardAndConfirmPresence(alicePage, bobPage, boardId);
  const baseline = { ...tripwire.counts };
  await expect(cardInListById(bobPage, todo, "Original card")).toBeVisible();

  await openCardDetail(alicePage, "Original card");
  await renameOpenCard(alicePage, "Renamed card");

  await expect(cardInListById(bobPage, todo, "Renamed card")).toBeVisible();
  await expect(cardInListById(bobPage, todo, "Original card")).toHaveCount(0);
  tripwire.check(baseline, "card:updated proof window");
});

test("list:created — a list added by one user appears live for another (no reload)", async ({
  browser,
}) => {
  const tag = `${Date.now()}-list-created`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag, ["To Do"]);

  const tripwire = armProofTripwire(bobPage, `/boards/${boardId}`);
  await joinBoardAndConfirmPresence(alicePage, bobPage, boardId);
  const baseline = { ...tripwire.counts };

  const newListTitle = `Sprint ${tag}`;
  // Unique title — its appearance on Bob's loaded board is non-vacuous.
  await expect(bobPage.getByText(newListTitle, { exact: true })).toHaveCount(0);

  await addList(alicePage, newListTitle);

  await expect(bobPage.getByText(newListTitle, { exact: true })).toBeVisible();
  tripwire.check(baseline, "list:created proof window");
});

test("list:updated — a list renamed by one user updates live for another (no reload)", async ({
  browser,
}) => {
  const tag = `${Date.now()}-list-updated`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag, ["To Do"]);

  const todo = (await getListIdsByTitle(boardId))["To Do"];
  const tripwire = armProofTripwire(bobPage, `/boards/${boardId}`);
  await joinBoardAndConfirmPresence(alicePage, bobPage, boardId);
  const baseline = { ...tripwire.counts };
  await expect(listColumnById(bobPage, todo)).toBeVisible();

  await renameList(alicePage, todo, "To Do", "In Progress");

  await expect(bobPage.getByText("In Progress", { exact: true })).toBeVisible();
  await expect(bobPage.getByText("To Do", { exact: true })).toHaveCount(0);
  tripwire.check(baseline, "list:updated proof window");
});

test("list:deleted — a list archived by one user disappears live for another (no reload)", async ({
  browser,
}) => {
  const tag = `${Date.now()}-list-deleted`;
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag, [
    "To Go",
    "Keep",
  ]);

  const lists = await getListIdsByTitle(boardId);
  const tripwire = armProofTripwire(bobPage, `/boards/${boardId}`);
  await joinBoardAndConfirmPresence(alicePage, bobPage, boardId);
  const baseline = { ...tripwire.counts };
  await expect(listColumnById(bobPage, lists["To Go"])).toBeVisible();

  // Alice archives via the real archive-list UI (soft archive, never purge).
  await archiveList(alicePage, lists["To Go"]);

  await expect(listColumnById(bobPage, lists["To Go"])).toHaveCount(0);
  await expect(listColumnById(bobPage, lists["Keep"])).toBeVisible();
  tripwire.check(baseline, "list:deleted proof window");
});

test("notification:new — a mention by Alice increments Bob's bell badge with no reload", async ({
  browser,
}) => {
  const tag = `${Date.now()}-notification-new`;
  // Bob is a workspace member ONLY (viewer) — not card member, not creator —
  // so the mention is the single notification that can reach him.
  const { alicePage, bobPage, boardId } = await setUpTwoUserBoard(browser, tag, ["To Do"], "viewer");

  const todo = (await getListIdsByTitle(boardId))["To Do"];
  await addCardToList(alicePage, todo, "Notify target");

  const tripwire = armProofTripwire(bobPage, `/boards/${boardId}`);
  await joinBoardAndConfirmPresence(alicePage, bobPage, boardId);
  const baseline = { ...tripwire.counts };

  await expect(
    bobPage.getByRole("button", { name: "Notifications", exact: true }),
  ).toBeVisible();

  // Act: Alice posts a comment mentioning Bob through the real comment UI.
  await openCardDetail(alicePage, "Notify target");
  await postComment(alicePage, `@Bob please review this card`, {
    dismissMentionListbox: true,
  });

  // Assert: Bob's bell badge increments to exactly one unread while he stays
  // on the board page — no reload and no socket reconnect/resync (the
  // tripwire excludes the unread-count reconnect fallback, not just reload).
  await expect(
    bobPage.getByRole("button", { name: "Notifications (1 unread)" }),
  ).toBeVisible();
  tripwire.check(baseline, "notification:new proof window");
  expect(bobPage.url()).toContain(`/boards/${boardId}`);
});

test("analytics:refresh — a card created by Alice refreshes Bob's dashboard metric live", async ({
  browser,
}) => {
  const tag = `${Date.now()}-analytics-refresh`;
  const { alicePage, bobPage, workspaceId, boardId } = await setUpTwoUserBoard(browser, tag, ["To Do"]);

  const slug = await getWorkspaceSlug(workspaceId);
  const dashboardPath = `/workspace/${slug}/dashboard`;

  // Route-POST tripwire IS armed for the dashboard: router.refresh() is an RSC
  // GET (observed on the wire), so the debounce delivery never POSTs — any
  // POST inside the proof window is a masking-capable resync. This is also the
  // only counter that sees a polling-transport reconnect (no websocket events,
  // but the onConnect unread resync still POSTs to the current route).
  const tripwire = armProofTripwire(bobPage, dashboardPath);
  await joinBoardAndConfirmPresence(alicePage, bobPage, boardId);

  // Bob opens the dashboard while the workspace has NO cards, so the FlowChart
  // starts empty (no summary metric at all) — the metric below can only appear
  // via a live re-render, never from initial SSR.
  const resyncSettled = bobPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/dashboard"),
    { timeout: 20_000 },
  );
  await bobPage.goto(dashboardPath);
  // Masking barrier: the header's connect-time unread resync
  // (getInboxBadgeCountsAction, US-062 mn8 extended by US-083 W2) re-renders
  // the CURRENT route server-side and returns a fresh RSC payload (the full
  // dashboard, incl. getWorkspaceAnalyticsAction). If it landed after Alice's
  // card create it would mask a removed analytics:refresh emit — wait for it
  // to complete BEFORE Alice acts; afterwards the only page re-render source
  // is the workspace-room signal → 700ms debounce → router.refresh() (an RSC
  // GET — never a route POST, so it cannot trip the armed counter).
  await resyncSettled;
  await expect(
    bobPage.getByText("No cards were created or completed in the selected period."),
  ).toBeVisible();
  const baseline = { ...tripwire.counts };

  // Act: Alice creates the first card on the board (emits analytics:refresh).
  const todo = (await getListIdsByTitle(boardId))["To Do"];
  await addCardToList(alicePage, todo, "Analytics trigger");

  // Assert: the Created metric appears on Bob's already-loaded dashboard —
  // no reload, no navigation; the empty state stays if the emit is removed.
  await expect(flowChartCreatedTotal(bobPage)).toHaveText("1");
  tripwire.check(baseline, "analytics:refresh proof window");
});
