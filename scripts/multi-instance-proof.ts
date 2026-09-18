import { chromium, expect } from "@playwright/test";

import { addCard, addList, createBoard, createWorkspace, signUp, watcherAvatars } from "../e2e/helpers/app";
import { cleanup, disconnect } from "../e2e/helpers/db";

const A = process.env.INSTANCE_A ?? "http://localhost:3101";
const B = process.env.INSTANCE_B ?? "http://localhost:3102";

async function main() {
  const browser = await chromium.launch();
  const contextA = await browser.newContext({ baseURL: A });
  const pageA = await contextA.newPage();
  const stamp = Date.now();
  const user = {
    name: "Scale Proof",
    email: "scale-" + stamp + "@e2e.test",
    password: "e2e-password-123",
  };
  let workspaceId: string | undefined;

  try {
    await signUp(pageA, user);
    workspaceId = await createWorkspace(pageA, "Scale proof " + stamp);
    const boardId = await createBoard(pageA, "Cross instance board");
    await addList(pageA, "Inbox");

    const cookies = await contextA.cookies();
    const contextB = await browser.newContext({ baseURL: B });
    await contextB.addCookies(cookies);
    const pageB = await contextB.newPage();
    await pageB.goto("/boards/" + boardId);
    await expect(watcherAvatars(pageB)).toHaveCount(1, { timeout: 20_000 });

    await addCard(pageA, "Cross-instance realtime card");
    await expect(pageB.getByText("Cross-instance realtime card", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    console.log("PASS cross-instance Socket.IO event propagated through Redis without reload");
    await contextB.close();
  } finally {
    await cleanup({ workspaceId, emails: [user.email] });
    await disconnect();
    await contextA.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
