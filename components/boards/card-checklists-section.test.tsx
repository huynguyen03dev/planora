import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Server Actions + router — boundaries we stub so the test drives only
// the section's own CRUD logic.
const actions = vi.hoisted(() => ({
  createChecklistAction: vi.fn(),
  createChecklistItemAction: vi.fn(),
  deleteChecklistAction: vi.fn(),
  deleteChecklistItemAction: vi.fn(),
  toggleChecklistItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock(
  "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions",
  () => actions,
);

import { CardChecklistsSection, type ChecklistData } from "./card-checklists-section";

const user = userEvent.setup({ pointerEventsCheck: 0 });

function makeChecklist(
  overrides: Partial<ChecklistData> = {},
): ChecklistData {
  return {
    id: "cl-1",
    title: "Setup",
    position: 0,
    items: [
      { id: "item-1", title: "Install deps", isCompleted: true, position: 0 },
      { id: "item-2", title: "Configure DB", isCompleted: false, position: 1 },
    ],
    ...overrides,
  };
}

function renderSection(
  props: Partial<Parameters<typeof CardChecklistsSection>[0]> = {},
) {
  return render(
    <CardChecklistsSection
      cardId="card-1"
      checklists={[makeChecklist()]}
      canEdit
      {...props}
    />,
  );
}

describe("CardChecklistsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.createChecklistAction.mockResolvedValue({ success: true });
    actions.createChecklistItemAction.mockResolvedValue({ success: true });
    actions.deleteChecklistAction.mockResolvedValue({ success: true });
    actions.deleteChecklistItemAction.mockResolvedValue({ success: true });
    actions.toggleChecklistItemAction.mockResolvedValue({ success: true });
  });

  // ---- rendering ----

  it("renders the section heading", () => {
    renderSection();
    expect(
      screen.getByRole("heading", { name: "Checklists" }),
    ).toBeInTheDocument();
  });

  it("renders checklist titles", () => {
    renderSection({
      checklists: [
        makeChecklist({ id: "cl-1", title: "Setup" }),
        makeChecklist({ id: "cl-2", title: "Deploy" }),
      ],
    });
    expect(screen.getByText("Setup")).toBeInTheDocument();
    expect(screen.getByText("Deploy")).toBeInTheDocument();
  });

  it("renders checklist items", () => {
    renderSection();
    expect(screen.getByText("Install deps")).toBeInTheDocument();
    expect(screen.getByText("Configure DB")).toBeInTheDocument();
  });

  it("shows completed items with line-through styling", () => {
    renderSection();
    // The completed item label should carry the line-through class
    const completedLabel = screen.getByText("Install deps");
    expect(completedLabel.className).toContain("line-through");
  });

  it("shows progress count (done/total)", () => {
    renderSection();
    // 1 completed out of 2 total
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("shows progress 0/0 for an empty checklist", () => {
    renderSection({
      checklists: [
        makeChecklist({ id: "empty", title: "Empty", items: [] }),
      ],
    });
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });

  it('shows "No items yet." when a checklist has no items', () => {
    renderSection({
      checklists: [
        makeChecklist({ id: "empty", title: "Empty", items: [] }),
      ],
    });
    expect(screen.getByText("No items yet.")).toBeInTheDocument();
  });

  it('shows "No checklists yet." when there are no checklists', () => {
    renderSection({ checklists: [] });
    expect(screen.getByText("No checklists yet.")).toBeInTheDocument();
  });

  it("shows Add checklist button when empty and canEdit", () => {
    renderSection({ checklists: [] });
    expect(
      screen.getByRole("button", { name: "Add checklist" }),
    ).toBeInTheDocument();
  });

  // ---- canEdit=false ----

  it("hides the Add checklist button when canEdit is false", () => {
    renderSection({ checklists: [], canEdit: false });
    expect(
      screen.queryByRole("button", { name: "Add checklist" }),
    ).not.toBeInTheDocument();
  });

  it("hides Delete checklist buttons when canEdit is false", () => {
    renderSection({ canEdit: false });
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("disables checkboxes when canEdit is false", () => {
    renderSection({ canEdit: false });
    const checkbox = screen.getByLabelText("Install deps");
    expect(checkbox).toBeDisabled();
  });

  it("hides item delete (×) buttons when canEdit is false", () => {
    renderSection({ canEdit: false });
    expect(
      screen.queryByRole("button", { name: "Delete Install deps" }),
    ).not.toBeInTheDocument();
  });

  it("hides the Add item form when canEdit is false", () => {
    renderSection({ canEdit: false });
    expect(screen.queryByPlaceholderText("Add an item…")).not.toBeInTheDocument();
  });

  // ---- actions: add checklist ----

  it("adds a checklist via the create action", async () => {
    renderSection({ checklists: [] });
    await user.click(screen.getByRole("button", { name: "Add checklist" }));

    const titleInput = screen.getByPlaceholderText("Checklist title");
    await user.type(titleInput, "My checklist");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(actions.createChecklistAction).toHaveBeenCalledTimes(1),
    );
    const formData = actions.createChecklistAction.mock.calls[0][0] as FormData;
    expect(formData.get("cardId")).toBe("card-1");
    expect(formData.get("title")).toBe("My checklist");
  });

  it("does not call the create action when the title is empty", async () => {
    renderSection({ checklists: [] });
    await user.click(screen.getByRole("button", { name: "Add checklist" }));

    // Don't type anything — the Create button should be disabled
    const createButton = screen.getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();
    await user.click(createButton);
    expect(actions.createChecklistAction).not.toHaveBeenCalled();
  });

  it("Cancel dismisses the add-checklist form without calling the action", async () => {
    renderSection({ checklists: [] });
    await user.click(screen.getByRole("button", { name: "Add checklist" }));
    expect(screen.getByPlaceholderText("Checklist title")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByPlaceholderText("Checklist title"),
    ).not.toBeInTheDocument();
    expect(actions.createChecklistAction).not.toHaveBeenCalled();
  });

  // ---- actions: add item ----

  it("adds an item via the create action", async () => {
    renderSection();
    const itemInput = screen.getByPlaceholderText("Add an item…");
    await user.type(itemInput, "New item");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(actions.createChecklistItemAction).toHaveBeenCalledTimes(1),
    );
    const formData =
      actions.createChecklistItemAction.mock.calls[0][0] as FormData;
    expect(formData.get("checklistId")).toBe("cl-1");
    expect(formData.get("title")).toBe("New item");
  });

  // ---- actions: toggle item ----

  it("toggles an item via the toggle action", async () => {
    renderSection();
    // Click the label of the first (completed) item to toggle it off
    await user.click(screen.getByLabelText("Install deps"));

    await waitFor(() =>
      expect(actions.toggleChecklistItemAction).toHaveBeenCalledTimes(1),
    );
    const formData =
      actions.toggleChecklistItemAction.mock.calls[0][0] as FormData;
    expect(formData.get("itemId")).toBe("item-1");
    // isCompleted is true → the toggle flips it to false
    expect(formData.get("isCompleted")).toBe("false");
  });

  it("toggles an incomplete item to complete", async () => {
    renderSection();
    await user.click(screen.getByLabelText("Configure DB"));

    await waitFor(() =>
      expect(actions.toggleChecklistItemAction).toHaveBeenCalledTimes(1),
    );
    const formData =
      actions.toggleChecklistItemAction.mock.calls[0][0] as FormData;
    expect(formData.get("itemId")).toBe("item-2");
    expect(formData.get("isCompleted")).toBe("true");
  });

  // ---- actions: delete item ----

  it("deletes an item via the delete action", async () => {
    renderSection();
    await user.click(
      screen.getByRole("button", { name: "Delete Install deps" }),
    );

    await waitFor(() =>
      expect(actions.deleteChecklistItemAction).toHaveBeenCalledTimes(1),
    );
    const formData =
      actions.deleteChecklistItemAction.mock.calls[0][0] as FormData;
    expect(formData.get("itemId")).toBe("item-1");
  });

  // ---- actions: delete checklist ----

    it("deletes a checklist via the delete action", async () => {
      renderSection();
      await user.click(screen.getByText("Delete"));

    await waitFor(() =>
      expect(actions.deleteChecklistAction).toHaveBeenCalledTimes(1),
    );
      const formData =
        actions.deleteChecklistAction.mock.calls[0][0] as FormData;
      expect(formData.get("checklistId")).toBe("cl-1");
    });

    it("calls onChecklistDeleted after a successful checklist delete", async () => {
      const onChecklistDeleted = vi.fn();
      renderSection({ onChecklistDeleted });
      await user.click(screen.getByText("Delete"));

      await waitFor(() =>
        expect(onChecklistDeleted).toHaveBeenCalledWith("cl-1"),
      );
    });

  // ---- error display ----

  it("shows an error message when an action fails", async () => {
    actions.toggleChecklistItemAction.mockResolvedValue({
      success: false,
      error: "Toggle failed",
    });
    renderSection();
    await user.click(screen.getByLabelText("Install deps"));

    await waitFor(() =>
      expect(screen.getByText("Toggle failed")).toBeInTheDocument(),
    );
  });

  // ---- "+" checklist button in header when checklists exist ----

  it("shows Add checklist in the header when checklists exist and canEdit", () => {
    renderSection({
      checklists: [makeChecklist()],
      canEdit: true,
    });
    expect(
      screen.getAllByRole("button", { name: "Add checklist" }).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
