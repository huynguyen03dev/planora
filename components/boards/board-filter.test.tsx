import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  useBoardStore,
  type ListWithCards,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";

import { BoardFilter } from "./board-filter";

// Radix's Popover guards its trigger with a pointer-events check that happy-dom
// doesn't model; disable it so the click still opens the popover.
const user = userEvent.setup({ pointerEventsCheck: 0 });

function seed(lists: ListWithCards[] = []) {
  useBoardStore.getState().reset();
  useBoardStore.getState().setLists(lists);
}

describe("BoardFilter", () => {
  beforeEach(() => {
    seed();
  });

  it("renders the filter trigger with no badge when nothing is active", () => {
    render(<BoardFilter />);
    const trigger = screen.getByRole("button", { name: "Filter cards" });
    expect(trigger).toBeInTheDocument();
    // The count badge only appears once a filter/search is active.
    expect(trigger).toHaveTextContent(/^Filter$/);
  });

  it("opens the popover and shows the filter dimension sections", async () => {
    render(<BoardFilter />);
    await user.click(screen.getByRole("button", { name: "Filter cards" }));

    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(screen.getByText("Card status")).toBeInTheDocument();
    expect(screen.getByText("Due date")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
    // Quick member options always render, even with no cards seeded.
    expect(screen.getByText("Assigned to me")).toBeInTheDocument();
    expect(screen.getByText("No members")).toBeInTheDocument();
  });

  it("toggling a status checkbox pushes the value into the store", async () => {
    render(<BoardFilter />);
    await user.click(screen.getByRole("button", { name: "Filter cards" }));

    expect(useBoardStore.getState().filterStatuses).toEqual([]);
    await user.click(screen.getByLabelText("Complete"));
    expect(useBoardStore.getState().filterStatuses).toEqual(["complete"]);

    // Toggling again removes it.
    await user.click(screen.getByLabelText("Complete"));
    expect(useBoardStore.getState().filterStatuses).toEqual([]);
  });

  it("shows the active-filter count badge reflecting store state", async () => {
    // Seed one active dimension before render.
    useBoardStore.getState().toggleStatusFilter("incomplete");
    render(<BoardFilter />);

    const trigger = screen.getByRole("button", { name: "Filter cards" });
    expect(within(trigger).getByText("1")).toBeInTheDocument();
  });

  it("Clear filters is disabled when nothing is active and clears when it is", async () => {
    render(<BoardFilter />);
    await user.click(screen.getByRole("button", { name: "Filter cards" }));

    const clear = screen.getByRole("button", { name: "Clear filters" });
    expect(clear).toBeDisabled();

    await user.click(screen.getByLabelText("Not complete"));
    expect(useBoardStore.getState().filterStatuses).toEqual(["incomplete"]);
    expect(clear).toBeEnabled();

    await user.click(clear);
    expect(useBoardStore.getState().filterStatuses).toEqual([]);
  });
});
