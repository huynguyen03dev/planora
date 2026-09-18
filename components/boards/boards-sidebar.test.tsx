/**
 * BoardsSidebar — mobile bounds + nav touch targets (polish/mobile-dashboard).
 *
 * On mobile the sidebar is a full-width block above the boards grid; many
 * workspaces used to push the grid off-screen indefinitely. The sidebar is now
 * a bounded, scroll-owned container on mobile (max-h + overflow-y-auto) and
 * stays unbounded on desktop. Nav rows carry >=36px pointer / >=44px coarse
 * hit targets (DESIGN.md). Class-level assertions — Tailwind utilities are
 * not computed by happy-dom, but the class contract is the unit of change.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  usePathname: vi.fn(() => "/boards"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  usePathname: h.usePathname,
  useSearchParams: h.useSearchParams,
}));

import { BoardsSidebar } from "./boards-sidebar";

const workspaces = [{ id: "w1", name: "Acme", slug: "acme" }];

describe("BoardsSidebar — mobile bounds + nav touch targets", () => {
  it("bounds the mobile sidebar height and owns its scroll (desktop unbounded)", () => {
    render(<BoardsSidebar workspaces={workspaces} />);

    const aside = document.querySelector("aside");
    expect(aside).toBeInTheDocument();
    expect(aside).toHaveClass(
      "max-h-[40dvh]",
      "overflow-y-auto",
      "themed-scrollbar",
      "md:max-h-none",
      "md:overflow-visible",
    );
  });

  it("gives the Boards row and workspace rows >=36px pointer / >=44px coarse hit targets", () => {
    render(<BoardsSidebar workspaces={workspaces} />);

    const boards = screen.getByRole("link", { name: "Boards" });
    expect(boards).toHaveClass("min-h-9", "pointer-coarse:min-h-11");

    const workspace = screen.getByRole("button", { name: /acme/i });
    expect(workspace).toHaveClass("min-h-9", "pointer-coarse:min-h-11");
  });
});
