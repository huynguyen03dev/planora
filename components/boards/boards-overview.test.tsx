/**
 * BoardsOverview — Starred heading (polish/mobile-dashboard).
 *
 * The "Starred" section heading used an OS-dependent emoji (⭐). It now uses
 * the established Hugeicons star treatment in the neutral muted-foreground
 * voice (starred-state yellow stays on the card/header toggle — scarce-accent
 * policy). The heading's accessible name must come from the text alone; the
 * icon is decorative.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(authenticated)/(dashboard)/boards/actions", () => ({
  toggleBoardStarAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { BoardsOverview } from "./boards-overview";

const board = {
  id: "b1",
  workspaceId: "w1",
  title: "Roadmap",
  backgroundColor: null,
  starred: true,
  listCount: 1,
  cardCount: 2,
  lastActivityAt: new Date(),
  members: [],
  memberCount: 0,
};

describe("BoardsOverview — Starred heading", () => {
  it("renders the Starred section heading with the Hugeicons star, not the OS emoji", () => {
    render(
      <BoardsOverview
        workspaces={[
          { id: "w1", name: "Acme", slug: "acme", canCreateBoard: true },
        ]}
        boards={[board]}
        starredBoardIds={["b1"]}
      />,
    );

    const heading = screen.getByRole("heading", { name: "Starred" });
    // No emoji in the heading — the accessible name comes from the word alone.
    expect(heading.textContent).toBe("Starred");
    // The established Hugeicons star renders (svg), decorative for AT.
    const icon = heading.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
