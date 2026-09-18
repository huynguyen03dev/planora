/**
 * WorkspaceItem — sidebar row touch targets (polish/mobile-dashboard).
 *
 * The collapsible workspace row and its sub-links must offer >=36px pointer /
 * >=44px coarse hit targets (DESIGN.md). Class-level assertions; the row
 * still toggles via aria-expanded and the sub-links stay real links.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  usePathname: vi.fn(() => "/boards"),
  // Selected workspace w1 -> the row starts expanded (sub-links visible).
  useSearchParams: vi.fn(() => new URLSearchParams("workspace=w1")),
}));

vi.mock("next/navigation", () => ({
  usePathname: h.usePathname,
  useSearchParams: h.useSearchParams,
}));

import { WorkspaceItem } from "./workspace-item";

const workspace = { id: "w1", name: "Acme", slug: "acme" };

describe("WorkspaceItem — sidebar row touch targets", () => {
  it("expands the workspace row and its sub-links to >=36px pointer / >=44px coarse", () => {
    render(<WorkspaceItem workspace={workspace} />);

    const row = screen.getByRole("button", { name: /acme/i });
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(row).toHaveClass("min-h-9", "pointer-coarse:min-h-11");

    for (const label of ["Boards", "Analytics", "Members", "Settings"]) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveClass("min-h-9", "pointer-coarse:min-h-11");
    }
  });
});
