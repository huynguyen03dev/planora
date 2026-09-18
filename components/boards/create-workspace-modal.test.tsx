/**
 * CreateWorkspaceModal — scoped validation + server error announcements
 * (role=alert / aria-invalid / aria-describedby on the workspace-name field).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  createWorkspaceAction: vi.fn(),
}));
const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("@/app/(authenticated)/(dashboard)/boards/actions", () => actions);
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { CreateWorkspaceModal } from "./create-workspace-modal";

const user = userEvent.setup({ pointerEventsCheck: 0 });

function renderModal(onClose: () => void = vi.fn()) {
  render(<CreateWorkspaceModal open onClose={onClose} />);
}

describe("CreateWorkspaceModal — scoped error announcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("announces client validation errors via role=alert wired to the field", async () => {
    renderModal();

    const input = screen.getByLabelText("Workspace name");
    await user.type(input, "x"); // too short (< 2 chars)
    await user.click(screen.getByRole("button", { name: "Create" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Workspace name must be at least 2 characters",
    );
    expect(alert).toHaveAttribute("id", "create-workspace-field-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute(
      "aria-describedby",
      "create-workspace-field-error",
    );
    expect(actions.createWorkspaceAction).not.toHaveBeenCalled();
  });

  it("announces server errors via role=alert and re-links the field", async () => {
    actions.createWorkspaceAction.mockResolvedValueOnce({
      success: false,
      error: "Something went wrong",
    });
    renderModal();

    const input = screen.getByLabelText("Workspace name");
    await user.type(input, "Design Team");
    await user.click(screen.getByRole("button", { name: "Create" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(alert).toHaveAttribute("id", "create-workspace-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute(
      "aria-describedby",
      "create-workspace-error",
    );
  });

  it("clears errors while typing (no stale alert)", async () => {
    renderModal();

    const input = screen.getByLabelText("Workspace name");
    await user.type(input, "x");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByRole("alert");

    await user.type(input, "x");
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});

describe("CreateWorkspaceModal — dialog description (warning-free structure)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("describes the dialog with a DialogDescription wired via aria-describedby", () => {
    renderModal();

    const dialog = screen.getByRole("dialog", { name: "Create workspace" });
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(dialog).toHaveAccessibleDescription(
      "Workspaces group your boards and members together.",
    );

    // The referenced element is the primitive's description node.
    const description = document.getElementById(describedBy!);
    expect(description).toBeInTheDocument();
    expect(description).toHaveTextContent(
      "Workspaces group your boards and members together.",
    );
  });

  it("opens without the Radix missing-description warning", () => {
    // DialogContent always sets aria-describedby to a generated id; Radix
    // console.warns when no DialogDescription element exists with that id.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      renderModal();

      const radixWarnings = warnSpy.mock.calls.filter((args) =>
        args.some(
          (arg) =>
            typeof arg === "string" && /description|aria-describedby/i.test(arg),
        ),
      );
      expect(radixWarnings).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
