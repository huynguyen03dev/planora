import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "./page";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("smooth-scrolls to features on every activation", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    render(<HomePage />);

    const exploreFeatures = screen.getByRole("link", {
      name: "Explore features",
    });
    fireEvent.click(exploreFeatures);
    fireEvent.click(exploreFeatures);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("avoids animated scrolling when reduced motion is requested", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    render(<HomePage />);

    fireEvent.click(
      screen.getByRole("link", { name: "Explore features" }),
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });
});
