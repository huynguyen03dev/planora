/**
 * US-071 / decision 0033 — invitation callback continuity through the real
 * signup + Mailpit verification flow. The invitation is created through the
 * product UI; only its id is resolved from Postgres as test arrangement.
 */
import { expect, test } from "@playwright/test";

import { createWorkspace, inviteMember, signUp } from "./helpers/app";
import {
  cleanup,
  disconnect,
  getPendingInvitationIdByEmail,
  getWorkspaceSlug,
} from "./helpers/db";
import { fetchVerificationLink } from "./helpers/mail";

const PASSWORD = "e2e-password-123";
const created: Array<{ workspaceId?: string; emails: string[] }> = [];

test.afterAll(async () => {
  for (const target of created) {
    await cleanup(target);
  }
  await disconnect();
});

test("invitation signup returns to the invitation after email verification", async ({
  browser,
}) => {
  test.slow();

  const tag = `${Date.now()}-invite-auth`;
  const owner = {
    name: "Invite Owner",
    email: `owner-${tag}@e2e.test`,
    password: PASSWORD,
  };
  const invitee = {
    name: "Invitee",
    email: `invitee-${tag}@e2e.test`,
    password: PASSWORD,
  };

  const ownerPage = await (await browser.newContext()).newPage();
  const inviteePage = await (await browser.newContext()).newPage();

  await signUp(ownerPage, owner);
  const workspaceId = await createWorkspace(ownerPage, `Auth callback ${tag}`);
  const slug = await getWorkspaceSlug(workspaceId);
  created.push({ workspaceId, emails: [owner.email, invitee.email] });

  await inviteMember(ownerPage, slug, invitee.email);
  const invitationId = await getPendingInvitationIdByEmail(invitee.email);

  await inviteePage.goto(`/invite?invitationId=${encodeURIComponent(invitationId)}`);
  await inviteePage.getByRole("link", { name: "Create account" }).click();
  await expect(
    inviteePage.locator("form[data-auth-hydrated='true']"),
  ).toBeVisible();
  await expect(inviteePage.locator("#email")).toHaveValue(invitee.email);

  await inviteePage.locator("#name").fill(invitee.name);
  await inviteePage.locator("#password").fill(invitee.password);
  await inviteePage.locator("#confirm-password").fill(invitee.password);
  await inviteePage.getByRole("button", { name: "Sign Up" }).click();

  await inviteePage.waitForURL(/\/verify-email\?/);
  const verificationLink = await fetchVerificationLink(invitee.email);
  const { pathname, search } = new URL(verificationLink);
  await inviteePage.goto(`${pathname}${search}`);

  await inviteePage.waitForURL(
    (url) =>
      url.pathname === "/invite" &&
      url.searchParams.get("invitationId") === invitationId,
    { timeout: 30_000 },
  );
  await expect(
    inviteePage.getByRole("heading", { name: `Join Auth callback ${tag}` }),
  ).toBeVisible();
});
