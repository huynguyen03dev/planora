/**
 * US-083 W2 — live workspace-invitation arrival: badge, inbox, accept, denial.
 *
 * Proves the user-room `invitation:new` contract end to end with three REAL
 * browser users against the real server.ts + Socket.io + Postgres:
 *
 * - Alice (workspace admin) invites an already-registered Bob through the real
 *   members-page dialog → Bob's header bell badge increments LIVE — the
 *   assertion path contains no reload, no navigation, no socket reconnect,
 *   and no inbox fetch (the dropdown is NOT opened before the live badge
 *   assertion — its open-time `/api/invitations/pending` fetch would write the
 *   count from DB and mask a removed emit).
 * - Bob's invitation inbox (bell dropdown) shows the invitation, sourced live
 *   from the invitation table.
 * - Accepting it clears the badge and makes Bob a real workspace member
 *   (asserted in Postgres — source of truth).
 * - Carol, a registered outsider who is connected and watching throughout,
 *   receives NO badge change — the signal cannot leak outside the invitee's
 *   own user room.
 *
 * Bob signs up with a MIXED-CASE email (`BoB-…@E2e.Test`): the proof records
 * the verified Better Auth casing/storage behavior — BA lowercases user
 * emails at sign-up (sign-up.mjs normalizes) and invitation emails on create,
 * so the whole flow (invitee resolution, inbox listing, acceptance) must work
 * from mixed-case input at the invite boundary, and the invitee resolution
 * must not depend on exact-case matches.
 *
 * Masking guards (mirroring the W1 tripwire — see realtime-event-proof.spec.ts):
 * 1. armProofTripwire on BOTH observer pages, armed before the page loads,
 *    baselined after the connect-time badge resync settles, checked after the
 *    observer assertions — any full reload, socket.io disconnect/reconnect, or
 *    route re-render POST inside a proof window fails the test, so a removed
 *    emit can never turn green from an onConnect fallback reading DB state.
 * 2. Ordering: the live badge assertion happens BEFORE the dropdown is ever
 *    opened (the dropdown's open-time inbox fetch would otherwise mask a
 *    missing emit by setting the count from the DB).
 * 3. The connect-time resync (getInboxBadgeCountsAction — one Server Action
 *    carrying BOTH badge halves, so exactly one route POST) is awaited as the
 *    settle barrier before Alice acts.
 *
 * Sabotage: with the `invitation:new` emit disabled in
 * `app/(authenticated)/(dashboard)/workspace/actions.ts`, the Bob live-badge
 * assertion goes RED (the tripwire stays clean) — recorded in the US-083
 * execplan.
 */
import { test, expect, type Page } from "@playwright/test";

import { inviteMember, signUp, createWorkspace } from "./helpers/app";
import {
  cleanup,
  disconnect,
  getStoredEmail,
  getUserIdByEmail,
  getWorkspaceSlug,
  isWorkspaceMember,
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

type TripwireCounts = {
  reloads: number;
  wsOpens: number;
  wsCloses: number;
  routePosts: number;
};

/**
 * Masking tripwire — identical contract to the W1 helper
 * (e2e/realtime-event-proof.spec.ts): counts the lifecycle events that can
 * re-render an observer page from persisted DB state and turn a sabotage run
 * green without the emitter (full reload, socket.io websocket open/close — the
 * onConnect fallback chain — and POSTs to the current route). Armed before the
 * page loads, baselined after the connect/resync barrier, checked after the
 * observer assertions. Any delta fails the test.
 */
function armProofTripwire(page: Page, routePathname: string) {
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
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === routePathname) {
      counts.routePosts += 1;
    }
  });

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
      expect(
        counts.routePosts,
        `${windowLabel}: route re-render POST during the proof window`,
      ).toBe(baseline.routePosts);
    },
  };
}

/** The header bell button — the badge observable (aria-label carries the count). */
function bell(page: Page) {
  return page.getByRole("button", { name: /^Notifications/ });
}

/**
 * Observer settle barrier: load the page with the tripwire already armed and
 * await the connect-time badge resync — the one Server Action
 * (`getInboxBadgeCountsAction`) that POSTs to the current route on socket
 * connect. Awaiting it closes the race where a fresh RSC payload (with the
 * SSR badge counts) lands after an observer assertion and masks a removed
 * emit. After this, the page DOM only changes via socket events or a tripwired
 * reload/reconnect.
 */
async function settleObserver(page: Page, routePathname: string): Promise<void> {
  const resyncSettled = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === routePathname,
    { timeout: 20_000 },
  );
  await page.goto(routePathname);
  await resyncSettled;
}

