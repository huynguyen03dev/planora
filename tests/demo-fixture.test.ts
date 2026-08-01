import { describe, expect, it, vi } from "vitest";

import {
  DEMO_FIXTURE_NAMESPACE,
  DEMO_FIXTURE_SLUG,
  assertVerifiedDemoUsers,
  buildDemoFixturePlan,
  createDemoFixtureMarker,
  parseDemoFixtureMarker,
  resetDemoFixture,
  seedDemoFixture,
  type DemoFixtureDb,
  type DemoFixtureUser,
} from "@/lib/demo-fixture";

const owner: DemoFixtureUser = {
  id: "owner-id",
  email: "owner@example.com",
  emailVerified: true,
  name: "Owner",
};

const collaborator: DemoFixtureUser = {
  id: "collaborator-id",
  email: "collaborator@example.com",
  emailVerified: true,
  name: "Collaborator",
};

function makeDb(options?: {
  users?: DemoFixtureUser[];
  workspace?: {
    id: string;
    slug: string;
    metadata: string | null;
  } | null;
}): DemoFixtureDb {
  const state = {
    workspace: options?.workspace ?? null,
  };

  const tx = {
    user: {
      findMany: vi.fn(async () => options?.users ?? [owner, collaborator]),
    },
    workspace: {
      findUnique: vi.fn(async () => state.workspace),
      delete: vi.fn(async () => {
        state.workspace = null;
        return {};
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.workspace = {
          id: String(data.id),
          slug: String(data.slug),
          metadata: String(data.metadata),
        };
        return state.workspace;
      }),
    },
  } satisfies Omit<DemoFixtureDb, "$transaction">;

  return {
    ...tx,
    $transaction: vi.fn(async (callback) => callback(tx)),
  };
}

describe("demo fixture safety", () => {
  it("rejects missing, unverified, and duplicate demo users", () => {
    expect(() =>
      assertVerifiedDemoUsers([owner], owner.email, collaborator.email),
    ).toThrow("Both demo users must already exist");

    expect(() =>
      assertVerifiedDemoUsers(
        [{ ...owner, emailVerified: false }, collaborator],
        owner.email,
        collaborator.email,
      ),
    ).toThrow("must complete email verification");

    expect(() =>
      assertVerifiedDemoUsers([owner], owner.email, owner.email),
    ).toThrow("must be different accounts");
  });

  it("round-trips only the exact ownership marker", () => {
    const marker = createDemoFixtureMarker(owner.id, collaborator.id);

    expect(parseDemoFixtureMarker(marker)).toEqual({
      namespace: DEMO_FIXTURE_NAMESPACE,
      version: 1,
      ownerUserId: owner.id,
      collaboratorUserId: collaborator.id,
    });
    expect(parseDemoFixtureMarker(null)).toBeNull();
    expect(parseDemoFixtureMarker("{}")).toBeNull();
    expect(parseDemoFixtureMarker("not-json")).toBeNull();
  });

  it("builds a repeatable logical fixture and exposes current-run ids", () => {
    const now = new Date("2026-08-02T00:00:00.000Z");
    const first = buildDemoFixturePlan(owner, collaborator, now);
    const second = buildDemoFixturePlan(owner, collaborator, now);

    expect(first.manifest.logicalShape).toEqual(second.manifest.logicalShape);
    expect(first.manifest.workspace.slug).toBe(DEMO_FIXTURE_SLUG);
    expect(first.manifest.users).toEqual([
      { id: owner.id, email: owner.email, role: "admin" },
      { id: collaborator.id, email: collaborator.email, role: "editor" },
    ]);
    expect(first.manifest.workspace.id).not.toBe(second.manifest.workspace.id);
    expect(first.manifest.boards).toHaveLength(2);
    expect(first.manifest.logicalShape.cards).toBeGreaterThan(0);
  });

  it("refuses to replace a workspace without the exact tool marker", async () => {
    const db = makeDb({
      workspace: {
        id: "foreign-workspace",
        slug: DEMO_FIXTURE_SLUG,
        metadata: null,
      },
    });

    await expect(
      seedDemoFixture(db, {
        ownerEmail: owner.email,
        collaboratorEmail: collaborator.email,
        now: new Date("2026-08-02T00:00:00.000Z"),
      }),
    ).rejects.toThrow("Refusing to replace workspace");
    expect(db.workspace.delete).not.toHaveBeenCalled();
  });

  it("does not inspect or delete the reserved workspace until both users are verified", async () => {
    const db = makeDb({
      users: [{ ...owner, emailVerified: false }, collaborator],
      workspace: {
        id: "existing-demo",
        slug: DEMO_FIXTURE_SLUG,
        metadata: createDemoFixtureMarker(owner.id, collaborator.id),
      },
    });

    await expect(
      seedDemoFixture(db, {
        ownerEmail: owner.email,
        collaboratorEmail: collaborator.email,
      }),
    ).rejects.toThrow("must complete email verification");
    expect(db.workspace.findUnique).not.toHaveBeenCalled();
    expect(db.workspace.delete).not.toHaveBeenCalled();
  });

  it("refuses reset when marker ownership does not match verified users", async () => {
    const db = makeDb({
      workspace: {
        id: "demo-workspace",
        slug: DEMO_FIXTURE_SLUG,
        metadata: createDemoFixtureMarker("different-owner", collaborator.id),
      },
    });

    await expect(
      resetDemoFixture(db, owner.email, collaborator.email),
    ).rejects.toThrow("Refusing to reset workspace");
    expect(db.workspace.delete).not.toHaveBeenCalled();
  });

  it("supports a safe seed, reset, seed cycle", async () => {
    const db = makeDb();
    const input = {
      ownerEmail: owner.email,
      collaboratorEmail: collaborator.email,
      now: new Date("2026-08-02T00:00:00.000Z"),
    };

    const first = await seedDemoFixture(db, input);
    expect(first.manifest.workspace.slug).toBe(DEMO_FIXTURE_SLUG);

    await expect(
      resetDemoFixture(db, owner.email, collaborator.email),
    ).resolves.toEqual({ status: "deleted", workspaceId: first.manifest.workspace.id });

    const second = await seedDemoFixture(db, input);
    expect(second.manifest.logicalShape).toEqual(first.manifest.logicalShape);
    expect(second.manifest.workspace.id).not.toBe(first.manifest.workspace.id);
  });

  it("treats reset of an absent reserved workspace as a safe no-op", async () => {
    const db = makeDb();

    await expect(
      resetDemoFixture(db, owner.email, collaborator.email),
    ).resolves.toEqual({ status: "not-found", workspaceId: null });
    expect(db.workspace.delete).not.toHaveBeenCalled();
  });
});
