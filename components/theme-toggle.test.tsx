import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle — chrome hit target", () => {
  it("expands the trigger to >=36px pointer / >=44px coarse", () => {
    render(<ThemeToggle />);

    const trigger = screen.getByRole("button", { name: "Switch theme" });
    expect(trigger).toHaveClass("size-9", "pointer-coarse:size-11");
  });
});
