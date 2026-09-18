#!/usr/bin/env tsx
/**
 * Demo-board seeder (local UI/UX review only — NOT a migration, NOT a fixture).
 *
 * Builds one workspace + a "Product Roadmap" board dense enough for a browser
 * walkthrough: priorities, colored labels, due dates (overdue/today/upcoming),
 * descriptions, multiple members, checklists, comments, archived cards.
 *
 * Usage: npx tsx --require dotenv/config scripts/seed-demo-board.ts --email <user> [--slug demo]
 * The --email user must already exist; other users join as members for avatar variety.
 * Idempotent per slug: re-running wipes + recreates.
 */
import { randomUUID } from "node:crypto";

import { Priority } from "@/app/generated/prisma/client";
import db from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
function daysFromNow(n: number): Date {
  return new Date(now.getTime() + n * DAY);
}

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required --${name}`);
}

const GAP = 16384;

// Board label palette (Trello-style).
const LABELS = [
  { name: "Bug", color: "#ef4444" },
  { name: "Feature", color: "#3b82f6" },
  { name: "Design", color: "#a855f7" },
  { name: "Backend", color: "#22c55e" },
  { name: "Docs", color: "#f59e0b" },
  { name: "Blocked", color: "#64748b" },
] as const;

type CardSpec = {
  title: string;
  description?: string;
  priority?: Priority;
  labels?: string[]; // label names from LABELS
  dueInDays?: number; // relative to now
  memberCount?: number; // how many workspace members to assign
  checklist?: { title: string; items: [string, boolean][] };
  comments?: string[];
};

// `completed` is a seed convenience: it marks this list's cards complete
// (writes card.completedAt). Completion is card-owned — there is no list "done"
// flag (decision 0020).
type ListSpec = { title: string; completed?: boolean; cards: CardSpec[] };

const BOARD: ListSpec[] = [
  {
    title: "Backlog",
    cards: [
      {
        title: "Research competitor onboarding flows",
        description:
          "Audit how Trello, Linear, and Asana handle first-run onboarding. Capture screenshots and note the moments that create early activation.",
        priority: Priority.LOW,
        labels: ["Docs"],
        dueInDays: 14,
      },
      {
        title: "Spike: offline-first card editing",
        description: "Evaluate whether a local cache + sync queue is worth the complexity for our scale.",
        priority: Priority.MEDIUM,
        labels: ["Feature", "Backend"],
        memberCount: 1,
      },
      {
        title: "Dark mode polish pass",
        labels: ["Design"],
        priority: Priority.LOW,
      },
      {
        title: "Audit unused Tailwind tokens",
        labels: ["Docs"],
      },
    ],
  },
  {
    title: "Design",
    cards: [
      {
        title: "Redesign the empty-board state",
        description:
          "The current empty state is a single line of text. Design an illustrated state with a clear primary CTA to create the first list.",
        priority: Priority.HIGH,
        labels: ["Design", "Feature"],
        dueInDays: 3,
        memberCount: 2,
        checklist: {
          title: "Design checklist",
          items: [
            ["Lo-fi wireframe", true],
            ["Hi-fi mock in Figma", true],
            ["Dark mode variant", false],
            ["Hand-off to engineering", false],
          ],
        },
        comments: [
          "Started exploring a two-column layout — illustration on the left, CTA on the right.",
          "Stakeholder feedback: keep it single-column on mobile.",
        ],
      },
      {
        title: "Card detail sheet — spacing audit",
        description: "Inconsistent vertical rhythm in the card sheet. Normalize to the 4px spacing scale.",
        priority: Priority.MEDIUM,
        labels: ["Design"],
        dueInDays: 6,
        memberCount: 1,
      },
      {
        title: "New label color palette",
        labels: ["Design"],
        priority: Priority.LOW,
        memberCount: 1,
      },
    ],
  },
  {
    title: "In Progress",
    cards: [
      {
        title: "Implement realtime card move broadcast",
        description:
          "Wire Socket.io emit on moveCardAction and reconcile on the observer side. Must defer reconciliation while the observer is mid-drag.",
        priority: Priority.URGENT,
        labels: ["Feature", "Backend"],
        dueInDays: 1,
        memberCount: 2,
        checklist: {
          title: "Implementation",
          items: [
            ["Emit on move", true],
            ["Observer reducer", true],
            ["Drag-aware deferral", false],
            ["E2E proof", false],
          ],
        },
        comments: [
          "Emit is in. Working on the reconcile-on-drop path now.",
          "@design can you confirm the move animation easing?",
        ],
      },
      {
        title: "Fix overdue badge color contrast",
        description: "The overdue due-date badge fails WCAG AA contrast on the red background. Bump to a darker red or add a border.",
        priority: Priority.HIGH,
        labels: ["Bug", "Design"],
        dueInDays: -2, // overdue
        memberCount: 1,
      },
      {
        title: "Board background color picker",
        priority: Priority.MEDIUM,
        labels: ["Feature"],
        dueInDays: 0, // due today
        memberCount: 1,
      },
      {
        title: "Migrate to Prisma 7 adapter API",
        description: "Blocked on the pg adapter peer-dep bump. Tracking upstream issue.",
        priority: Priority.HIGH,
        labels: ["Backend", "Blocked"],
        dueInDays: -5, // overdue
        memberCount: 1,
      },
    ],
  },
  {
    title: "Review",
    cards: [
      {
        title: "PR #41 — notification bell unification",
        description: "Workspace invitations now flow through the bell. Needs a design review on the unread dot placement.",
        priority: Priority.MEDIUM,
        labels: ["Feature"],
        dueInDays: 2,
        memberCount: 2,
        comments: ["Left two comments on the dropdown alignment."],
      },
      {
        title: "PR #39 — responsive board columns",
        labels: ["Feature", "Design"],
        priority: Priority.MEDIUM,
        memberCount: 1,
      },
    ],
  },
  {
    title: "Done",
    completed: true,
    cards: [
      {
        title: "Set up CI lint + typecheck gate",
        labels: ["Backend"],
        priority: Priority.LOW,
        memberCount: 1,
      },
      {
        title: "Card labels CRUD + realtime",
        description: "Shipped label create/rename/recolor/delete with live propagation.",
        labels: ["Feature"],
        priority: Priority.MEDIUM,
        memberCount: 2,
        checklist: {
          title: "Shipped",
          items: [
            ["Schema + migration", true],
            ["Server Actions", true],
            ["Realtime", true],
          ],
        },
      },
      {
        title: "RBAC matrix tests",
        labels: ["Backend", "Docs"],
        priority: Priority.LOW,
      },
      {
        title: "Due-date reminder scheduler",
        labels: ["Feature", "Backend"],
        priority: Priority.HIGH,
        memberCount: 1,
      },
    ],
  },
];

async function main() {
  const email = arg("email");
  const slug = arg("slug", "demo");

  const owner = await db.user.findUnique({ where: { email } });
  if (!owner) throw new Error(`No user for ${email} — sign up via the UI first.`);

  // Pull a few other existing users in as extra members for avatar variety.
  const others = await db.user.findMany({
    where: { email: { not: email } },
    take: 4,
  });
  const memberPool = [owner, ...others];

  // Idempotent: wipe a prior run with this slug (cascade clears the board tree).
  const existing = await db.workspace.findUnique({ where: { slug } });
  if (existing) await db.workspace.delete({ where: { id: existing.id } });

  const workspace = await db.workspace.create({
    data: {
      id: randomUUID(),
      name: "Planora Demo",
      slug,
      createdAt: now,
      workspacemembers: {
        create: memberPool.map((u, i) => ({
          id: randomUUID(),
          userId: u.id,
          role: i === 0 ? "admin" : i === 1 ? "editor" : "viewer",
          createdAt: now,
        })),
      },
    },
  });

  const board = await db.board.create({
    data: {
      id: randomUUID(),
      workspaceId: workspace.id,
      title: "Product Roadmap",
      backgroundColor: "#0ea5e9",
      createdById: owner.id,
    },
  });

  // Labels (board-scoped), keyed by name.
  const labelByName = new Map<string, string>();
  for (const l of LABELS) {
    const created = await db.label.create({
      data: { boardId: board.id, name: l.name, color: l.color },
    });
    labelByName.set(l.name, created.id);
  }

  let listPos = 0;
  let cardCount = 0;
  for (const listSpec of BOARD) {
    listPos += 1;
    const list = await db.list.create({
      data: {
        boardId: board.id,
        title: listSpec.title,
        position: listPos * GAP,
      },
    });

    let cardPos = 0;
    for (const c of listSpec.cards) {
      cardPos += 1;
      cardCount += 1;
      const card = await db.card.create({
        data: {
          listId: list.id,
          title: c.title,
          description: c.description ?? null,
          position: cardPos * GAP,
          priority: c.priority ?? null,
          dueDate: c.dueInDays === undefined ? null : daysFromNow(c.dueInDays),
          completedAt: listSpec.completed ? daysFromNow(-3) : null,
          createdById: owner.id,
        },
      });

      if (c.labels?.length) {
        await db.cardLabel.createMany({
          data: c.labels
            .map((name) => labelByName.get(name))
            .filter((id): id is string => Boolean(id))
            .map((labelId) => ({ cardId: card.id, labelId })),
        });
      }

      if (c.memberCount) {
        await db.cardMember.createMany({
          data: memberPool
            .slice(0, c.memberCount)
            .map((u) => ({ cardId: card.id, userId: u.id })),
        });
      }

      if (c.checklist) {
        const checklist = await db.checklist.create({
          data: { cardId: card.id, title: c.checklist.title, position: GAP },
        });
        await db.checklistItem.createMany({
          data: c.checklist.items.map(([title, done], i) => ({
            checklistId: checklist.id,
            title,
            isCompleted: done,
            position: (i + 1) * GAP,
          })),
        });
      }

      if (c.comments?.length) {
        for (let i = 0; i < c.comments.length; i++) {
          await db.comment.create({
            data: {
              cardId: card.id,
              userId: memberPool[i % memberPool.length].id,
              content: c.comments[i],
            },
          });
        }
      }
    }
  }

  // A small empty board too, so the boards grid has variety + an empty-state demo.
  await db.board.create({
    data: {
      workspaceId: workspace.id,
      title: "Marketing Launch",
      backgroundColor: "#a855f7",
      createdById: owner.id,
      lists: {
        create: [
          { title: "Ideas", position: GAP },
          { title: "Doing", position: 2 * GAP },
          { title: "Shipped", position: 3 * GAP },
        ],
      },
    },
  });

  console.log(
    [
      `Seeded workspace "${workspace.name}" (slug: ${slug}) with ${memberPool.length} members.`,
      `Board "Product Roadmap": ${BOARD.length} lists, ${cardCount} cards.`,
      `+ empty "Marketing Launch" board.`,
      `BOARD_URL=/boards/${board.id}`,
    ].join("\n"),
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await db.$disconnect();
    process.exit(1);
  });
