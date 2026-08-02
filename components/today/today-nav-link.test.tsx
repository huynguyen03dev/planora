/**
 * US-083 W6 — the authenticated chrome's Today entry.
 *
 * `TodayNavLink` is the discoverable global-chrome nav entry for `/today`:
 * a real link from any authenticated route, with an explicit
 * `aria-current="page"` (non-color-only active signal) when the user is on
 * `/today`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  usePathname: vi.fn(() => "/boards"),
}));

vi.mock("next/navigation", () => ({ usePathname: h.usePathname }));

import { TodayNavLink } from "./today-nav-link";

beforeEach(() => {
  h.usePathname.mockReset();
});

describe("TodayNavLink — global chrome entry (US-083 W6)", () => {
  it("renders a discoverable link to /today from any authenticated route", () => {
    h.usePathname.mockReturnValue("/workspace/acme/dashboard");
    render(<TodayNavLink />);

    const link = screen.getByRole("link", { name: "Today" });
    expect(link).toHaveAttribute("href", "/today");
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("marks the link as the current page while on /today (non-color-only active state)", () => {
    h.usePathname.mockReturnValue("/today");
    render(<TodayNavLink />);

    const link = screen.getByRole("link", { name: "Today" });
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
