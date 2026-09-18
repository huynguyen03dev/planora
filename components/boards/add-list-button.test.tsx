/**
 * AddListButton — accessible field naming + scoped error announcement.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  createListAction: vi.fn(async (): Promise<
    | { success: true; listId: string }
    | { success: false; error: string }
  > => ({ success: true, listId: "list-1" })),
}));

vi.mock("@/app/(authenticated)/(dashboard)/boards/[boardId]/actions", () => actions);

import { AddListButton } from "./add-list-button";

const user = userEvent.setup({ pointerEventsCheck: 0 });

describe("AddListButton — accessible naming + scoped errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names the new-list field 'List title' when expanded", async () => {
    render(<AddListButton boardId="board-1" canCreate />);
    await user.click(screen.getByRole("button", { name: "+ Add a list" }));
    expect(
      screen.getByRole("textbox", { name: "List title" }),
    ).toBeInTheDocument();
  });

  it("announces a server error via role=alert wired to the field", async () => {
    actions.createListAction.mockResolvedValueOnce({
      success: false,
      error: "Board is archived",
    });

    render(<AddListButton boardId="board-1" canCreate />);
    await user.click(screen.getByRole("button", { name: "+ Add a list" }));
    const input = screen.getByRole("textbox", { name: "List title" });
    await user.type(input, "New list");
    await user.click(screen.getByRole("button", { name: "Add list" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Board is archived");
    expect(alert).toHaveAttribute("id", "add-list-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "add-list-error");
    // Composer stays open for a retry.
    expect(screen.getByRole("textbox", { name: "List title" })).toHaveValue(
      "New list",
    );
  });

  it("clears the error and description wiring while typing", async () => {
    actions.createListAction.mockResolvedValueOnce({
      success: false,
      error: "Board is archived",
    });

    render(<AddListButton boardId="board-1" canCreate />);
    await user.click(screen.getByRole("button", { name: "+ Add a list" }));
    const input = screen.getByRole("textbox", { name: "List title" });
    await user.type(input, "New list");
    await user.click(screen.getByRole("button", { name: "Add list" }));
    await screen.findByRole("alert");

    await user.type(input, "!");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});
