import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getBoardTheme } from "@/lib/constants";

const previewColumns = [
  {
    title: "Backlog",
    cards: [
      {
        title: "Research onboarding flows",
        label: "Docs",
        labelClass: "bg-label-orange text-label-orange-fg",
        priority: "Low",
      },
      {
        title: "Define product milestones",
        label: "Feature",
        labelClass: "bg-label-blue text-label-blue-fg",
        priority: "Medium",
      },
    ],
  },
  {
    title: "Design",
    cards: [
      {
        title: "Polish board experience",
        label: "Design",
        labelClass: "bg-label-purple text-label-purple-fg",
        priority: "High",
      },
      {
        title: "Review empty states",
        label: "Design",
        labelClass: "bg-label-purple text-label-purple-fg",
        priority: "Medium",
      },
    ],
  },
  {
    title: "In progress",
    cards: [
      {
        title: "Prepare product demo",
        label: "Feature",
        labelClass: "bg-label-blue text-label-blue-fg",
        priority: "Urgent",
      },
      {
        title: "Test realtime updates",
        label: "Backend",
        labelClass: "bg-label-green text-label-green-fg",
        priority: "High",
      },
    ],
  },
  {
    title: "Done",
    cards: [
      {
        title: "Invite collaborators",
        label: "Team",
        labelClass: "bg-label-teal text-label-teal-fg",
        priority: "Low",
      },
    ],
  },
];

const features = [
  {
    number: "01",
    title: "Boards that stay clear",
    description:
      "Organize projects into focused lists and cards without losing the details that move work forward.",
  },
  {
    number: "02",
    title: "Your day in one place",
    description:
      "See assigned work across every workspace in Today, then capture the next task without breaking focus.",
  },
  {
    number: "03",
    title: "Routine work, automated",
    description:
      "Build simple rules that keep cards moving and let the team spend more time on the work itself.",
  },
];

function BoardPreview() {
  const boardTheme = getBoardTheme();

  return (
    <div
      role="img"
      aria-label="Planora project board preview"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-white"
        style={{ background: boardTheme.header }}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold sm:text-base">
            Product roadmap
          </p>
          <p className="text-xs text-white/70">Planora demo workspace</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <div className="flex -space-x-1" aria-hidden="true">
            <span className="flex size-6 items-center justify-center rounded-full border border-white/70 bg-card text-xs font-medium text-card-foreground">
              AL
            </span>
            <span className="flex size-6 items-center justify-center rounded-full border border-white/70 bg-secondary text-xs font-medium text-secondary-foreground">
              MK
            </span>
          </div>
          <span className="hidden rounded-md border border-white/30 bg-white/10 px-2 py-1 sm:inline">
            Search cards...
          </span>
          <span className="rounded-md border border-white/30 bg-white/10 px-2 py-1">
            Filter
          </span>
        </div>
      </div>

      <div className="overflow-hidden p-3" style={{ background: boardTheme.surface }}>
        <div className="flex w-max items-start">
          {previewColumns.map((column) => (
            <div
              key={column.title}
                className="mr-2 w-64 shrink-0 rounded-lg bg-muted p-2.5 sm:w-44"
            >
              <div className="mb-2 flex items-center justify-between gap-1 px-0.5">
                <p className="truncate text-xs font-semibold sm:text-sm">
                  {column.title}
                </p>
                <span className="text-xs text-muted-foreground">•••</span>
              </div>
              <div>
                {column.cards.map((card) => (
                  <div
                    key={card.title}
                    className="mb-2 rounded-lg border border-border bg-card p-2"
                  >
                    <span
                      className={`mb-1.5 inline-block rounded-sm px-1.5 py-0.5 text-xs ${card.labelClass}`}
                    >
                      {card.label}
                    </span>
                    <p className="text-xs leading-snug sm:text-sm">
                      {card.title}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Priority · {card.priority}
                    </p>
                  </div>
                ))}
                <p className="px-1 pt-0.5 text-xs text-muted-foreground">
                  + Add a card
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-24">
        <div className="max-w-xl">
          <p className="mb-4 text-sm font-medium text-primary">
            Calm project management for focused teams
          </p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Plan work. Focus on what matters today.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Planora brings boards, daily priorities, and team workflows into one
            clear workspace—so every task has a place and every day has a focus.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <Link href="/sign-up">Start planning</Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href="#features">Explore features</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Boards · Today view · Quick capture · Automations
          </p>
        </div>

        <BoardPreview />
      </section>

      <section id="features" aria-labelledby="features-heading" className="border-t border-border bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-primary">Built for clarity</p>
            <h2
              id="features-heading"
              className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Keep work moving without adding more noise.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.number}
                className="rounded-lg border border-border bg-card p-6"
              >
                <p className="font-mono text-xs text-muted-foreground">
                  {feature.number}
                </p>
                <h3 className="mt-4 text-xl font-medium tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
