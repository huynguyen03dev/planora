import { randomUUID } from "node:crypto";

import type { Prisma } from "@/app/generated/prisma/client";

export const DEMO_FIXTURE_NAMESPACE = "planora-us083-demo-v1";
export const DEMO_FIXTURE_SLUG = "planora-us083-demo";

const GAP = 16_384;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type DemoFixtureUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

type DemoWorkspaceRecord = {
  id: string;
  slug: string;
  metadata: string | null;
};

export type DemoFixtureTransaction = {
  user: {
    findMany(args: Record<string, unknown>): Promise<DemoFixtureUser[]>;
  };
  workspace: {
    findUnique(args: Record<string, unknown>): Promise<DemoWorkspaceRecord | null>;
    delete(args: Record<string, unknown>): Promise<unknown>;
    create(args: { data: Record<string, unknown> }): Promise<DemoWorkspaceRecord>;
  };
};

export type DemoFixtureDb = DemoFixtureTransaction & {
  $transaction<T>(
    callback: (transaction: DemoFixtureTransaction) => Promise<T>,
  ): Promise<T>;
};

export type DemoFixtureMarker = {
  namespace: typeof DEMO_FIXTURE_NAMESPACE;
  version: 1;
  ownerUserId: string;
  collaboratorUserId: string;
};

type ManifestCard = {
  id: string;
  title: string;
};

type ManifestList = {
  id: string;
  title: string;
  cards: ManifestCard[];
};

type ManifestBoard = {
  id: string;
  title: string;
  lists: ManifestList[];
};

export type DemoFixtureManifest = {
  namespace: typeof DEMO_FIXTURE_NAMESPACE;
  version: 1;
  generatedAt: string;
  workspace: {
    id: string;
    slug: typeof DEMO_FIXTURE_SLUG;
    name: string;
  };
  users: Array<{
    id: string;
    email: string;
    role: "admin" | "editor";
  }>;
  boards: ManifestBoard[];
  logicalShape: {
    boards: number;
    lists: number;
    cards: number;
  };
};

type FixtureCard = ManifestCard & {
  description: string;
  dueDate: Date | null;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  completedAt: Date | null;
  assignedUserIds: string[];
};

type FixtureList = Omit<ManifestList, "cards"> & {
  cards: FixtureCard[];
};

type FixtureBoard = Omit<ManifestBoard, "lists"> & {
  backgroundColor: string;
  lists: FixtureList[];
  createdAt: Date;
};

export type DemoFixturePlan = {
  marker: string;
  manifest: DemoFixtureManifest;
  boards: FixtureBoard[];
};

export function createDemoFixtureMarker(
  ownerUserId: string,
  collaboratorUserId: string,
): string {
  return JSON.stringify({
    namespace: DEMO_FIXTURE_NAMESPACE,
    version: 1,
    ownerUserId,
    collaboratorUserId,
  } satisfies DemoFixtureMarker);
}

export function parseDemoFixtureMarker(
  metadata: string | null,
): DemoFixtureMarker | null {
  if (!metadata) return null;

  try {
    const candidate = JSON.parse(metadata) as Partial<DemoFixtureMarker>;
    if (
      candidate.namespace !== DEMO_FIXTURE_NAMESPACE ||
      candidate.version !== 1 ||
      typeof candidate.ownerUserId !== "string" ||
      typeof candidate.collaboratorUserId !== "string"
    ) {
      return null;
    }

    return candidate as DemoFixtureMarker;
  } catch {
    return null;
  }
}

export function assertVerifiedDemoUsers(
  users: DemoFixtureUser[],
  ownerEmail: string,
  collaboratorEmail: string,
): { owner: DemoFixtureUser; collaborator: DemoFixtureUser } {
  const normalizedOwnerEmail = ownerEmail.trim().toLowerCase();
  const normalizedCollaboratorEmail = collaboratorEmail.trim().toLowerCase();

  if (normalizedOwnerEmail === normalizedCollaboratorEmail) {
    throw new Error("Demo owner and collaborator must be different accounts.");
  }

  const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const owner = byEmail.get(normalizedOwnerEmail);
  const collaborator = byEmail.get(normalizedCollaboratorEmail);

  if (!owner || !collaborator) {
    throw new Error(
      "Both demo users must already exist. Sign up and verify them through the real email flow first.",
    );
  }

  if (!owner.emailVerified || !collaborator.emailVerified) {
    throw new Error(
      "Both demo users must complete email verification before this fixture can use them.",
    );
  }

  return { owner, collaborator };
}

function dateFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

