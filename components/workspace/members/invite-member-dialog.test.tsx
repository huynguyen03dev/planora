import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The dialog calls a Server Action and uses next/navigation; stub both so the
// test exercises the dialog's own logic, not the server.
const { inviteMemberAction, refresh } = vi.hoisted(() => ({
  inviteMemberAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock(
  "@/app/(authenticated)/(dashboard)/workspace/actions",
  () => ({ inviteMemberAction }),
);

import { InviteMemberDialog } from "./invite-member-dialog";

const user = userEvent.setup({ pointerEventsCheck: 0 });

function renderDialog() {
  return render(<InviteMemberDialog workspaceId="ws-1" />);
}

describe("InviteMemberDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the dialog when the Invite trigger is clicked", async () => {
    renderDialog();

    expect(screen.queryByText("Invite to workspace")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /invite/i }));

    expect(screen.getByText("Invite to workspace")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
  });

  it("disables the submit button when the email is empty", async () => {
    renderDialog();
    await user.click(screen.getByRole("button", { name: /invite/i }));

    const submitButton = screen.getByRole("button", { name: "Send invite" });
    expect(submitButton).toBeDisabled();
  });

  it("submits a valid email with the default role, calls the action, and closes", async () => {
    inviteMemberAction.mockResolvedValue({
      success: true,
      invitationId: "inv-001",
    });
    renderDialog();
    await user.click(screen.getByRole("button", { name: /invite/i }));

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(inviteMemberAction).toHaveBeenCalledTimes(1));

    const formData = inviteMemberAction.mock.calls[0][0] as FormData;
    expect(formData.get("workspaceId")).toBe("ws-1");
    expect(formData.get("email")).toBe("alice@example.com");
    expect(formData.get("role")).toBe("editor");

    await waitFor(() =>
      expect(screen.queryByText("Invite to workspace")).not.toBeInTheDocument(),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces a server error without closing the dialog", async () => {
    inviteMemberAction.mockResolvedValue({
      success: false,
      error: "This user is already a member",
    });
    renderDialog();
    await user.click(screen.getByRole("button", { name: /invite/i }));

    await user.type(
      screen.getByLabelText("Email"),
      "existing@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() =>
      expect(
        screen.getByText("This user is already a member"),
      ).toBeInTheDocument(),
    );
    // Dialog stays open.
    expect(screen.getByText("Invite to workspace")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