test("invitation:new — a live invitation badge increments for Bob, shows in the inbox, clears on accept, and never reaches Carol", async ({
  browser,
}) => {
  const tag = `${Date.now()}-invite-live`;
  // Bob signs up with a MIXED-CASE email on purpose (see header comment).
  const alice = { name: "Alice", email: `alice-${tag}@e2e.test`, password: PASSWORD };
  const bob = { name: "Bob", email: `BoB-${tag}@E2e.Test`, password: PASSWORD };
  const carol = { name: "Carol", email: `carol-${tag}@e2e.test`, password: PASSWORD };

  const alicePage = await (await browser.newContext()).newPage();
  const bobPage = await (await browser.newContext()).newPage();
  const carolPage = await (await browser.newContext()).newPage();

  // Arrange: Alice owns a workspace; Bob and Carol are registered users with
  // NO membership — Bob's invitation is the only signal that can reach him.
  await signUp(alicePage, alice);
  const workspaceId = await createWorkspace(alicePage, `WS ${tag}`);
  const slug = await getWorkspaceSlug(workspaceId);

  await signUp(bobPage, bob);
  const bobId = await getUserIdByEmail(bob.email.toLowerCase());
  await signUp(carolPage, carol);
  const carolId = await getUserIdByEmail(carol.email);

  // Record Better Auth's actual email-casing/storage behavior (verified at
  // sign-up.mjs:165 — user emails are lowercased at sign-up; invitation
  // emails are lowercased on create): the stored value is the lowercase form.
  await expect.poll(() => getStoredEmail(bobId)).toBe(bob.email.toLowerCase());

  created.push({ workspaceId, emails: [alice.email, bob.email.toLowerCase(), carol.email] });

  // Observers settle (tripwires armed BEFORE the load, baselined after the
  // connect-time badge resync) — Alice must not act before this.
  const bobTripwire = armProofTripwire(bobPage, "/boards");
  await settleObserver(bobPage, "/boards");
  const bobBaseline = { ...bobTripwire.counts };

  const carolTripwire = armProofTripwire(carolPage, "/boards");
  await settleObserver(carolPage, "/boards");
  const carolBaseline = { ...carolTripwire.counts };

  // Pre-state: both observers see a clean bell — no pending invitations, no
  // unread notifications. Alice's page is not under proof.
  await expect(bell(bobPage)).toHaveAccessibleName("Notifications");
  await expect(bell(carolPage)).toHaveAccessibleName("Notifications");
  // The inbox has not been opened on either observer — a live badge increment
  // cannot be explained by the dropdown's open-time inbox fetch.
  await expect(bobPage.getByText(/invitation to/i)).toHaveCount(0);

  // Act: Alice invites the registered Bob through the real members dialog.
  await inviteMember(alicePage, slug, bob.email);

  // Assert live: Bob's badge increments with no reload, no navigation, no
  // socket reconnect, and no inbox fetch (dropdown still closed).
  await expect(bell(bobPage)).toHaveAccessibleName("Notifications (1 unread)");
  bobTripwire.check(bobBaseline, "invitation:new live-badge window");
  expect(bobPage.url()).toContain("/boards");
  await expect(bobPage.getByText(/invitation to/i)).toHaveCount(0);

  // Assert inbox: the invitation is displayed in Bob's bell dropdown,
  // sourced live from the invitation table.
  await bell(bobPage).click();
  await expect(
    bobPage.getByText(`Invitation to WS ${tag}`, { exact: false }),
  ).toBeVisible();
  await expect(
    bobPage.getByText(/Alice invited you as editor/i),
  ).toBeVisible();

  // Assert denial: Carol — connected and watching throughout — sees no
  // badge change. The signal stayed inside Bob's user room.
  await expect(bell(carolPage)).toHaveAccessibleName("Notifications");
  carolTripwire.check(carolBaseline, "Carol denial window");

  // Act: Bob accepts the invitation from the inbox.
  await bobPage.getByRole("button", { name: /^accept$/i }).click();
  await bobPage.waitForURL(/\/boards\?workspace=/, { timeout: 20_000 });

  // Assert: the badge is cleared (the invitation is consumed) and Bob is a
  // real workspace member — asserted in Postgres, the source of truth.
  await expect(bell(bobPage)).toHaveAccessibleName("Notifications");
  await expect
    .poll(() => isWorkspaceMember(workspaceId, bobId))
    .toBe(true);
  await expect
    .poll(() => isWorkspaceMember(workspaceId, carolId))
    .toBe(false);
});