function card(
  title: string,
  input: Omit<FixtureCard, "id" | "title">,
): FixtureCard {
  return { id: randomUUID(), title, ...input };
}

function list(title: string, cards: FixtureCard[]): FixtureList {
  return { id: randomUUID(), title, cards };
}

export function buildDemoFixturePlan(
  owner: DemoFixtureUser,
  collaborator: DemoFixtureUser,
  now: Date,
): DemoFixturePlan {
  const boardPlans = [
    {
      id: randomUUID(),
      title: "Product Roadmap",
      backgroundColor: "#0ea5e9",
      lists: [
        list("Inbox", [
          card("Review graduation demo script", {
            description: "Tighten the end-to-end story and rehearse the two-client flow.",
            dueDate: dateFrom(now, 0),
            priority: "URGENT",
            completedAt: null,
            assignedUserIds: [owner.id],
          }),
          card("Triage customer feedback", {
            description: "Group feedback into actionable product themes.",
            dueDate: dateFrom(now, 3),
            priority: "HIGH",
            completedAt: null,
            assignedUserIds: [collaborator.id],
          }),
        ]),
        list("In Progress", [
          card("Prove realtime card updates", {
            description: "Run the observer-client proof without reload or reconnect.",
            dueDate: dateFrom(now, 1),
            priority: "HIGH",
            completedAt: null,
            assignedUserIds: [owner.id, collaborator.id],
          }),
          card("Fix overdue contrast", {
            description: "Bring the overdue badge back to WCAG AA contrast.",
            dueDate: dateFrom(now, -2),
            priority: "MEDIUM",
            completedAt: null,
            assignedUserIds: [collaborator.id],
          }),
        ]),
        list("Done", [
          card("Document safety invariants", {
            description: "Record the isolation, rollback, and audit guarantees.",
            dueDate: dateFrom(now, -3),
            priority: "LOW",
            completedAt: dateFrom(now, -1),
            assignedUserIds: [owner.id],
          }),
        ]),
      ],
    },
    {
      id: randomUUID(),
      title: "Team Operations",
      backgroundColor: "#a855f7",
      lists: [
        list("Upcoming", [
          card("Prepare weekly planning", {
            description: "Collect priorities before the planning session.",
            dueDate: dateFrom(now, 7),
            priority: "MEDIUM",
            completedAt: null,
            assignedUserIds: [owner.id, collaborator.id],
          }),
        ]),
        list("Completed", [
          card("Verify collaborator access", {
            description: "Confirm the editor can work without admin privileges.",
            dueDate: null,
            priority: null,
            completedAt: dateFrom(now, -1),
            assignedUserIds: [collaborator.id],
          }),
        ]),
      ],
    },
  ];

  // Board order must be deterministic: quick capture's default board is the
  // first creatable one, ordered by board createdAt then id. Nested creates
  // inside one transaction share the same now(), so without an explicit
  // createdAt the random-UUID id tiebreak would decide the order — the demo
  // path's capture target would flip between seeds. Pin 1ms-offset values.
  const boards = boardPlans.map((plan, index) => ({
    ...plan,
    createdAt: new Date(now.getTime() + index),
  }));

  const manifestBoards = boards.map((boardItem) => ({
    id: boardItem.id,
    title: boardItem.title,
    lists: boardItem.lists.map((listItem) => ({
      id: listItem.id,
      title: listItem.title,
      cards: listItem.cards.map((cardItem) => ({
        id: cardItem.id,
        title: cardItem.title,
      })),
    })),
  }));
  const lists = manifestBoards.flatMap((boardItem) => boardItem.lists);

  return {
    marker: createDemoFixtureMarker(owner.id, collaborator.id),
    boards,
    manifest: {
      namespace: DEMO_FIXTURE_NAMESPACE,
      version: 1,
      generatedAt: now.toISOString(),
      workspace: {
        // App workspaceId schemas (invitation/board/automation) require the
        // Better-Auth 32-char id format; a UUID here would make invites, board
        // creation, and rules fail with "Invalid workspace ID" in the demo
        // workspace (caught by the demo rehearsal — run log).
        id: randomUUID().replace(/-/g, ""),
        slug: DEMO_FIXTURE_SLUG,
        name: "Planora US-083 Demo",
      },
      users: [
        { id: owner.id, email: owner.email, role: "admin" },
        {
          id: collaborator.id,
          email: collaborator.email,
          role: "editor",
        },
      ],
      boards: manifestBoards,
      logicalShape: {
        boards: manifestBoards.length,
        lists: lists.length,
        cards: lists.reduce((count, listItem) => count + listItem.cards.length, 0),
      },
    },
  };
}

