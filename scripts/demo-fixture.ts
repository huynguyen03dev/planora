#!/usr/bin/env tsx

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  resetDemoFixture,
  seedDemoFixture,
  type DemoFixtureDb,
  type DemoFixtureManifest,
} from "@/lib/demo-fixture";
import db from "@/lib/prisma";

const MANIFEST_PATH = path.resolve(".demo/fixture-manifest.json");

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];

  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);

  throw new Error(`Missing required --${name}`);
}

async function writeManifest(manifest: DemoFixtureManifest): Promise<void> {
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  const temporaryPath = `${MANIFEST_PATH}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporaryPath, MANIFEST_PATH);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== "seed" && command !== "reset") {
    throw new Error("Usage: demo-fixture.ts <seed|reset> --owner-email <email> --collaborator-email <email>");
  }

  const ownerEmail = argument("owner-email");
  const collaboratorEmail = argument("collaborator-email");
  const fixtureDb = db as unknown as DemoFixtureDb;

  if (command === "seed") {
    const result = await seedDemoFixture(fixtureDb, {
      ownerEmail,
      collaboratorEmail,
    });
    await writeManifest(result.manifest);
    console.log(
      [
        `Seeded reserved demo workspace: ${result.manifest.workspace.slug}`,
        `Workspace id: ${result.manifest.workspace.id}`,
        `Logical shape: ${result.manifest.logicalShape.boards} boards, ${result.manifest.logicalShape.lists} lists, ${result.manifest.logicalShape.cards} cards`,
        `Manifest: ${MANIFEST_PATH}`,
      ].join("\n"),
    );
    return;
  }

  const result = await resetDemoFixture(
    fixtureDb,
    ownerEmail,
    collaboratorEmail,
  );
  await rm(MANIFEST_PATH, { force: true });
  console.log(
    result.status === "deleted"
      ? `Deleted reserved demo workspace ${result.workspaceId}.`
      : "Reserved demo workspace was already absent.",
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (error: unknown) => {
    console.error(
      "Demo fixture failed:",
      error instanceof Error ? error.message : error,
    );
    await db.$disconnect();
    process.exit(1);
  });
