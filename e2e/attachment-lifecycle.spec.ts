import { expect, test } from "@playwright/test";
import { v2 as cloudinary } from "cloudinary";

import { addCard, addList, createBoard, createWorkspace, signUp } from "./helpers/app";
import { cleanup, disconnect, getAttachmentPublicIds, getCardIdByTitle } from "./helpers/db";

const PASSWORD = "e2e-password-123";
const created: Array<{ workspaceId?: string; emails: string[] }> = [];
const uploaded: string[] = [];

test.afterAll(async () => {
  if (uploaded.length && process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
      cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    for (const publicId of uploaded) {
      await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
    }
  }
  for (const target of created) await cleanup(target);
  await disconnect();
});

test("attachment upload persists and renders in the card detail editor", async ({ page }) => {
  test.slow();
  test.skip(
    !process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET,
    "Cloudinary credentials are required for the live attachment E2E",
  );

  const tag = Date.now() + "-attachment";
  const user = { name: "Attachment User", email: "attach-" + tag + "@e2e.test", password: PASSWORD };
  await signUp(page, user);
  const workspaceId = await createWorkspace(page, "Attachment " + tag);
  created.push({ workspaceId, emails: [user.email] });
  const boardId = await createBoard(page, "Attachment board");
  await addList(page, "To do");
  await addCard(page, "Attachment card");
  let cardId = "";
  await expect
    .poll(async () => {
      try {
        cardId = await getCardIdByTitle(boardId, "Attachment card");
        return cardId;
      } catch {
        return "";
      }
    })
    .not.toBe("");

  await page.getByText("Attachment card", { exact: true }).click();
  await page.getByRole("button", { name: "Add to card" }).click();
  await page.getByRole("menuitem", { name: "Attachment" }).click();

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2uqsAAAAASUVORK5CYII=",
    "base64",
  );
  await page.getByLabel("Attachment file").setInputFiles({
    name: "proof.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: "Upload attachment" }).click();

  await expect(page.getByRole("heading", { name: "Attachments" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "proof.png" }).first()).toBeVisible({ timeout: 30_000 });
  const ids = await getAttachmentPublicIds(cardId);
  expect(ids).toHaveLength(1);
  uploaded.push(...ids);
});
