/**
 * ReceivedInvitationsList — accept/decline failures must be announced via a
 * per-invitation role=alert and linked to the action buttons.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  acceptInvitationAction: vi.fn(async (): Promise<
    | { success: true; workspaceId: string }
    | { success: false; error: string }
  > => ({ success: true, workspaceId: "ws-1" })),
  declineInvitationAction: vi.fn(async (): Promise<
    | { success: true }
    | { success: false; error: string }
  > => ({ success: true })),
}));

vi.mock("@/lib/invitation-actions", () => actions);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ReceivedInvitationsList } from "./received-invitations-list";

const user = userEvent.setup({ pointerEventsCheck: 0 });

const invitation = {
  id: "inv-1",
  workspaceId: "ws-1",
  workspaceName: "Design Team",
  email: "jane@example.com",
  role: "editor",
  status: "pending",
  expiresAt: new Date("2099-01-01"),
  createdAt: new Date("2026-01-01"),
  inviterId: "u-1",
  inviterName: "Alice",
  inviterEmail: "alice@example.com",
};

describe("ReceivedInvitationsList — scoped accept/decline errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("announces an accept failure in a role=alert linked to the action buttons", async () => {
    actions.acceptInvitationAction.mockResolvedValueOnce({
      success: false,
      error: "Invitation no longer pending",
    });

    render(<ReceivedInvitationsList invitations={[invitation]} />);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invitation no longer pending");
    expect(alert).toHaveAttribute("id", "invitation-error-inv-1");
    expect(screen.getByRole("button", { name: "Accept" })).toHaveAttribute(
      "aria-describedby",
      "invitation-error-inv-1",
    );
    expect(screen.getByRole("button", { name: "Decline" })).toHaveAttribute(
      "aria-describedby",
      "invitation-error-inv-1",
    );
  });

  it("announces a decline failure in the same per-invitation alert", async () => {
    actions.declineInvitationAction.mockResolvedValueOnce({
      success: false,
      error: "Invitation already accepted",
    });

    render(<ReceivedInvitationsList invitations={[invitation]} />);

    await user.click(screen.getByRole("button", { name: "Decline" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invitation already accepted");
    expect(screen.getByRole("button", { name: "Accept" })).toHaveAttribute(
      "aria-describedby",
      "invitation-error-inv-1",
    );
  });

  it("clears the alert on retry (no duplicate live announcements)", async () => {
    actions.acceptInvitationAction.mockResolvedValueOnce({
      success: false,
      error: "Invitation no longer pending",
    });

    render(<ReceivedInvitationsList invitations={[invitation]} />);

    await user.click(screen.getByRole("button", { name: "Accept" }));
    await screen.findByRole("alert");

    // A successful retry removes the alert entirely.
    actions.acceptInvitationAction.mockResolvedValueOnce({
      success: true,
      workspaceId: "ws-1",
    });
    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
