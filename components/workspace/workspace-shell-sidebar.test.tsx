/**
 * WorkspaceShellSidebar — nav row touch targets (polish/mobile-dashboard).
 *
 * The workspace shell nav rows must offer >=36px pointer / >=44px coarse hit
 * targets (DESIGN.md), like the boards-sidebar rows.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  usePathname: vi.fn(() => "/workspace/acme/dashboard"),
}));

vi.mock("next/navigation", () => ({ usePathname: h.usePathname }));

import { WorkspaceShellSidebar } from "./workspace-shell-sidebar";

describe("WorkspaceShellSidebar — nav row touch targets", () => {
  it("gives every nav row a >=36px pointer / >=44px coarse hit target", () => {
    render(
      <WorkspaceShellSidebar workspaceId="w1" slug="acme" workspaceName="Acme" />,
    );

    for (const label of ["Boards", "Analytics", "Members", "Automation", "Settings"]) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveClass("min-h-9", "pointer-coarse:min-h-11");
    }
  });
});