async function loadVerifiedUsers(
  transaction: DemoFixtureTransaction,
  ownerEmail: string,
  collaboratorEmail: string,
): Promise<{ owner: DemoFixtureUser; collaborator: DemoFixtureUser }> {
  const users = await transaction.user.findMany({
    where: {
      email: {
        in: [ownerEmail.trim().toLowerCase(), collaboratorEmail.trim().toLowerCase()],
      },
    },
    select: { id: true, email: true, emailVerified: true, name: true },
  });

  return assertVerifiedDemoUsers(users, ownerEmail, collaboratorEmail);
}

function assertWorkspaceOwnership(
  workspace: DemoWorkspaceRecord,
  owner: DemoFixtureUser,
  collaborator: DemoFixtureUser,
  operation: "replace" | "reset",
): void {
  const marker = parseDemoFixtureMarker(workspace.metadata);
  if (
    workspace.slug !== DEMO_FIXTURE_SLUG ||
    !marker ||
    marker.ownerUserId !== owner.id ||
    marker.collaboratorUserId !== collaborator.id
  ) {
    throw new Error(
      `Refusing to ${operation} workspace "${DEMO_FIXTURE_SLUG}": the fixture ownership marker is missing or does not match both verified users.`,
    );
  }
}

export async function seedDemoFixture(
  db: DemoFixtureDb,
  input: { ownerEmail: string; collaboratorEmail: string; now?: Date },
): Promise<{ manifest: DemoFixtureManifest }> {
  return db.$transaction(async (transaction) => {
    const { owner, collaborator } = await loadVerifiedUsers(
      transaction,
      input.ownerEmail,
      input.collaboratorEmail,
    );
    const existing = await transaction.workspace.findUnique({
      where: { slug: DEMO_FIXTURE_SLUG },
      select: { id: true, slug: true, metadata: true },
    });

    if (existing) {
      assertWorkspaceOwnership(existing, owner, collaborator, "replace");
      await transaction.workspace.delete({ where: { id: existing.id } });
    }

    const plan = buildDemoFixturePlan(owner, collaborator, input.now ?? new Date());
    const workspaceData = {
        id: plan.manifest.workspace.id,
        name: plan.manifest.workspace.name,
        slug: DEMO_FIXTURE_SLUG,
        metadata: plan.marker,
        createdAt: new Date(plan.manifest.generatedAt),
        workspacemembers: {
          create: plan.manifest.users.map((user) => ({
            id: randomUUID(),
            userId: user.id,
            role: user.role,
            createdAt: new Date(plan.manifest.generatedAt),
          })),
        },
        boards: {
          create: plan.boards.map((boardItem) => ({
            id: boardItem.id,
            title: boardItem.title,
            backgroundColor: boardItem.backgroundColor,
            createdById: owner.id,
            createdAt: boardItem.createdAt,
            lists: {
              create: boardItem.lists.map((listItem, listIndex) => ({
                id: listItem.id,
                title: listItem.title,
                position: (listIndex + 1) * GAP,
                cards: {
                  create: listItem.cards.map((cardItem, cardIndex) => ({
                    id: cardItem.id,
                    title: cardItem.title,
                    description: cardItem.description,
                    position: (cardIndex + 1) * GAP,
                    dueDate: cardItem.dueDate,
                    priority: cardItem.priority,
                    completedAt: cardItem.completedAt,
                    createdById: owner.id,
                    members: {
                      create: cardItem.assignedUserIds.map((userId) => ({ userId })),
                    },
                  })),
                },
              })),
            },
          })),
        },
      } satisfies Prisma.WorkspaceCreateInput;

    await transaction.workspace.create({ data: workspaceData });

    return { manifest: plan.manifest };
  });
}

export async function resetDemoFixture(
  db: DemoFixtureDb,
  ownerEmail: string,
  collaboratorEmail: string,
): Promise<
  | { status: "deleted"; workspaceId: string }
  | { status: "not-found"; workspaceId: null }
> {
  return db.$transaction(async (transaction) => {
    const { owner, collaborator } = await loadVerifiedUsers(
      transaction,
      ownerEmail,
      collaboratorEmail,
    );
    const existing = await transaction.workspace.findUnique({
      where: { slug: DEMO_FIXTURE_SLUG },
      select: { id: true, slug: true, metadata: true },
    });

    if (!existing) return { status: "not-found", workspaceId: null };

    assertWorkspaceOwnership(existing, owner, collaborator, "reset");
    await transaction.workspace.delete({ where: { id: existing.id } });
    return { status: "deleted", workspaceId: existing.id };
  });
}
