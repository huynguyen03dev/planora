import { expect, test } from "@playwright/test";

import { createWorkspace, inviteMember, signUp } from "./helpers/app";
import {
  cleanup,
  disconnect,
  getUserIdByEmail,
  getWorkspaceMemberRole,
  getWorkspaceSlug,
  isWorkspaceMember,
} from "./helpers/db";

const PASSWORD = "e2e-password-123";
const created: Array<{ workspaceId?: string; emails: string[] }> = [];

test.afterAll(async () => {
  for (const target of created) await cleanup(target);
  await disconnect();
});

test("member lifecycle — invite, accept, role change, and self-leave", async ({ browser }) => {
  test.slow();
  const tag = Date.now() + "-member-lifecycle";
  const owner = { name: "Owner", email: "owner-" + tag + "@e2e.test", password: PASSWORD };
  const bob = { name: "Bob", email: "bob-" + tag + "@e2e.test", password: PASSWORD };

  const ownerPage = await (await browser.newContext()).newPage();
  const bobPage = await (await browser.newContext()).newPage();

  await signUp(ownerPage, owner);
  const workspaceId = await createWorkspace(ownerPage, "Members " + tag);
  const slug = await getWorkspaceSlug(workspaceId);
  await signUp(bobPage, bob);
  const bobId = await getUserIdByEmail(bob.email);
  created.push({ workspaceId, emails: [owner.email, bob.email] });

  await inviteMember(ownerPage, slug, bob.email);

  await bobPage.goto("/boards");
  await bobPage.getByRole("button", { name: /^Notifications/ }).click();
  await expect(bobPage.getByText(new RegExp("Invitation to Members " + tag))).toBeVisible();
  await bobPage.getByRole("button", { name: /^Accept$/ }).click();
  await expect.poll(() => isWorkspaceMember(workspaceId, bobId)).toBe(true);

  await ownerPage.goto("/workspace/" + slug + "/members");
  const role = ownerPage.getByRole("combobox", { name: "Role for Bob" });
  await role.click();
  await ownerPage.getByRole("option", { name: "Viewer" }).click();
  await expect.poll(() => getWorkspaceMemberRole(workspaceId, bobId)).toBe("viewer");

  await bobPage.goto("/workspace/" + slug + "/members");
  await bobPage.getByRole("button", { name: "Actions for Bob" }).click();
  await bobPage.getByRole("menuitem", { name: "Leave workspace" }).click();
  const dialog = bobPage.getByRole("alertdialog", { name: "Leave this workspace?" });
  await dialog.getByRole("button", { name: "Leave" }).click();
  await expect.poll(() => isWorkspaceMember(workspaceId, bobId)).toBe(false);
});
