import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("presents a clear product promise and primary signup path", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Plan work. Focus on what matters today.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start planning" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
    expect(
      screen.getByRole("link", { name: "Explore features" }),
    ).toHaveAttribute("href", "#features");
  });

  it("shows product evidence and the three core capabilities", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("img", { name: "Planora project board preview" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Boards that stay clear" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your day in one place" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Routine work, automated" }),
    ).toBeInTheDocument();
  });
});
