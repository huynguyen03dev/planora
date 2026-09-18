import { v2 as cloudinary } from "cloudinary";

import db from "@/lib/prisma";

function publicIdFromUrl(url: string | null): string | null {
  if (!url || !url.includes("/upload/")) return null;
  const tail = url.split("/upload/")[1]?.replace(/^v\d+\//, "");
  if (!tail) return null;
  return tail.replace(/\.[^/.]+$/, "");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const config = {
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw new Error("Missing Cloudinary configuration");
  }
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
  });

  const [attachments, coverCards] = await Promise.all([
    db.attachment.findMany({
      where: { cloudinaryPublicId: { not: null } },
      select: { cloudinaryPublicId: true },
    }),
    db.card.findMany({
      where: { coverImage: { not: null } },
      select: { coverImage: true },
    }),
  ]);

  const referenced = new Set<string>();
  for (const attachment of attachments) {
    if (attachment.cloudinaryPublicId) referenced.add(attachment.cloudinaryPublicId);
  }
  for (const card of coverCards) {
    const id = publicIdFromUrl(card.coverImage);
    if (id) referenced.add(id);
  }

  const resources: Array<{ public_id: string; resource_type: string }> = [];
  for (const resourceType of ["image", "raw", "video"] as const) {
    let nextCursor: string | undefined;
    do {
      const result = await cloudinary.api.resources({
        type: "upload",
        prefix: "planora/",
        resource_type: resourceType,
        max_results: 500,
        next_cursor: nextCursor,
      });
      resources.push(...result.resources);
      nextCursor = result.next_cursor;
    } while (nextCursor);
  }

  const orphans = resources.filter((resource) => !referenced.has(resource.public_id));
  console.log(
    "Cloudinary resources: " +
      resources.length +
      "; referenced: " +
      referenced.size +
      "; orphan candidates: " +
      orphans.length,
  );

  for (const orphan of orphans) {
    console.log(
      (apply ? "DELETE " : "DRY-RUN ") + orphan.resource_type + " " + orphan.public_id,
    );
    if (apply) {
      await cloudinary.uploader.destroy(orphan.public_id, {
        resource_type: orphan.resource_type,
        invalidate: true,
      });
    }
  }

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
