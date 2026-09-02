import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));
vi.mock("./auth-header-actions", () => ({
  AuthHeaderActions: () => null,
}));
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Switch theme</button>,
}));

import PublicLayout from "./layout";

describe("PublicLayout", () => {
  it("makes the app-wide theme control available on public pages", async () => {
    const element = await PublicLayout({ children: <div>page</div> });
    render(element);

    expect(
      screen.getByRole("button", { name: "Switch theme" }),
    ).toBeInTheDocument();
  });
});
