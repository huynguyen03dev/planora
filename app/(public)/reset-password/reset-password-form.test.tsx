import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ResetPasswordForm } from "./reset-password-form";

const { mockResetPassword } = vi.hoisted(() => ({
  mockResetPassword: vi.fn(),
}));

// Track the pushed URL.
const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams("token=valid-token-123"),
}));

vi.mock("@/lib/auth-client", () => ({
  resetPassword: mockResetPassword,
}));

const user = userEvent.setup({ pointerEventsCheck: 0 });

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the form when token is present", () => {
    render(<ResetPasswordForm />);
    expect(screen.getByText("Set new password")).toBeInTheDocument();
  });



  it("renders new-password input with correct autocomplete and minLength", () => {
    render(<ResetPasswordForm />);

    const passwordInput = screen.getByLabelText("New password");
    expect(passwordInput).toHaveAttribute("autocomplete", "new-password");
    expect(passwordInput).toHaveAttribute("minLength", "8");

    const helper = screen.getByText("Minimum 8 characters");
    expect(helper).toBeInTheDocument();
    expect(helper).toHaveAttribute("id", "pw-help");

    const confirmationInput = screen.getByLabelText("Confirm new password");
    expect(confirmationInput).toHaveAttribute("autocomplete", "new-password");
    expect(confirmationInput).toHaveAttribute("minLength", "8");
  });

  it("applies aria-invalid on password input when there is an error", async () => {
    mockResetPassword.mockResolvedValue({
      error: { message: "Invalid or expired token" },
    });

    render(<ResetPasswordForm />);

      await user.type(screen.getByLabelText("New password"), "newPassword123");
      await user.type(
        screen.getByLabelText("Confirm new password"),
        "newPassword123",
      );
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid or expired token",
      );
    });

    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("calls resetPassword and redirects on success", async () => {
    mockResetPassword.mockResolvedValue({ error: null });

    render(<ResetPasswordForm />);

    await user.type(screen.getByLabelText("New password"), "newPassword123");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "newPassword123",
    );
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith({
        newPassword: "newPassword123",
        token: "valid-token-123",
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/sign-in");
    });
  });

  it("submit button is not disabled on initial render", () => {
    render(<ResetPasswordForm />);
    const button = screen.getByRole("button", { name: "Reset password" });
    expect(button).not.toBeDisabled();
  });

  it("blocks reset and scopes the error when confirmation does not match", async () => {
    render(<ResetPasswordForm />);

    await user.type(screen.getByLabelText("New password"), "newPassword123");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "newPassword124",
    );
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(mockResetPassword).not.toHaveBeenCalled();
  });
});
