import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CardLabelsSection, type LabelChip } from "./card-labels-section";

// ── Mocks ────────────────────────────────────────────────────────────────────

const actions = vi.hoisted(() => ({
  addCardLabelAction: vi.fn(),
  removeCardLabelAction: vi.fn(),
  createLabelAction: vi.fn(),
  deleteLabelAction: vi.fn(),
  updateLabelAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

vi.mock(
  "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions",
  () => actions,
);

// ColorPalette is rendered inside the ManageLabelsDialog; stub it so it doesn't
// drag in its own imports.
vi.mock("@/components/boards/color-palette", () => ({
  ColorPalette: () => null,
}));

const user = userEvent.setup({ pointerEventsCheck: 0 });

// ── Helpers ──────────────────────────────────────────────────────────────────

const boardLabels: LabelChip[] = [
  { id: "lbl-1", name: "Bug", color: "#D04648" },
  { id: "lbl-2", name: "Feature", color: "#4A90D9" },
  { id: "lbl-3", name: "Urgent", color: "#F5A623" },
];

function renderSection(
  overrides: Partial<{
    cardId: string;
    boardId: string;
    boardLabels: LabelChip[];
    cardLabelIds: string[];
    canEdit: boolean;
  }> = {},
) {
  return render(
    <CardLabelsSection
      cardId="card-1"
      boardId="board-1"
      boardLabels={boardLabels}
      cardLabelIds={["lbl-1"]}
      canEdit={true}
      {...overrides}
    />,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("CardLabelsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Rendering attached labels -----------------------------------------------

  it("renders attached label chips from cardLabelIds", () => {
    renderSection({ cardLabelIds: ["lbl-1", "lbl-2"] });
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
    expect(screen.queryByText("Urgent")).not.toBeInTheDocument();
  });

  it("shows 'No labels yet' when canEdit is true and no labels attached", () => {
    renderSection({ cardLabelIds: [] });
    expect(screen.getByText("No labels yet")).toBeInTheDocument();
  });

  it("shows 'None' when canEdit is false and no labels attached", () => {
    renderSection({ cardLabelIds: [], canEdit: false });
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  // -- canEdit = true ----------------------------------------------------------

  describe("when canEdit is true", () => {
    it("renders remove buttons on attached label chips", () => {
      renderSection({ cardLabelIds: ["lbl-1"] });
      expect(
        screen.getByRole("button", { name: "Remove Bug" }),
      ).toBeInTheDocument();
    });

    it("renders Add and Manage labels buttons when board labels exist", () => {
      renderSection();
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Manage labels" }),
      ).toBeInTheDocument();
    });

    it("clicking remove on a label chip calls removeCardLabelAction", async () => {
      actions.removeCardLabelAction.mockResolvedValue({ success: true });
      renderSection({ cardLabelIds: ["lbl-1"] });

      await user.click(screen.getByRole("button", { name: "Remove Bug" }));

      await waitFor(() =>
        expect(actions.removeCardLabelAction).toHaveBeenCalledTimes(1),
      );
      const fd = actions.removeCardLabelAction.mock.calls[0][0] as FormData;
      expect(fd.get("cardId")).toBe("card-1");
      expect(fd.get("labelId")).toBe("lbl-1");
    });

    it("shows error text when a remove action fails", async () => {
      actions.removeCardLabelAction.mockResolvedValue({
        success: false,
        error: "Remove failed",
      });
      renderSection({ cardLabelIds: ["lbl-1"] });

      await user.click(screen.getByRole("button", { name: "Remove Bug" }));

      await waitFor(() =>
        expect(screen.getByText("Remove failed")).toBeInTheDocument(),
      );
    });
  });

  // -- canEdit = false ---------------------------------------------------------

  describe("when canEdit is false", () => {
    it("renders label chips without remove buttons", () => {
      renderSection({ cardLabelIds: ["lbl-1", "lbl-2"], canEdit: false });
      expect(screen.getByText("Bug")).toBeInTheDocument();
      expect(screen.getByText("Feature")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Remove Bug" }),
      ).not.toBeInTheDocument();
    });

    it("does not render Add or Manage labels buttons", () => {
      renderSection({ canEdit: false });
      expect(
        screen.queryByRole("button", { name: "Add" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Manage labels" }),
      ).not.toBeInTheDocument();
    });

    it("renders read-only label chips (no mutators)", () => {
      renderSection({ cardLabelIds: ["lbl-1"], canEdit: false });
      // The label name is still rendered as a chip
      expect(screen.getByText("Bug")).toBeInTheDocument();
      // No buttons at all (no remove, no Add, no Manage labels)
      expect(screen.queryAllByRole("button")).toHaveLength(0);
    });
  });

  // -- Attach popover ----------------------------------------------------------

  describe("attach popover", () => {
    it("opens and shows board labels with On/Off state", async () => {
      renderSection({ cardLabelIds: ["lbl-1"] });

      await user.click(screen.getByRole("button", { name: "Add" }));

      expect(screen.getByText("Attach labels")).toBeInTheDocument();
      // Bug is attached → "On"
      expect(screen.getByText("On")).toBeInTheDocument();
      // Feature and Urgent are not → two "Off"
      expect(screen.getAllByText("Off")).toHaveLength(2);
    });

    it("toggling an unattached label calls addCardLabelAction", async () => {
      actions.addCardLabelAction.mockResolvedValue({ success: true });
      renderSection({ cardLabelIds: ["lbl-1"] });

      await user.click(screen.getByRole("button", { name: "Add" }));
      // Feature is not attached; its popover toggle button has accessible name
      // starting with "Feature" (unlike the absent remove button which doesn't
      // start with the label name).
      await user.click(
        screen.getByRole("button", { name: /^Feature/ }),
      );

      await waitFor(() =>
        expect(actions.addCardLabelAction).toHaveBeenCalledTimes(1),
      );
      const fd = actions.addCardLabelAction.mock.calls[0][0] as FormData;
      expect(fd.get("cardId")).toBe("card-1");
      expect(fd.get("labelId")).toBe("lbl-2");
    });

    it("toggling an attached label in the popover calls removeCardLabelAction", async () => {
      actions.removeCardLabelAction.mockResolvedValue({ success: true });
      renderSection({ cardLabelIds: ["lbl-1"] });

      await user.click(screen.getByRole("button", { name: "Add" }));
      // Bug is attached; its popover toggle accessible name is "Bug On".
      // The regex /^Bug/ matches "Bug On" but NOT the remove button
      // whose aria-label is "Remove Bug" (starts with "R").
      await user.click(
        screen.getByRole("button", { name: /^Bug/ }),
      );

      await waitFor(() =>
        expect(actions.removeCardLabelAction).toHaveBeenCalledTimes(1),
      );
      const fd = actions.removeCardLabelAction.mock.calls[0][0] as FormData;
      expect(fd.get("cardId")).toBe("card-1");
      expect(fd.get("labelId")).toBe("lbl-1");
    });
  });
});
